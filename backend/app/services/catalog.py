import json

from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.models import City, CulturalLocation, MediaAsset, Route, RouteStop


def seed_catalog(db: Session) -> None:
    raw = json.loads((PROJECT_ROOT / "data/demo/catalog.json").read_text(encoding="utf-8"))
    for item in raw["cities"]:
        existing = db.get(City, item["id"])
        if existing is None:
            db.add(City(id=item["id"], name=item["name"], status=item["status"], data={**item, "source_checked_at": raw["source_checked_at"]}))
        else:
            # Add new preview IDs only; do not overwrite staff edits or status.
            saved = existing.data.get("preview_places", [])
            known = {p["id"] for p in saved}
            additions = [p for p in item.get("preview_places", []) if p["id"] not in known]
            if additions:
                existing.data = {**existing.data, "preview_places": [*saved, *additions]}
    db.flush()
    for item in raw["routes"]:
        if db.get(Route, item["id"]) is None:
            db.add(Route(id=item["id"], city_id=item["city_id"], story_id=item.get("story_id"), name=item["name"], status=item["status"], data=item))
    db.flush()
    for item in raw["routes"]:
        for position, location_id in enumerate(item["stop_ids"], 1):
            if db.get(CulturalLocation, location_id) and db.get(RouteStop, (item["id"], location_id)) is None:
                db.add(RouteStop(route_id=item["id"], location_id=location_id, position=position, required=True))
    for location_id in raw["routes"][0]["stop_ids"]:
        asset_id = "photo-" + location_id
        if db.get(MediaAsset, asset_id) is None:
            location = db.get(CulturalLocation, location_id)
            db.add(MediaAsset(id=asset_id, city_id="suzhou", location_id=location_id, title=location.name + "实景照片待接入", caption="现有背景为艺术化示意，未以其冒充实景摄影。"))
    media_file = PROJECT_ROOT / "data/demo/media.json"
    if media_file.exists():
        for item in json.loads(media_file.read_text(encoding="utf-8")):
            # License verification is technical metadata, never cultural fact review.
            if db.get(MediaAsset, item["id"]) is None:
                db.add(MediaAsset(**item))
    db.flush()


def media_dto(asset: MediaAsset) -> dict:
    approved = bool(asset.url and asset.review_status == "rights_verified" and asset.redistributable and asset.source_url and asset.author and asset.license and asset.license_url and asset.sha256)
    return {"id": asset.id, "city_id": asset.city_id, "location_id": asset.location_id,
            "url": asset.url if approved else None, "title": asset.title, "caption": asset.caption,
            "kind": asset.kind, "source_url": asset.source_url, "author": asset.author,
            "license": asset.license, "license_url": asset.license_url, "attribution": asset.attribution,
            "redistributable": asset.redistributable, "review_status": asset.review_status,
            "sha256": asset.sha256, "version": asset.version, "collected_at": asset.collected_at.isoformat(),
            "displayable": approved, "cultural_review": "not_implied"}
