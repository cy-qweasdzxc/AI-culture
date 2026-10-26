"""Prepare a scene without provider calls; atomically persist a complete directed turn."""

import copy
import re
from dataclasses import asdict, dataclass
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.agents.npc import PROMPT_VERSION, AgentReply, refuse, respond
from app.ai.agents.scene import SCENE_PROMPT_VERSION, Narration
from app.ai.llm.providers import ChatProvider, EmbeddingProvider, ProviderError
from app.ai.rag.conversation import ConversationTurn, QueryContext, resolve_query
from app.ai.rag.index import approved_records
from app.ai.rag.retrieval import Evidence, Hit, evidence_dto, is_eligible, retrieve_knowledge
from app.ai.safety.policy import POLICY_VERSION, input_risk, redact_log_text
from app.ai.settings import AISettings
from app.core.errors import DomainError
from app.models import Character, CulturalLocation, DialogueLog, SafetyLog, Task, UserTaskState, utcnow
from app.services.journey import add_event, assert_npc_access, grant_item, timestamp_ms


@dataclass(frozen=True)
class PreparedActor:
    id: str
    name: str
    npc: dict
    role: dict
    records: list[Evidence]
    query: QueryContext
    context: dict
    history: list[dict]
    allowed_spots: set[str]
    historical: bool
    log_id: str


@dataclass(frozen=True)
class PreparedScene:
    anchor_id: str
    turn_id: str
    question: str
    actors: dict[str, PreparedActor]
    candidates: list[dict]
    records: list[Evidence]
    next_action: dict
    beat_number: int
    previous_order: list[str]
    public_conversation: list[dict]
    envelope_id: str
    at: int


@dataclass(frozen=True)
class ActorOutput:
    actor: PreparedActor
    reply: AgentReply
    hits: list[Hit]
    retrieval_mode: str = "keyword"
    retrieval_reason: str | None = None


@dataclass(frozen=True)
class ActorMaterial:
    actor: PreparedActor
    hits: list[Hit]
    early_reply: AgentReply | None = None
    retrieval_mode: str = "keyword"
    retrieval_reason: str | None = None


def is_narrative_guidance(question: str) -> bool:
    """Recognize explicit stage controls, never route a cultural question around RAG."""
    normalized = re.sub(r"\s+", "", question).strip("。！？?!，,；;")
    normalized = re.sub(r"(?<=接下来)(?:我该|我应该|应该|该)|(?<=下一步)(?:我该|我应该|应该|该)", "", normalized)
    return normalized in {
        "继续剧情", "请继续剧情", "推进剧情", "请推进剧情", "继续推进剧情", "下一步做什么",
        "接下来做什么", "继续剧情，接下来做什么", "去任务吧", "开始任务", "出发吧",
        "请根据刚才的对话和当前旅程进度继续剧情，安排合适的角色接话",
    }


def narrative_guidance(actor: PreparedActor, direction: dict) -> AgentReply:
    action = direction["nextAction"]
    if action["type"] == "task":
        text = ("先看看眼前这项任务：" + action["label"].removeprefix("查看任务：")
                + "。若还需要线索，可以继续问当前点位的角色；准备好后，再由你打开任务、提交答案。")
    elif action["type"] == "map":
        text = "这一段可以先收住。路线已开放「" + action["label"] + "」，你可以在地图上选择下一站，再去与那里的角色见面。"
    elif action["type"] == "finale":
        text = "我们已经走到可以作尾声选择的位置。你可以进入尾声抉择；最后怎么选，还是由你决定。"
    else:
        text = "先不急着赶路。你可以继续问眼前的线索，也可以回到当前点位，看看已经开放的任务。"
    lead = {"zhou-bo": "好，咱们接着来。", "a-heng": "嗯，先理清下一步。", "xiao-shen": "好，我们把下一步说清楚。"}.get(actor.id, "好，我们继续。")
    return AgentReply(lead + text, "narrative_guidance", "calm", [], "rules", "authored-scene-v1", False,
                      "NARRATIVE_GUIDANCE", [], "authored_story")


def _history_turn(log: DialogueLog) -> ConversationTurn:
    context = log.response.get("query_context", {})
    identifiers = context.get("knowledge_ids", []) if context.get("mode") == "clarification" else log.evidence_ids
    spot = log.response.get("context_spot_id")
    if spot is None:
        spots = {entry.get("spotId") for entry in log.response.get("evidence", [])}
        spot = next(iter(spots)) if len(spots) == 1 else None
    return ConversationTurn(log.user_input, tuple(identifiers), spot)


