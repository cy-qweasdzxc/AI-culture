"""Incremental scene events; only a done event confirms an atomic persisted turn."""

import asyncio
import json
from collections.abc import AsyncIterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.ai.agents.npc import refuse
from app.ai.agents.scene import Narration, direct, narrate, narration_choices, rule_direction
from app.ai.llm.providers import ChatProvider
from app.ai.settings import AISettings
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.rate_limit import check_rate
from app.models import User
from app.services.journey import mutate_journey, owned_journey, validate_journey_action
from app.services.scene import (
    ActorMaterial,
    ActorOutput,
    actor_message,
    commit_scene,
    generate_actor,
    narrator_message,
    prepare_scene,
    retrieve_actor,
)
from app.services.session import get_current_user

router = APIRouter(prefix="/api/chat/scene", tags=["Multi-agent scenes"])


class SceneChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journey_id: str
    state_version: int = Field(ge=0)
    request_id: str = Field(min_length=1, max_length=80)
    npc_id: str
    message: str = Field(min_length=1, max_length=1000, validation_alias=AliasChoices("message", "text"))
    participant_ids: list[str] | None = Field(default=None, max_length=12)


def _event(turn_id: str, sequence: int, kind: str, data: dict) -> str:
    # The id remains stable on receipt replay, even for arbitrary Unicode request IDs.
    identifier = quote(turn_id, safe="") + ":" + str(sequence)
    return f"id: {identifier}\nevent: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/stream")
async def scene_chat(body: SceneChatBody, request: Request, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    question = body.message.strip()
    if not question:
        raise DomainError("INPUT_INVALID", "请输入问题。")
    check_rate("chat:" + user.id, 30)
    journey = owned_journey(db, user, body.journey_id)
    payload = body.model_dump()
    action_key = "scene:" + body.npc_id
    replay = validate_journey_action(db, journey, body.state_version, body.request_id, action_key, payload)
    headers = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    if replay is not None:
        db.rollback()

        async def replay_events() -> AsyncIterator[str]:
            sequence = 1
            yield _event(body.request_id, sequence, "status", {
                "phase": "directing", "message": "导演正在安排本轮剧情与发言顺序",
            })
            sequence += 1
            yield _event(body.request_id, sequence, "director", replay["director"])
            sequence += 1
            yield _event(body.request_id, sequence, "status", {
                "phase": "narrating", "speaker_id": "narrator", "speaker_name": "旁白",
                "message": "旁白正在衔接这一幕",
            })
            for message in replay["messages"]:
                # Commit-only inventory confirmations were not provisionally streamed.
                # Keeping them in done/snapshot preserves the original SSE event IDs.
                if message.get("from") == "system":
                    continue
                if message.get("agentRole") == "character":
                    sequence += 1
                    yield _event(body.request_id, sequence, "status", {
                        "phase": "speaking", "speaker_id": message["npcId"],
                        "speaker_name": message["speakerName"], "message": message["speakerName"] + "正在接话",
                    })
                sequence += 1
                yield _event(body.request_id, sequence, "message", message)
            sequence += 1
            yield _event(body.request_id, sequence, "status", {"phase": "committing", "message": "正在保存这一轮剧情"})
            yield _event(body.request_id, sequence + 1, "done", replay)

        return StreamingResponse(replay_events(), media_type="text/event-stream", headers=headers)

    settings = AISettings.configured()
    scene = prepare_scene(db, journey, body.npc_id, question, body.participant_ids, body.request_id)

    async def events() -> AsyncIterator[str]:
        sequence = 0
        pending: list[asyncio.Task] = []

        def emit(kind: str, data: dict) -> str:
            nonlocal sequence
            sequence += 1
            return _event(scene.turn_id, sequence, kind, data)

        async def bounded(function, *args):
            return await asyncio.wait_for(asyncio.to_thread(function, *args), timeout=max(1.0, settings.timeout + 2))

        try:
            yield emit("status", {"phase": "directing", "message": "导演正在安排本轮剧情与发言顺序"})
            try:
                direction = await bounded(direct, question, scene.candidates, scene.anchor_id, scene.turn_id,
                                          scene.beat_number, scene.next_action, scene.previous_order,
                                          ChatProvider(settings), scene.public_conversation)
            except Exception:
                direction = rule_direction(question, scene.candidates, scene.anchor_id, scene.turn_id,
                                           scene.beat_number, scene.next_action, scene.previous_order)
            yield emit("director", direction)
            names = [scene.actors[identifier].name for identifier in direction["speakerOrder"]]
            # Retrieval and embeddings prepare concurrently; speaking follows the director so
            # later characters can see earlier *validated* lines from this very turn.
            materials = {}
            for identifier in direction["speakerOrder"]:
                task = asyncio.create_task(bounded(retrieve_actor, scene.actors[identifier], question, settings))
                pending.append(task)
                materials[identifier] = task
            narration_task = asyncio.create_task(bounded(narrate, question, direction, names, ChatProvider(settings)))
            pending.append(narration_task)
            yield emit("status", {"phase": "narrating", "speaker_id": "narrator", "speaker_name": "旁白",
                                  "message": "旁白正在衔接这一幕"})
            try:
                narration = await narration_task
            except Exception:
                narration = Narration("【剧情旁白 · 虚构】" + narration_choices(direction, names)[0],
                                      "rules", "scene-narrator-v1", False, "rules")
            messages = [narrator_message(scene, narration)]
            yield emit("message", messages[0])
            outputs = []
            public_messages = list(scene.public_conversation)
            public_messages.append({"speaker": "玩家", "text": question})
            for identifier in direction["speakerOrder"]:
                actor = scene.actors[identifier]
                yield emit("status", {"phase": "speaking", "speaker_id": identifier, "speaker_name": actor.name,
                                      "message": actor.name + "正在接话"})
                try:
                    material = await materials[identifier]
                except Exception:
                    material = ActorMaterial(actor, [], refuse("ACTOR_UNAVAILABLE", settings.provider))
                try:
                    output = await bounded(generate_actor, actor, question, direction, settings, material,
                                           list(public_messages))
                except Exception:
                    output = ActorOutput(actor, refuse("ACTOR_UNAVAILABLE", settings.provider), [])
                message = actor_message(scene, output)
                outputs.append(output)
                messages.append(message)
                public_messages.append({"speaker": actor.name, "text": message["text"]})
                yield emit("message", message)
            yield emit("status", {"phase": "committing", "message": "正在保存这一轮剧情"})
            # A disconnect/cancellation before this boundary leaves no logs, receipt or rewards.
            # Once commit succeeds, replay and refresh recover it even if done could not arrive.
            if await request.is_disconnected():
                return
            result = mutate_journey(
                db, journey, body.state_version, body.request_id, action_key, payload,
                lambda current: commit_scene(db, current, scene, direction, outputs, messages),
            )
            yield emit("done", result)
        except asyncio.CancelledError:
            raise
        except DomainError as error:
            yield emit("error", {"code": error.code, "message": error.message})
        except Exception:
            yield emit("error", {"code": "SCENE_UNAVAILABLE", "message": "这一轮未能保存，请恢复进度后重试。"})
        finally:
            for task in pending:
                if not task.done():
                    task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            db.rollback()

    return StreamingResponse(events(), media_type="text/event-stream", headers=headers)
