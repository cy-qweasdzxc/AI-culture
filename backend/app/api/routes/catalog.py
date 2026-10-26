from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.admin import authenticated
from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.rate_limit import check_rate
from app.models import City, CulturalLocation, MediaAsset, Route, RouteStop, User
from app.services.catalog import media_dto
from app.services.journey import owned_journey
from app.services.navigation import walking_route
from app.services.session import get_current_user

router = APIRouter(prefix="/api", tags=["city and media catalog"])


def city_or_error(db: Session, city_id: str) -> City:
    city = db.get(City, city_id)
    if city is None:
        raise DomainError("CITY_NOT_FOUND", "城市不存在。", 404)
    return city


@router.get("/cities")
def cities(db: Session = Depends(get_db)):
    return {"items": [{**c.data, "id": c.id, "name": c.name, "status": c.status} for c in db.scalars(select(City).order_by(City.id))]}


@router.get("/cities/{city_id}")
def city_detail(city_id: str, db: Session = Depends(get_db)):
    c = city_or_error(db, city_id)
    return {**c.data, "id": c.id, "name": c.name, "status": c.status}


def route_dto(db: Session, route: Route) -> dict:
    stops = list(db.scalars(select(RouteStop).where(RouteStop.route_id == route.id).order_by(RouteStop.position)))
    city = db.get(City, route.city_id)
    return {**route.data, "id": route.id, "city_id": route.city_id, "name": route.name, "status": route.status,
            "story_id": route.story_id, "playable": city is not None and city.status == "open" and route.status == "open" and bool(route.data.get("completes_story")),
            "stops": [{"id": s.location_id, "position": s.position, "required": s.required} for s in stops]}


@router.get("/cities/{city_id}/routes")
def city_routes(city_id: str, db: Session = Depends(get_db)):
    city_or_error(db, city_id)
    return {"items": [route_dto(db, r) for r in db.scalars(select(Route).where(Route.city_id == city_id).order_by(Route.id))]}


class RecommendationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    city_id: str = Field(default="suzhou", max_length=80)
    journey_id: str | None = None
    audience_mode: Literal["child", "student", "adult"] = "adult"
    difficulty: Literal["easy", "normal", "advanced"] = "normal"
    time_budget_minutes: int | None = Field(default=None, ge=15, le=720)
    interests: list[Literal["architecture", "history", "opera", "story"]] = Field(default_factory=list, max_length=4)


