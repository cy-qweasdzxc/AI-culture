"""Deterministic recommendation over persisted, ordered routes; never creates story edges."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import City, CulturalLocation, Route, RouteStop
from app.services.catalog import publication_scope


def recommend_routes(db: Session, city: City, audience: str, difficulty: str, budget: int | None, interests: list[str], completed: set[str]) -> dict:
    results, unavailable = [], []
    for route in db.scalars(select(Route).where(Route.city_id == city.id, Route.id.in_(publication_scope()["routes"])).order_by(Route.id)):
        if city.status not in {"open", "demo"} or route.status not in {"open", "demo"}:
            unavailable.append({"route_id": route.id, "status": route.status, "reason": "点位或内容仍在建设，尚未开放"})
            continue
        stops = list(db.scalars(select(RouteStop).where(RouteStop.route_id == route.id).order_by(RouteStop.position)))
        if not stops or any(db.get(CulturalLocation, stop.location_id) is None for stop in stops):
            continue
        complete_story = route.status == "open" and bool(route.data.get("completes_story"))
        reasons = ["采用服务端已定义的点位顺序，保留线索与任务前置条件"]
        score = 10 if complete_story else 0
        if budget is not None and budget <= 60 and not complete_story:
            score += 20
            reasons.append("时间较少，优先展示前两站片段；实际耗时未知，请按现场情况安排")
        if complete_story:
            reasons.append("可完成现有主线与结局")
        else:
            reasons.append("仅片段预览；完整结局仍需按经典主线完成必要任务")
        if audience == "child":
            reasons.append("可选简单任务；实地体验需要监护人陪同")
        if interests:
            reasons.append("兴趣用于展示偏好，不改变合法任务依赖")
        results.append({"route_id": route.id, "name": route.name, "city_id": city.id, "status": route.status,
                        "stop_ids": [stop.location_id for stop in stops],
                        "completed_stop_ids": [stop.location_id for stop in stops if stop.location_id in completed],
                        "estimated_visit_minutes": route.data.get("estimated_visit_minutes"),
                        "walking_distance_m": route.data.get("walking_distance_m"), "walking_duration_minutes": None,
                        "audience_mode": audience, "difficulty": difficulty, "reasons": reasons,
                        "playable": complete_story, "preview_only": not complete_story,
                        "has_optional_branches": bool(city.data.get("preview_places")),
                        "optional_branch_status": "building", "opening_status": "unknown",
                        "source_checked_at": city.data.get("source_checked_at"), "opening_checked_at": None,
                        "safety": ["开放与预约安排请以景点最新公告为准", "示意坐标不等于已核验的游客入口"], "rank_score": score})
    results.sort(key=lambda row: (-row["rank_score"], row["route_id"]))
    for row in results:
        row.pop("rank_score")
    return {"provider": "rules", "model_calls": 0, "city_id": city.id, "items": results, "unavailable": unavailable,
            "distance_source": "unknown", "note": "无模型时使用可解释规则；实际道路导航需单独成功调用地图服务。"}