def _next_action(db: Session, journey, anchor_id: str) -> dict:
    if journey.state == "ENDING_READY":
        return {"type": "finale", "targetId": journey.current_location_id, "label": "进入尾声抉择"}
    tasks = db.execute(select(Task, UserTaskState).join(UserTaskState, Task.id == UserTaskState.task_id).where(
        UserTaskState.journey_id == journey.id, Task.story_id == journey.story_id,
        Task.location_id == journey.current_location_id,
        UserTaskState.status.in_(["available", "active"]),
    ).order_by(Task.id)).all()
    if tasks:
        return {"type": "task", "targetId": tasks[0][0].id, "label": "查看任务：" + tasks[0][0].title}
    statuses = journey.state_data.get("spotStatus", {})
    locations = list(db.scalars(select(CulturalLocation).where(
        CulturalLocation.story_id == journey.story_id,
    ).order_by(CulturalLocation.route_order)))
    following = next((spot for spot in locations if statuses.get(spot.id) == "discovered"), None)
    if following:
        return {"type": "map", "targetId": following.id, "label": "前往" + following.name}
    return {"type": "chat", "targetId": anchor_id, "label": "继续当前对话"}


def prepare_scene(db: Session, journey, anchor_id: str, question: str, participant_ids: list[str] | None,
                  turn_id: str) -> PreparedScene:
    """Copy every ORM value before rollback; no worker ever receives a DB session."""
    assert_npc_access(db, journey, anchor_id)
    all_logs = list(db.scalars(select(DialogueLog).where(
        DialogueLog.journey_id == journey.id,
    ).order_by(DialogueLog.created_at, DialogueLog.id)))
    logs = [log for log in all_logs if not log.response.get("scene_envelope")]
    met = {log.npc_id for log in logs}
    characters = list(db.scalars(select(Character).where(
        Character.story_id == journey.story_id, Character.kind == "npc",
    ).order_by(Character.id)))
    authorized = {npc.id: npc for npc in characters
                  if journey.current_location_id in npc.data.get("locationIds", []) or npc.id in met}
    if participant_ids is not None:
        for identifier in participant_ids:
            if identifier not in authorized:
                raise DomainError("NPC_UNAVAILABLE", "只能邀请当前点位或此前已经交谈过的角色。", 409)
        selected = {anchor_id, *participant_ids}
        authorized = {key: npc for key, npc in authorized.items() if key in selected}
    records = approved_records(db, journey.story_id)
    role = db.get(Character, journey.role_id)
    role_data = copy.deepcopy(role.data) | {"id": role.id, "name": role.name}
    location_names = tuple(db.scalars(select(CulturalLocation.name).where(
        CulturalLocation.story_id == journey.story_id,
        CulturalLocation.id != journey.current_location_id,
    )))
    actors = {}
    candidates = []
    for identifier, npc in authorized.items():
        prior = [log for log in logs if log.npc_id == identifier]
        locations = set(npc.data.get("locationIds", []))
        historical = journey.current_location_id not in locations
        if historical:
            disclosed = {key for log in prior for key in log.evidence_ids}
            # Previously met is not permission to discover new knowledge remotely.
            actor_records = [record for record in records if record.knowledge_id in disclosed
                             and record.spot_id in locations]
            allowed_spots = {record.spot_id for record in actor_records}
            last_spot = next((_history_turn(log).spot_id for log in reversed(prior)
                              if _history_turn(log).spot_id in locations), "")
            spot = last_spot
        else:
            spot = journey.current_location_id
            allowed_spots = {spot}
            actor_records = [record for record in records if record.spot_id == spot]
        recent = prior[-3:]
        turns = [_history_turn(log) for log in recent]
        query = resolve_query(question, actor_records, turns, spot, journey.chapter, location_names)
        eligible = {record.knowledge_id for record in actor_records
                    if is_eligible(record, allowed_spots, journey.chapter)}
        history = [{"user": log.user_input, "npc": log.response.get("dialogue", "")}
                   for log, turn in zip(recent, turns, strict=True)
                   if turn.spot_id == spot and turn.knowledge_ids and set(turn.knowledge_ids).issubset(eligible)
                   and not input_risk(log.user_input)]
        npc_data = copy.deepcopy(npc.data) | {"id": npc.id, "name": npc.name}
        from app.services.experience import agent_context
        context = {**agent_context(journey), "state": journey.state, "spot": spot, "chapter": journey.chapter,
                   "resolved_question": query.query}
        actors[identifier] = PreparedActor(identifier, npc.name, npc_data, role_data, actor_records,
                                           query, context, history, allowed_spots, historical, str(uuid4()))
        candidates.append({"id": identifier, "name": npc.name, "scope": npc.data.get("knowledgeScope", ""),
                           "presence": "recollection" if historical else "present"})
    previous = journey.state_data.get("sceneDirections", {}).get(anchor_id, {})
    beats = journey.state_data.get("sceneBeats", {})
    visited_spots = {key for key, status in journey.state_data.get("spotStatus", {}).items()
                     if status in {"current", "completed"}}
    available_ids = {record.knowledge_id for record in records if is_eligible(record, visited_spots, journey.chapter)}
    public_conversation = []
    for log in all_logs:
        if log.response.get("scene_hidden"):
            continue
        if not input_risk(log.user_input):
            public_conversation.append({"speaker": "玩家", "text": log.user_input})
        if log.response.get("scene_envelope"):
            public_conversation.extend({"speaker": message.get("speakerName", "旁白"), "text": message["text"]}
                                       for message in log.response.get("scene_messages", [])
                                       if not input_risk(message["text"])
                                       and set(message.get("evidenceIds", [])).issubset(available_ids))
        elif (not input_risk(log.response.get("dialogue", ""))
              and set(log.evidence_ids).issubset(available_ids)):
            public_conversation.append({"speaker": authorized[log.npc_id].name if log.npc_id in authorized else "角色",
                                        "text": log.response.get("dialogue", "")})
    prepared = PreparedScene(anchor_id, turn_id, question, actors, candidates, records,
                             _next_action(db, journey, anchor_id), int(beats.get(anchor_id, 0)) + 1,
                             previous.get("speakerOrder", []), public_conversation[-10:], str(uuid4()),
                             timestamp_ms(utcnow()))
    # Release the connection and *all* read locks before director, embedding or actor providers.
    db.rollback()
    return prepared


