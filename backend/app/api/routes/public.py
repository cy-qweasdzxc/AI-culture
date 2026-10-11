from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import DomainError
from app.models import CulturalKnowledge, CulturalLocation, Item, Story, StoryNode, User
from app.repositories import catalog
from app.schemas.journey import (
    FinaleAction,
    JourneyAction,
    JourneyStart,
    LocationCheck,
    LocationTrigger,
    ModeAction,
    TaskAnswer,
)
from app.services.journey import (
    add_event,
    arrive_location,
    current_journey,
    enter_finale,
    mutate_journey,
    owned_journey,
    report,
    reset_journey,
    snapshot,
    start_journey,
    verify_task,
)
from app.services.location import check_location
from app.services.session import create_or_restore_session, get_current_user

router = APIRouter(prefix="/api", tags=["journey"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(select(Story.id).limit(1))
    except Exception as error:
        raise DomainError("DATABASE_NOT_READY", "数据库尚未迁移或暂不可用。", 503) from error
    return {"status": "ok", "database": "ready"}


@router.post("/session")
def session(request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = create_or_restore_session(db, request, response)
    journey = current_journey(db, user)
    return {"sessionId": user.id, "snapshot": snapshot(db, journey) if journey else None}


@router.delete("/session")
def clear_session(response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, bool]:
    from app.core.config import get_settings
    db.delete(user)
    db.commit()
    response.delete_cookie(get_settings().session_cookie, path="/")
    return {"deleted": True}


@router.get("/themes")
def themes(db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"items": [story.data for story in catalog.published_stories(db)]}


@router.get("/roles")
def roles(story_id: str = "suzhou-pingjiang", db: Session = Depends(get_db)) -> dict[str, Any]:
    story = db.get(Story, story_id)
    if story is None or story.status != "published":
        raise DomainError("STORY_INVALID", "主题不存在或尚未发布。", 404)
    return {"items": [role.data for role in catalog.characters(db, story_id, "player")]}


@router.get("/journeys/current")
def get_current_journey(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = current_journey(db, user)
    return {"snapshot": snapshot(db, journey) if journey else None}


@router.post("/journeys/start")
def start(body: JourneyStart, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = start_journey(db, user, body.story_id, body.role_id, body.mode)
    return {"snapshot": snapshot(db, journey)}


@router.post("/journeys/reset")
def reset(body: JourneyAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, body.journey_id)
    reset_journey(db, journey, body.state_version)
    return {"snapshot": None}


@router.post("/journeys/mode")
def mode(body: ModeAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, body.journey_id)

    def operation(current):
        current.mode = body.mode
        add_event(current, "mode", f"切换为{'虚拟游览' if body.mode == 'virtual' else '实地探索'}模式")
        return {}

    return mutate_journey(db, journey, body.state_version, body.request_id, "mode", body.model_dump(), operation)


@router.get("/routes/{story_id}")
def route(story_id: str, journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, journey_id)
    if journey.story_id != story_id:
        raise DomainError("ROUTE_INVALID", "路线不属于当前旅程。", 404)
    visible = [spot for spot in catalog.locations(db, story_id) if journey.state_data.get("spotStatus", {}).get(spot.id) != "undiscovered"]
    return {"id": story_id, "spots": [{**spot.data, "coordinateStatus": "verified" if spot.coordinates_verified else "approximate_demo"} for spot in visible], "npcs": [npc.data for npc in catalog.characters(db, story_id, "npc") if any(spot.id in npc.data.get("locationIds", []) for spot in visible)], "snapshot": snapshot(db, journey)}


def requested_location(db: Session, journey, spot_id: str) -> CulturalLocation:
    location = db.get(CulturalLocation, spot_id)
    if location is None or location.story_id != journey.story_id:
        raise DomainError("LOCATION_INVALID", "点位不属于当前旅程。", 404)
    return location


@router.post("/location/check")
def location_check(body: LocationCheck, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, body.journey_id)
    return check_location(journey, requested_location(db, journey, body.spot_id), body)


@router.post("/location/trigger")
def location_trigger(body: LocationTrigger, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, body.journey_id)

    def operation(current):
        location = requested_location(db, current, body.spot_id)
        check = check_location(current, location, body)
        if not check["canTrigger"]:
            if current.state_data.get("spotStatus", {}).get(location.id) == "undiscovered":
                raise DomainError("LOCATION_LOCKED", "请先完成前置点位任务。", 409)
            if body.accuracy_m is not None and body.accuracy_m > min(location.trigger_radius_m, 100):
                raise DomainError("LOCATION_INACCURATE", "定位精度不足，请重试或切换虚拟模式。", 409)
            raise DomainError("LOCATION_TOO_FAR", "尚未进入点位触发范围。", 409)
        return {**arrive_location(db, current, body.spot_id), "location": check}

    return mutate_journey(db, journey, body.state_version, body.request_id, "location", body.model_dump(), operation)


@router.get("/tasks")
def tasks(journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, journey_id)
    state = snapshot(db, journey)
    result = []
    for task in catalog.tasks(db, journey.story_id):
        progress = state["taskStates"][task.id]
        if task.location_id != journey.current_location_id and progress["status"] != "completed":
            continue
        public = {key: value for key, value in task.data.items() if key not in {"answerKey", "password", "sortingAnswer", "explanation"}}
        if progress["status"] == "completed":
            public["explanation"] = task.data.get("explanation", "")
        public["isDemo"] = True
        result.append(public)
    return {"items": result}


@router.post("/tasks/{task_id}/verify")
def task_verify(task_id: str, body: TaskAnswer, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, body.journey_id)
    return mutate_journey(db, journey, body.state_version, body.request_id, f"task:{task_id}", body.model_dump(), lambda current: verify_task(db, current, task_id, body.answer))


@router.get("/clues")
def clues(journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, journey_id)
    state = snapshot(db, journey)
    entries = list(db.scalars(select(Item).where(Item.id.in_(state["inventory"]))))
    return {"items": [entry.data for entry in entries]}


@router.get("/codex")
def codex(journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, journey_id)
    state = snapshot(db, journey)
    result = []
    for entry in db.scalars(select(Item).where(Item.id.in_(state["unlockedCodex"]), Item.kind == "codex")):
        knowledge = db.get(CulturalKnowledge, entry.knowledge_id) if entry.knowledge_id else None
        data = dict(entry.data)
        if knowledge and knowledge.review_status == "reviewed":
            # A newly approved version must never label the old demonstration copy as reviewed.
            data.update(content=knowledge.content, source=knowledge.source, type=knowledge.content_type, title=knowledge.title, summary=knowledge.content[:120])
        result.append({**data, "reviewStatus": knowledge.review_status if knowledge else "pending", "isDemo": knowledge.is_demo if knowledge else True, "sourceUrl": knowledge.source_url if knowledge else "", "license": knowledge.license if knowledge else "【待补充】", "trustLevel": knowledge.trust_level if knowledge else "unverified"})
    total = len(list(db.scalars(select(Item.id).where(Item.story_id == journey.story_id, Item.kind == "codex"))))
    return {"items": result, "total": total}


@router.post("/journeys/finale")
def finale(body: FinaleAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, body.journey_id)
    return mutate_journey(db, journey, body.state_version, body.request_id, "finale", body.model_dump(), lambda current: enter_finale(db, current, body.choice_key))


@router.get("/ending")
def ending(journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    journey = owned_journey(db, user, journey_id)
    node = db.get(StoryNode, journey.ending_id) if journey.ending_id else None
    return {"ending": node.data if node else None, "ruleSnapshot": journey.ending_snapshot}


@router.get("/report")
def journey_report(journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    return report(db, owned_journey(db, user, journey_id))
