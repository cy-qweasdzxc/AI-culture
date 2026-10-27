"""Authoritative transitions. CAS, rewards, logs and receipts share one transaction."""
import copy
import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.core.errors import DomainError
from app.models import (
    ActionReceipt,
    Character,
    CulturalKnowledge,
    CulturalLocation,
    DialogueLog,
    Item,
    Route,
    RouteStop,
    Story,
    StoryEdge,
    StoryNode,
    Task,
    User,
    UserCollection,
    UserInventory,
    UserStoryState,
    UserTaskState,
    utcnow,
)
from app.repositories import catalog
from app.services.catalog import publication_scope
from app.services.experience import profile, task_definition, text_answer, validate_profile
from app.services.knowledge import current_citation, refresh_response


def timestamp_ms(value: datetime | None) -> int | None:
    return int(value.replace(tzinfo=UTC).timestamp() * 1000) if value else None


def owned_journey(db: Session, user: User, journey_id: str | None = None) -> UserStoryState:
    query = select(UserStoryState).where(UserStoryState.user_id == user.id)
    if journey_id:
        query = query.where(UserStoryState.id == journey_id)
    else:
        query = query.order_by(UserStoryState.started_at.desc()).limit(1)
    journey = db.scalar(query)
    if journey is None:
        raise DomainError("JOURNEY_NOT_FOUND", "旅程不存在或不属于当前会话。", 404)
    return journey


def current_journey(db: Session, user: User) -> UserStoryState | None:
    return db.scalar(select(UserStoryState).where(UserStoryState.user_id == user.id).order_by(UserStoryState.started_at.desc()).limit(1))



def journey_route(db: Session, journey: UserStoryState) -> Route | None:
    route_id = journey.state_data.get("route_id")
    return db.get(Route, route_id) if route_id else None


def journey_locations(db: Session, journey: UserStoryState) -> list[CulturalLocation]:
    route = journey_route(db, journey)
    if route is None:
        return catalog.locations(db, journey.story_id)
    return list(db.scalars(
        select(CulturalLocation).join(RouteStop, RouteStop.location_id == CulturalLocation.id)
        .where(RouteStop.route_id == route.id, CulturalLocation.story_id == journey.story_id)
        .order_by(RouteStop.position)
    ))


def journey_tasks(db: Session, journey: UserStoryState) -> list[Task]:
    location_ids = [spot.id for spot in journey_locations(db, journey)]
    return list(db.scalars(select(Task).where(Task.story_id == journey.story_id, Task.location_id.in_(location_ids)).order_by(Task.id)))


def add_event(journey: UserStoryState, kind: str, text: str) -> None:
    data = copy.deepcopy(journey.state_data)
    data.setdefault("events", []).append({"at": timestamp_ms(utcnow()), "kind": kind, "text": text})
    journey.state_data = data