def retrieve_actor(actor: PreparedActor, question: str, settings: AISettings) -> ActorMaterial:
    from app.services.activities import hint_text
    authored = hint_text(actor.id, actor.context["spot"], question)
    if authored:
        return ActorMaterial(actor, [], AgentReply(authored, "activity_hint", "calm", [], "rules", "authored-activity-v1", False,
                                                  "ACTIVITY_HINT", [], "authored_story"))
    """Pure provider/retrieval preparation, safe to run concurrently for every actor."""
    if risk := input_risk(question):
        return ActorMaterial(actor, [], refuse(risk))
    if is_narrative_guidance(question):
        return ActorMaterial(actor, [])
    query = actor.query
    if query.clarification:
        reply = AgentReply(query.clarification, "clarification", "calm", [], "none", "none", False,
                           "CONTEXT_AMBIGUOUS" if query.knowledge_ids else "CONTEXT_REQUIRED", [])
        return ActorMaterial(actor, [], reply)
    if query.mode == "unavailable":
        return ActorMaterial(actor, [], refuse("CONTEXT_UNAVAILABLE"))
    records = actor.records
    if query.mode == "history":
        records = [record for record in records if record.knowledge_id in query.knowledge_ids]
    vector = None
    retrieval_reason = None
    if settings.embedding_provider != "none" and records:
        try:
            vector = EmbeddingProvider(settings).embed([query.query])[0]
        except ProviderError as error:
            retrieval_reason = str(error)
    hits = retrieve_knowledge(query.query, records, actor.allowed_spots, actor.context["chapter"], vector,
                              settings.embedding_model)
    return ActorMaterial(actor, hits, retrieval_mode="hybrid" if vector else "keyword",
                         retrieval_reason=retrieval_reason)