@router.post("/routes/recommend")
def recommendations(body: RecommendationBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.services.recommendation import recommend_routes
    city = city_or_error(db, body.city_id)
    completed = set()
    if body.journey_id:
        journey = owned_journey(db, user, body.journey_id)
        linked = db.scalar(select(Route).where(Route.city_id == city.id, Route.story_id == journey.story_id))
        if linked is None:
            raise DomainError("ROUTE_CITY_MISMATCH", "旅程不属于所选城市。", 422)
        completed = {key for key, value in journey.state_data.get("spotStatus", {}).items() if value == "completed"}
    return recommend_routes(db, city, body.audience_mode, body.difficulty, body.time_budget_minutes, body.interests, completed)


@router.get("/cities/{city_id}/places")
def places(city_id: str, db: Session = Depends(get_db)):
    city = city_or_error(db, city_id)
    # PostgreSQL JSON has no equality operator: avoid DISTINCT over full model rows.
    location_ids = select(RouteStop.location_id).join(Route).where(Route.city_id == city_id)
    locations = db.scalars(select(CulturalLocation).where(CulturalLocation.id.in_(location_ids)).order_by(CulturalLocation.route_order)).all()
    known_ids = {p.id for p in locations}
    previews = [p for p in city.data.get("preview_places", []) if p.get("id") not in known_ids]
    return {"items": [{"id": p.id, "name": p.name, "status": "open", "intro": p.data.get("intro", ""), "note": p.data.get("note", ""), "source_url": p.data.get("source_url") or p.data.get("sourceUrl", ""), "coordinate_system": "gcj02", "coordinate_status": "verified" if p.coordinates_verified else "approximate_demo", "lat": p.lat, "lng": p.lng, "entrance_verified": False, "opening_status": "unknown", "source_checked_at": p.data.get("source_checked_at") or p.data.get("sourceCheckedAt")} for p in locations] + previews}


@router.get("/places/{location_id}/media")
def public_media(location_id: str, db: Session = Depends(get_db)):
    if db.get(CulturalLocation, location_id) is None:
        raise DomainError("PLACE_NOT_FOUND", "景点不存在。", 404)
    return {"items": [media_dto(a) for a in db.scalars(select(MediaAsset).where(MediaAsset.location_id == location_id).order_by(MediaAsset.id))]}


@router.get("/admin/media")
def admin_media(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    return {"items": [media_dto(a) for a in db.scalars(select(MediaAsset).order_by(MediaAsset.id))]}


class MediaBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    city_id: str
    location_id: str | None = None
    url: str = Field(max_length=2000)
    title: str = Field(min_length=1, max_length=240)
    caption: str = Field(default="", max_length=2000)
    kind: Literal["photograph", "illustration"] = "photograph"
    source_url: str = Field(default="", max_length=2000)
    author: str = Field(default="", max_length=500)
    license: str = Field(default="", max_length=500)
    license_url: str = Field(default="", max_length=2000)
    attribution: str = Field(default="", max_length=1000)
    redistributable: bool = False
    review_status: Literal["pending", "rights_verified", "rejected"] = "pending"
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")

    @field_validator("url", "source_url", "license_url")
    @classmethod
    def safe_url(cls, value: str, info: ValidationInfo):
        from urllib.parse import urlsplit
        if not value or (info.field_name == "url" and value.startswith("/assets/") and ".." not in value and "\\" not in value):
            return value
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Use an HTTPS source or a local /assets/ resource")
        return value


@router.post("/admin/media", status_code=201)
def create_media(body: MediaBody, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    city_or_error(db, body.city_id)
    if body.location_id:
        linked = db.scalar(select(RouteStop).join(Route).where(Route.city_id == body.city_id, RouteStop.location_id == body.location_id))
        if linked is None:
            raise DomainError("MEDIA_CITY_MISMATCH", "媒体不能关联其他城市的景点。", 422)
    if body.review_status == "rights_verified" and not all((body.redistributable, body.source_url, body.author, body.license, body.license_url, body.sha256)):
        raise DomainError("MEDIA_RIGHTS_REQUIRED", "发布实景图片需要完整的来源、许可、作者与文件校验信息。", 422)
    if db.get(MediaAsset, body.id):
        raise DomainError("MEDIA_EXISTS", "媒体 ID 已存在。", 409)
    asset = MediaAsset(**body.model_dump())
    db.add(asset)
    db.commit()
    return media_dto(asset)


class WalkingBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journey_id: str
    route_id: str | None = None
    stop_ids: list[str] | None = Field(default=None, max_length=8)


@router.post("/navigation/walking")
def navigation(body: WalkingBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_rate("walking:" + user.id, 6)
    journey = owned_journey(db, user, body.journey_id)
    route_id = body.route_id or journey.state_data.get("route_id")
    route = db.get(Route, route_id) if route_id else db.scalar(select(Route).where(Route.story_id == journey.story_id, Route.status == "open").order_by(Route.id))
    if route is None or route.story_id != journey.story_id or route.status not in {"open", "demo"}:
        raise DomainError("ROUTE_UNAVAILABLE", "路线未开放或不属于当前城市。", 409)
    if not route.data.get("onsite_ready", False):
        raise DomainError("ONSITE_UNAVAILABLE", "该路线的点位入口和步行顺序尚未核验，暂不提供现场导航。", 409)
    stops = list(db.scalars(select(RouteStop).where(RouteStop.route_id == route.id).order_by(RouteStop.position)))
    allowed = [s.location_id for s in stops]
    ids = body.stop_ids if body.stop_ids is not None else allowed
    if len(set(ids)) != len(ids) or any(i not in allowed for i in ids) or ids != sorted(ids, key=allowed.index):
        raise DomainError("ROUTE_STOPS_INVALID", "只能按已定义次序使用本路线的合法点位。", 422)
    points = []
    for location_id in ids:
        place = db.get(CulturalLocation, location_id)
        points.append({"lat": place.lat, "lng": place.lng})
    db.rollback()  # No SQL transaction or pool connection is held during provider I/O.
    settings = get_settings()
    return {**walking_route(points, settings.tmap_web_service_key, settings.tmap_timeout_seconds), "stop_ids": ids}