def snapshot(db: Session, journey: UserStoryState) -> dict[str, Any]:
    db.flush()
    task_states = list(db.scalars(select(UserTaskState).where(UserTaskState.journey_id == journey.id)))
    task_state_by_id = {state.task_id: state for state in task_states}
    # Old saves do not contain challenges added after the journey started. Reads
    # expose their initial state without writing or changing the journey version.
    for task in journey_tasks(db, journey):
        if task.id not in task_state_by_id:
            task_state_by_id[task.id] = initial_task_state(journey, task)
    inventory = list(db.scalars(select(UserInventory.item_id).where(UserInventory.journey_id == journey.id).order_by(UserInventory.acquired_at, UserInventory.item_id)))
    collections = list(db.scalars(select(UserCollection.item_id).where(UserCollection.journey_id == journey.id).order_by(UserCollection.acquired_at, UserCollection.item_id)))
    messages: dict[str, list[dict[str, Any]]] = {}
    audit = []
    evidence: dict[str, dict[str, Any]] = {}
    knowledge_cache: dict[str, CulturalKnowledge | None] = {}

    def refresh(entries):
        result = []
        for entry in entries:
            if entry["id"] not in knowledge_cache:
                knowledge_cache[entry["id"]] = db.get(CulturalKnowledge, entry["id"])
            result.append(current_citation(entry, knowledge_cache[entry["id"]]))
        return result

    for log in db.scalars(select(DialogueLog).where(DialogueLog.journey_id == journey.id).order_by(DialogueLog.created_at, DialogueLog.id)):
        at = timestamp_ms(log.created_at)
        if log.feedback:
            audit.append({"at": at, "npcId": log.npc_id, "messageId": f"{log.id}-npc", "reason": log.feedback})
        cited = refresh(log.response.get("evidence", []))
        for entry in cited:
            evidence[entry["id"]] = entry
        if log.response.get("scene_hidden"):
            continue
        thread = messages.setdefault(log.response.get("scene_anchor", log.npc_id), [])
        if log.response.get("scene_envelope"):
            thread.append(log.response["scene_user_message"])
            thread.extend({**message, "evidence": refresh(message["evidence"])}
                          if "evidence" in message else dict(message)
                          for message in log.response.get("scene_messages", []))
            continue
        thread.extend([
            {"id": f"{log.id}-user", "from": "user", "text": log.user_input, "at": at},
            {"id": f"{log.id}-npc", "from": "npc", "text": log.response.get("dialogue", ""), "evidenceIds": log.evidence_ids, "evidence": cited, "at": at, "provider": log.provider, "mock": log.response.get("mock", log.provider == "mock"), "dataScope": log.response.get("data_scope", "reviewed_only"), "data_scope": log.response.get("data_scope", "reviewed_only"), "reason": log.response.get("reason", ""), "safetyFlag": log.response.get("safety_flag", "ok")},
        ])
    data = journey.state_data
    return {
        "sessionId": journey.user_id,
        "journeyId": journey.id,
        "storyId": journey.story_id,
        "stateVersion": journey.state_version,
        "roleId": journey.role_id,
        "storyRoleId": journey.role_id,
        "visitMode": journey.mode,
        "audienceMode": profile(journey)["audience_mode"],
        "difficulty": profile(journey)["difficulty"],
        "routeId": profile(journey)["route_id"],
        "mode": journey.mode,
        "state": journey.state,
        "currentSpotId": journey.current_location_id,
        "spotStatus": data.get("spotStatus", {}),
        "activityStates": copy.deepcopy(data.get("activities", {})),
        "taskStates": {t.task_id: {"status": t.status, "attempts": t.attempts, "score": t.score} for t in task_state_by_id.values()},
        "inventory": inventory,
        "unlockedCodex": collections,
        "flags": data.get("flags", {}),
        "events": data.get("events", []),
        "messages": messages,
        "sceneDirections": data.get("sceneDirections", {}),
        "auditLog": audit,
        "evidence": evidence,
        "endingId": journey.ending_id,
        "startedAt": timestamp_ms(journey.started_at),
        "finishedAt": timestamp_ms(journey.finished_at),
    }


def initial_task_state(journey: UserStoryState, task: Task) -> UserTaskState:
    visited = journey.state_data.get("spotStatus", {}).get(task.location_id)
    unlocked = task.location_id == journey.current_location_id or visited in {"current", "completed"}
    return UserTaskState(journey_id=journey.id, task_id=task.id,
                         status="available" if unlocked else "locked", attempts=0, score=0)


def validate_journey_action(
    db: Session, journey: UserStoryState, expected_version: int, request_id: str | None,
    action_key: str, payload: dict[str, Any], allow_completed: bool = False,
) -> dict[str, Any] | None:
    """Read-only preflight; callers must still claim the version when committing."""
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
    if request_id:
        receipt = db.get(ActionReceipt, (journey.id, request_id))
        if receipt:
            if receipt.action != action_key or receipt.payload_hash != fingerprint:
                raise DomainError("IDEMPOTENCY_CONFLICT", "同一 request_id 不能用于不同的操作。", 409)
            # Return the recorded result, but refresh state so delayed retries cannot rewind the client.
            db.refresh(journey)
            return {**refresh_response(db, receipt.response), "snapshot": snapshot(db, journey), "replayed": True}
    if journey.state == "COMPLETED" and not allow_completed:
        raise DomainError("JOURNEY_COMPLETED", "旅程已经结束，请查看结局或重置旅程。", 409)
    if journey.state_version != expected_version:
        raise DomainError("STATE_CONFLICT", "旅程已更新，请刷新状态后重试。", 409, {"stateVersion": journey.state_version})
    return None