def generate_actor(actor: PreparedActor, question: str, direction: dict, settings: AISettings,
                   material: ActorMaterial | None = None, public_messages: list[dict] | None = None) -> ActorOutput:
    material = material or retrieve_actor(actor, question, settings)
    from app.services.activities import hint_text
    authored = hint_text(actor.id, actor.context["spot"], question)
    if authored:
        return ActorOutput(actor, AgentReply(authored, "activity_hint", "calm", [], "rules", "authored-activity-v1", False,
                                            "ACTIVITY_HINT", [], "authored_story"), [])
    if not input_risk(question) and is_narrative_guidance(question):
        return ActorOutput(actor, narrative_guidance(actor, direction), [])
    if material.early_reply:
        return ActorOutput(actor, material.early_reply, material.hits,
                           material.retrieval_mode, material.retrieval_reason)
    context = actor.context | {"scene": {"beat": direction["beat"], "objective": direction["objective"],
                                         "speaker_order": direction["speakerOrder"],
                                         "position": direction["speakerOrder"].index(actor.id),
                                         "assignment": actor.npc.get("knowledgeScope", ""),
                                         "public_conversation": (public_messages or [])[-14:]}}
    reply = respond(question, material.hits, actor.npc, actor.role, context, actor.history, ChatProvider(settings))
    return ActorOutput(actor, reply, material.hits, material.retrieval_mode, material.retrieval_reason)


def actor_message(scene: PreparedScene, output: ActorOutput) -> dict:
    reply, actor = output.reply, output.actor
    evidence = [evidence_dto(hit.evidence)
                for hit in output.hits if hit.evidence.knowledge_id in reply.evidence_ids]
    data_scope = "authored_story" if reply.intent in {"narrative_guidance", "activity_hint"} else "reviewed_only"
    return {"id": actor.log_id + "-npc", "from": "npc", "text": reply.dialogue, "at": scene.at,
            "evidenceIds": reply.evidence_ids, "evidence": evidence, "provider": reply.provider,
            "mock": reply.mock, "dataScope": data_scope, "data_scope": data_scope,
            "reason": reply.reason or "", "safetyFlag": "refused" if reply.intent == "refusal" else "ok",
            "npcId": actor.id, "speakerName": actor.name, "agentRole": "character", "turnId": scene.turn_id,
            "feedbackNpcId": actor.id, "feedbackMessageId": actor.log_id + "-npc"}


def narrator_message(scene: PreparedScene, narration: Narration) -> dict:
    return {"id": scene.envelope_id + "-narrator", "from": "narrator", "text": narration.text,
            "at": scene.at, "evidenceIds": [], "evidence": [], "provider": narration.provider,
            "mock": narration.mock, "dataScope": "fiction", "data_scope": "fiction",
            "speakerName": "旁白", "agentRole": "narrator", "turnId": scene.turn_id,
            "safetyFlag": "ok"}


def commit_scene(db: Session, journey, scene: PreparedScene, direction: dict,
                 outputs: list[ActorOutput], messages: list[dict]) -> dict:
    """Called only inside mutate_journey: one CAS covers history, evidence, clues and pacing."""
    assert_npc_access(db, journey, scene.anchor_id)
    current_records = {record.id: record for record in approved_records(db, journey.story_id)}
    used = {key for output in outputs for key in [*output.reply.evidence_ids, *output.actor.query.knowledge_ids]}
    for record in scene.records:
        if record.knowledge_id in used and current_records.get(record.id) != record:
            raise DomainError("EVIDENCE_CHANGED", "资料已更新，请重试以使用最新证据。", 409)
    for output in outputs:
        actor = output.actor
        current = db.get(Character, actor.id)
        if (current is None or current.kind != "npc" or current.story_id != journey.story_id
                or dict(current.data) | {"id": current.id, "name": current.name} != actor.npc):
            raise DomainError("SCENE_CHANGED", "角色资料已更新，请重新发起对话。", 409)
        if actor.historical and db.scalar(select(DialogueLog.id).where(
            DialogueLog.journey_id == journey.id, DialogueLog.npc_id == actor.id,
        ).limit(1)) is None:
            raise DomainError("NPC_UNAVAILABLE", "这位角色尚未与你相识。", 409)
    # Keep existing authored puzzle rules; a director/model can never create these actions.
    clue = None
    if not input_risk(scene.question):
        if scene.anchor_id == "zhou-bo" and journey.current_location_id == "pingjiang" and "平江图" in scene.question:
            clue = "clue-shaoding"
        if scene.anchor_id == "xiao-shen" and journey.current_location_id == "subo" and any(
            word in scene.question for word in ["片石", "白墙", "以壁为纸"]
        ):
            clue = "clue-baibi"
    approved = []
    if clue and grant_item(db, journey, clue, "authored-puzzle:" + scene.anchor_id):
        approved.append({"type": "grant_clue", "id": clue, "origin": "authored_rule"})
    from app.services.activities import authored_hint
    hint, hint_actions = authored_hint(db, journey, scene.anchor_id, scene.question)
    approved.extend(hint_actions)
    if hint:
        anchor_message = next((message for message in messages if message.get("npcId") == scene.anchor_id), None)
        if anchor_message is not None and hint not in anchor_message["text"]:
            anchor_message["text"] += "\n" + hint
    if approved:
        # This confirmation is added only inside the committing transaction. Streamed
        # provisional lines must never claim that inventory has already changed.
        notice = "（已发放演示剧情线索；该道具不代表文化资料完成了人工事实核验。）"
        anchor_message = next((message for message in messages if message.get("npcId") == scene.anchor_id), None)
        if anchor_message is not None:
            anchor_message["text"] += "\n" + notice
        else:
            messages.append({"id": scene.envelope_id + "-system", "from": "system", "text": notice,
                             "at": scene.at, "turnId": scene.turn_id, "evidenceIds": [], "evidence": [],
                             "dataScope": "authored_story", "data_scope": "authored_story", "provider": "rules",
                             "mock": False, "safetyFlag": "ok", "speakerName": "剧情提示"})
    by_id = {message["npcId"]: message for message in messages if message.get("agentRole") == "character"}
    for output in outputs:
        actor, reply = output.actor, output.reply
        result = asdict(reply)
        result.pop("proposed_actions")
        result.update(dialogue=by_id[actor.id]["text"],
                      scene_hidden=True, scene_turn_id=scene.turn_id, scene_anchor=scene.anchor_id,
                      message_id=actor.log_id + "-npc", evidence=by_id[actor.id]["evidence"],
                      approved_actions=approved if actor.id == scene.anchor_id else [],
                      context_spot_id=actor.context["spot"], data_scope=by_id[actor.id]["dataScope"],
                      query_context={"mode": actor.query.mode, "knowledge_ids": list(actor.query.knowledge_ids)},
                      retrieval_mode=output.retrieval_mode, retrieval_reason=output.retrieval_reason)
        db.add(DialogueLog(id=actor.log_id, journey_id=journey.id, npc_id=actor.id,
                           user_input=redact_log_text(scene.question), response=result,
                           evidence_ids=reply.evidence_ids,
                           approved_actions=approved if actor.id == scene.anchor_id else [],
                           provider=reply.provider, model=reply.model, prompt_version=PROMPT_VERSION))
        if reply.proposed_actions:
            db.add(SafetyLog(id=str(uuid4()), journey_id=journey.id, risk_type="ACTION_REJECTED",
                             reason="模型建议不在当前动作白名单中", rule_version=POLICY_VERSION, result="blocked"))
        if reply.reason and reply.reason not in {"API_KEY_MISSING", "NARRATIVE_GUIDANCE", "ACTIVITY_HINT"} and reply.intent != "clarification":
            db.add(SafetyLog(id=str(uuid4()), journey_id=journey.id, risk_type=reply.reason,
                             reason="多人对话输入、证据或输出校验拒答", rule_version=POLICY_VERSION, result="refused"))
    evidence = [entry for message in messages for entry in message.get("evidence", [])]
    user_message = {"id": scene.envelope_id + "-user", "from": "user",
                    "text": redact_log_text(scene.question), "at": scene.at, "turnId": scene.turn_id}
    db.add(DialogueLog(id=scene.envelope_id, journey_id=journey.id, npc_id=scene.anchor_id,
                       user_input=redact_log_text(scene.question), evidence_ids=[], approved_actions=[],
                       response={"scene_envelope": True, "scene_turn_id": scene.turn_id,
                                 "scene_anchor": scene.anchor_id, "scene_user_message": user_message,
                                 "scene_messages": messages, "director": direction, "evidence": evidence},
                       provider=direction.get("provider", "rules"), model="scene-orchestrator-v1",
                       prompt_version=SCENE_PROMPT_VERSION))
    data = copy.deepcopy(journey.state_data)
    data.setdefault("sceneDirections", {})[scene.anchor_id] = direction
    data.setdefault("sceneBeats", {})[scene.anchor_id] = scene.beat_number
    journey.state_data = data
    if journey.state in {"AT_SPOT", "DIALOGUE", "TASK_ACTIVE"}:
        journey.state = "DIALOGUE"
    add_event(journey, "scene", direction["beat"] + "：" + "、".join(output.actor.name for output in outputs))
    return {"director": direction, "messages": messages}