def mutate_journey(
    db: Session,
    journey: UserStoryState,
    expected_version: int,
    request_id: str | None,
    action_key: str,
    payload: dict[str, Any],
    operation: Callable[[UserStoryState], dict[str, Any]],
    allow_completed: bool = False,
) -> dict[str, Any]:
    replay = validate_journey_action(db, journey, expected_version, request_id, action_key, payload, allow_completed)
    if replay is not None:
        return replay
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
    claimed = db.execute(update(UserStoryState).where(UserStoryState.id == journey.id, UserStoryState.state_version == expected_version).values(state_version=expected_version + 1).execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        db.rollback()
        raise DomainError("STATE_CONFLICT", "另一请求已更新旅程，请刷新后重试。", 409)
    set_committed_value(journey, "state_version", expected_version + 1)
    try:
        result = operation(journey)
        db.flush()
        response = {**result, "snapshot": snapshot(db, journey)}
        if request_id:
            # The current snapshot is rebuilt on replay; storing it here copies all history
            # once per action and makes receipts grow quadratically with journey length.
            db.add(ActionReceipt(journey_id=journey.id, request_id=request_id, action=action_key, payload_hash=fingerprint, response=result))
        db.commit()
        return response
    except Exception:
        db.rollback()
        raise


def grant_item(db: Session, journey: UserStoryState, item_id: str, source: str) -> bool:
    item = db.get(Item, item_id)
    if item is None or item.story_id != journey.story_id or item.kind not in {"clue", "item"}:
        raise DomainError("ACTION_REJECTED", "线索不属于当前剧情。")
    if db.get(UserInventory, (journey.id, item_id)):
        return False
    db.add(UserInventory(journey_id=journey.id, item_id=item_id, source=source))
    add_event(journey, "clue", f"获得线索：{item.name}（演示剧情）")
    db.flush()
    return True


def unlock_codex(db: Session, journey: UserStoryState, item_id: str, source: str) -> bool:
    item = db.get(Item, item_id)
    if item is None or item.story_id != journey.story_id or item.kind != "codex":
        raise DomainError("ACTION_REJECTED", "图鉴不属于当前剧情。")
    if db.get(UserCollection, (journey.id, item_id)):
        return False
    db.add(UserCollection(journey_id=journey.id, item_id=item_id, source=source))
    add_event(journey, "codex", f"图鉴解锁：{item.name}")
    db.flush()
    return True


def assert_npc_access(db: Session, journey: UserStoryState, npc_id: str) -> Character:
    npc = db.get(Character, npc_id)
    if npc is None or npc.kind != "npc" or npc.story_id != journey.story_id:
        raise DomainError("NPC_INVALID", "NPC 不属于当前主题。", 404)
    if journey.state not in {"AT_SPOT", "DIALOGUE", "TASK_ACTIVE", "CHAPTER_COMPLETE", "ENDING_READY"} or journey.current_location_id not in npc.data.get("locationIds", []):
        raise DomainError("NPC_UNAVAILABLE", "请先到达这位 NPC 所在的点位。", 409)
    return npc


def require_edge(db: Session, journey: UserStoryState, source: str, destination: str) -> StoryEdge:
    edge = db.scalar(select(StoryEdge).where(StoryEdge.story_id == journey.story_id, StoryEdge.from_node_id == source, StoryEdge.to_node_id == destination))
    if edge is None:
        raise DomainError("TRANSITION_INVALID", "当前节点不能进入请求的剧情节点。", 409)
    for task_id in edge.conditions.get("completed_tasks", []):
        progress = db.get(UserTaskState, (journey.id, task_id))
        if progress is None or progress.status != "completed":
            raise DomainError("PREREQUISITE_REQUIRED", "请先完成前置点位的全部任务。", 409)
    return edge


def start_journey(db: Session, user: User, story_id: str, role_id: str, mode: str, audience_mode: str = "adult", difficulty: str | None = None, route_id: str | None = None) -> UserStoryState:
    from app.models import City
    selected = validate_profile(audience_mode, difficulty)
    story = db.get(Story, story_id)
    role = db.get(Character, role_id)
    if story is None or story.status != "published" or story_id not in publication_scope()["stories"]:
        raise DomainError("STORY_INVALID", "主题不存在或尚未发布。", 404)
    if role is None or role.kind != "player" or role.story_id != story_id:
        raise DomainError("ROLE_INVALID", "该角色不能进入当前主题。")
    route = db.get(Route, route_id) if route_id else db.scalar(select(Route).where(Route.story_id == story_id, Route.status == "open", Route.id.in_(publication_scope()["routes"])).order_by(Route.id))
    city = db.get(City, route.city_id) if route else None
    if route is None or route.id not in publication_scope()["routes"] or route.story_id != story_id or route.status != "open" or not route.data.get("completes_story") or city is None or city.status != "open":
        raise DomainError("ROUTE_UNAVAILABLE", "请选择已开放且包含完整任务的路线。", 409)
    if current_journey(db, user):
        raise DomainError("JOURNEY_EXISTS", "已有保存的旅程，请恢复或先重置。", 409)
    spots = catalog.locations(db, story_id)
    if not spots:
        raise DomainError("ROUTE_UNAVAILABLE", "主题没有可用路线。", 409)
    journey = UserStoryState(id=str(uuid4()), user_id=user.id, story_id=story_id, role_id=role_id, mode=mode, state="EXPLORING", current_node_id="journey-start", state_version=1, state_data={"spotStatus": {spot.id: "discovered" if i == 0 else "undiscovered" for i, spot in enumerate(spots)}, "flags": {}, "events": []})
    db.add(journey)
    journey.state_data = {**journey.state_data, "profile": selected, "route_id": route.id}
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        if current_journey(db, user):
            raise DomainError("JOURNEY_EXISTS", "另一请求已经创建旅程，请恢复已有进度。", 409) from error
        raise
    for task in catalog.tasks(db, story_id):
        db.add(UserTaskState(journey_id=journey.id, task_id=task.id, status="locked", attempts=0, score=0))
    grant_item(db, journey, role.data["startClueId"], "role")
    add_event(journey, "journey", f"以「{role.name}」出发，模式：{'虚拟游览' if mode == 'virtual' else '实地探索'}（演示路线）")
    add_event(journey, "spot", f"点位已发现：{spots[0].name}")
    db.commit()
    return journey


def arrive_location(db: Session, journey: UserStoryState, location_id: str) -> dict[str, Any]:
    spots = journey_locations(db, journey)
    spot = next((candidate for candidate in spots if candidate.id == location_id), None)
    if spot is None:
        raise DomainError("LOCATION_INVALID", "点位不属于当前主题。", 404)
    status = journey.state_data.get("spotStatus", {}).get(location_id)
    if status not in {"discovered", "current", "completed"}:
        raise DomainError("LOCATION_LOCKED", "请先完成前置点位任务。", 409)
    if journey.state not in {"EXPLORING", "AT_SPOT", "DIALOGUE", "TASK_ACTIVE", "CHAPTER_COMPLETE", "ENDING_READY"}:
        raise DomainError("TRANSITION_INVALID", "当前状态不能触发点位。", 409)
    target = f"spot-{location_id}"
    if status == "discovered":
        position = next(index for index, candidate in enumerate(spots) if candidate.id == location_id)
        route = journey_route(db, journey)
        story = db.get(Story, journey.story_id)
        start_node = (route.data.get("start_node_id") if route else None) or story.data.get("start_node_id", "journey-start")
        source = start_node if position == 0 else f"spot-{spots[position - 1].id}"
        require_edge(db, journey, source, target)
    # A visited unfinished stop can be revisited after exploring a completed stop.
    elif status not in {"current", "completed"} and journey.current_node_id != target:
        raise DomainError("TRANSITION_INVALID", "当前剧情节点与请求点位不匹配。", 409)
    data = copy.deepcopy(journey.state_data)
    if status != "completed":
        data["spotStatus"][location_id] = "current"
    journey.state_data = data
    journey.current_location_id = location_id
    journey.current_node_id = target
    journey.chapter = max(journey.chapter, next(index for index, candidate in enumerate(spots) if candidate.id == location_id) + 1)
    journey.state = "AT_SPOT"
    for task in db.scalars(select(Task).where(Task.location_id == location_id, Task.story_id == journey.story_id)):
        progress = db.get(UserTaskState, (journey.id, task.id))
        if progress and progress.status == "locked":
            progress.status = "available"
    add_event(journey, "spot", f"到达点位：{spot.name}")
    return {"ok": True}


def verify_task(db: Session, journey: UserStoryState, task_id: str, answer: Any) -> dict[str, Any]:
    task = db.get(Task, task_id)
    if task is None or task.story_id != journey.story_id or task not in journey_tasks(db, journey):
        raise DomainError("TASK_NOT_FOUND", "任务不存在。", 404)
    progress = db.get(UserTaskState, (journey.id, task_id))
    if progress is None:
        progress = initial_task_state(journey, task)
        db.add(progress)
        db.flush()
    if progress is None or progress.status == "locked" or journey.current_location_id != task.location_id:
        raise DomainError("TASK_UNAVAILABLE", "请先到达任务所在点位。", 409)
    if progress.status == "completed":
        raise DomainError("TASK_COMPLETED", "该任务已完成，奖励不会重复发放。", 409)
    if journey.state not in {"AT_SPOT", "DIALOGUE", "TASK_ACTIVE", "CHAPTER_COMPLETE", "ENDING_READY"}:
        raise DomainError("TRANSITION_INVALID", "当前状态不能提交任务。", 409)
    require_edge(db, journey, f"spot-{task.location_id}", task.node_id)
    preserve_chapter_state = (
        task.data.get("optional", False)
        and journey.state_data.get("spotStatus", {}).get(task.location_id) == "completed"
    )
    definition, rule = task_definition(task, journey)
    task_type = definition.get("type", task.type)
    inventory = set(db.scalars(select(UserInventory.item_id).where(UserInventory.journey_id == journey.id)))
    missing = [clue for clue in rule.get("requiredClues", []) if clue not in inventory]
    if missing:
        return {"ok": False, "feedback": "线索不足，请先与当前点位的 NPC 对话。", "missingClues": missing}
    if task_type in {"quiz", "combine", "observation"}:
        correct = isinstance(answer, str) and answer == rule.get("answerKey")
    elif task_type == "multi_select":
        expected = rule.get("answerKeys", [])
        correct = (
            isinstance(answer, list)
            and all(isinstance(key, str) for key in answer)
            and len(answer) == len(set(answer))
            and set(answer) == set(expected)
            and len(answer) == len(expected)
        )
    elif task_type == "matching":
        expected = rule.get("matchingAnswer", {})
        correct = (
            isinstance(answer, dict)
            and all(isinstance(left, str) and isinstance(right, str) for left, right in answer.items())
            and set(answer) == set(expected)
            and len(set(answer.values())) == len(answer)
            and answer == expected
        )
    elif task_type == "password":
        correct = isinstance(answer, (str, int)) and (text_answer(str(answer)) == text_answer(rule.get("password", "")) if definition.get("answerMode") == "text" else str(answer).strip() == rule.get("password"))
    elif task_type == "sorting":
        correct = isinstance(answer, list) and all(type(index) is int for index in answer) and answer == rule.get("sortingAnswer")
    else:
        raise DomainError("TASK_TYPE_UNSUPPORTED", "当前任务类型尚不支持验证。", 409)
    progress.attempts += 1
    progress.answer = answer
    if not preserve_chapter_state:
        journey.state = "TASK_ACTIVE"
    if not correct:
        add_event(journey, "task", f"任务尝试：{task.title}（答案待修正）")
        return {"ok": False, "feedback": "答案还不对。请查看演示点位介绍或已有线索，再试一次。"}
    progress.status = "completed"
    progress.score = definition["knowledgeScore"]
    add_event(journey, "task", f"完成任务：{task.title}（知识分 +{progress.score}）")
    if reward := task.rewards.get("rewardClueId"):
        grant_item(db, journey, reward, f"task:{task.id}")
    for item_id in task.rewards.get("rewardCodexIds", []):
        unlock_codex(db, journey, item_id, f"task:{task.id}")
    db.flush()
    at_spot = list(db.scalars(select(Task).where(Task.story_id == journey.story_id, Task.location_id == task.location_id)))
    required_at_spot = [candidate for candidate in at_spot if not candidate.data.get("optional", False)]
    states = {state.task_id: state for state in db.scalars(select(UserTaskState).where(UserTaskState.journey_id == journey.id))}
    required_complete = all(candidate.id in states and states[candidate.id].status == "completed" for candidate in required_at_spot)
    if required_complete and journey.state_data.get("spotStatus", {}).get(task.location_id) != "completed":
        data = copy.deepcopy(journey.state_data)
        data["spotStatus"][task.location_id] = "completed"
        spots = journey_locations(db, journey)
        position = next(index for index, spot in enumerate(spots) if spot.id == task.location_id)
        if position + 1 < len(spots):
            following = spots[position + 1]
            require_edge(db, journey, f"spot-{task.location_id}", f"spot-{following.id}")
            if data["spotStatus"].get(following.id) == "undiscovered":
                data["spotStatus"][following.id] = "discovered"
        journey.state_data = data
        journey.state = "CHAPTER_COMPLETE" if position + 1 < len(spots) else "ENDING_READY"
        add_event(journey, "spot", f"点位完成：{spots[position].name}")
        if position + 1 < len(spots):
            add_event(journey, "spot", f"点位已发现：{spots[position + 1].name}")
    return {"ok": True, "feedback": f"演示任务答对了。{task.data.get('explanation', '')}", "isDemo": True}


def enter_finale(db: Session, journey: UserStoryState, choice_key: str) -> dict[str, Any]:
    route = journey_route(db, journey)
    spots = journey_locations(db, journey)
    story = db.get(Story, journey.story_id)
    finale_location_id = (route.data.get("finale_location_id") if route else None) or story.data.get("finale_location_id", "subo")
    finale_node_id = (route.data.get("finale_node_id") if route else None) or story.data.get("finale_node_id", "finale")
    final_codex_id = route.data.get("final_codex_id") if route and "final_codex_id" in route.data else story.data.get("final_codex_id", "codex-shouyuandeng")
    if not spots or journey.current_location_id != spots[-1].id or journey.current_location_id != finale_location_id or journey.state not in {"AT_SPOT", "DIALOGUE", "TASK_ACTIVE", "ENDING_READY"}:
        raise DomainError("ENDING_NOT_READY", "请先到达路线尾声点位。", 409)
    require_edge(db, journey, f"spot-{finale_location_id}", finale_node_id)
    states = {state.task_id: state for state in db.scalars(select(UserTaskState).where(UserTaskState.journey_id == journey.id))}
    all_done = all(task.id in states and states[task.id].status == "completed"
                   for task in journey_tasks(db, journey) if not task.data.get("optional", False))
    edges = list(db.scalars(select(StoryEdge).where(StoryEdge.story_id == journey.story_id, StoryEdge.from_node_id == finale_node_id, StoryEdge.choice_key == choice_key).order_by(StoryEdge.priority.desc(), StoryEdge.id)))
    edge = next((candidate for candidate in edges if candidate.conditions.get("all_tasks_complete") is all_done), None)
    if edge is None:
        raise DomainError("TRANSITION_INVALID", "尾声选择没有合法结局。", 409)
    ending = db.get(StoryNode, edge.to_node_id)
    if ending is None or ending.kind != "ending":
        raise DomainError("ENDING_UNAVAILABLE", "结局配置不可用。", 409)
    data = copy.deepcopy(journey.state_data)
    data.setdefault("flags", {})["finalChoice"] = choice_key
    journey.state_data = data
    journey.ending_id = ending.id
    journey.current_node_id = ending.id
    journey.state = "COMPLETED"
    journey.finished_at = utcnow()
    add_event(journey, "choice", f"尾声选择：{'把灯挂上长廊' if choice_key == 'hang' else '把灯收进行囊'}")
    add_event(journey, "ending", f"达成结局：{ending.data['name']}")
    if final_codex_id and db.get(Item, final_codex_id):
        unlock_codex(db, journey, final_codex_id, "ending")
    journey.ending_snapshot = {"endingId": ending.id, "choiceKey": choice_key, "allTasksComplete": all_done, "knowledgeScore": sum(state.score for state in db.scalars(select(UserTaskState).where(UserTaskState.journey_id == journey.id))), "ruleVersion": "frontend-demo-v1"}
    return {"ending": ending.data}


def reset_journey(db: Session, journey: UserStoryState, expected_version: int) -> None:
    removed = db.execute(delete(UserStoryState).where(UserStoryState.id == journey.id, UserStoryState.state_version == expected_version))
    if removed.rowcount != 1:
        db.rollback()
        raise DomainError("STATE_CONFLICT", "旅程已更新，请刷新后重试。", 409)
    db.commit()


def report(db: Session, journey: UserStoryState) -> dict[str, Any]:
    from app.services.activities import activity_report
    state = snapshot(db, journey)
    tasks = journey_tasks(db, journey)
    spots = journey_locations(db, journey)
    progress = state["taskStates"]
    by_spot = [{"spotId": spot.id, "completed": sum(progress[t.id]["status"] == "completed" for t in tasks if t.location_id == spot.id), "total": sum(t.location_id == spot.id for t in tasks), "score": sum(progress[t.id]["score"] for t in tasks if t.location_id == spot.id)} for spot in spots]
    codex_total = len(list(db.scalars(select(Item).where(Item.story_id == journey.story_id, Item.kind == "codex"))))
    end = state["finishedAt"] or timestamp_ms(utcnow())
    required_tasks = [task for task in tasks if not task.data.get("optional", False)]
    optional_tasks = [task for task in tasks if task.data.get("optional", False)]

    def completed(group: list[Task]) -> int:
        return sum(progress[task.id]["status"] == "completed" for task in group)

    def score(group: list[Task]) -> int:
        return sum(progress[task.id]["score"] for task in group)

    def max_score(group: list[Task]) -> int:
        return sum(task_definition(task, journey)[0]["knowledgeScore"] for task in group)

    activities = activity_report(journey, {spot.id for spot in spots})
    knowledge_score, maximum = score(tasks), max_score(tasks)
    return {
        **activities,
        "totalScore": knowledge_score + activities["optionalScore"],
        "totalMaxScore": maximum + activities["optionalMaxScore"],
        "knowledgeScore": knowledge_score,
        "maxScore": maximum,
        "requiredTaskScore": score(required_tasks),
        "requiredTaskMaxScore": max_score(required_tasks),
        "optionalTaskScore": score(optional_tasks),
        "optionalTaskMaxScore": max_score(optional_tasks),
        "audienceMode": state["audienceMode"],
        "difficulty": state["difficulty"],
        "routeId": state["routeId"],
        "storyRoleId": journey.role_id,
        "visitMode": journey.mode,
        "completedTaskCount": completed(tasks),
        "totalTaskCount": len(tasks),
        "requiredTaskCount": len(required_tasks),
        "optionalTaskCount": len(optional_tasks),
        "completedRequiredTaskCount": completed(required_tasks),
        "completedOptionalTaskCount": completed(optional_tasks),
        "completedSpotCount": sum(s == "completed" for s in state["spotStatus"].values()),
        "totalSpotCount": len(spots),
        "unlockedCodexCount": len(state["unlockedCodex"]),
        "totalCodexCount": codex_total,
        "startedAt": state["startedAt"],
        "finishedAt": state["finishedAt"],
        "durationMinutes": round((end - state["startedAt"]) / 60000, 1),
        "roleId": journey.role_id,
        "endingId": journey.ending_id,
        "events": state["events"],
        "bySpot": by_spot,
        "weakPoints": [{"taskId": t.id, "title": t.title, "attempts": progress[t.id]["attempts"]}
                       for t in tasks if progress[t.id]["attempts"] > 1],
        "isDemo": True,
        "metricSource": "persisted_journey",
    }
