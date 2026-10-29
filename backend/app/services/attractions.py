"""Read-only source candidates; no seed writes, review grants or RAG publication."""
import json
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from app.core.config import PROJECT_ROOT
from app.core.errors import DomainError


class Attraction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,99}$")
    name: str = Field(min_length=1, max_length=200)
    district: str = ""
    region: str = ""
    category: str = ""
    address: str = ""
    lat: FiniteFloat = Field(ge=-90, le=90)
    lng: FiniteFloat = Field(ge=-180, le=180)
    intro: str = ""
    note: str = ""
    tags: list[str] = Field(default_factory=list)
    source_name: str = ""
    source_url: str = ""
    source_checked_at: str = ""


class Candidate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,99}$")
    location_id: str
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=30000)
    content_type: str
    category: str = ""
    source: str = ""
    source_url: str = ""
    license: str = ""
    source_checked_at: str = ""


@lru_cache(maxsize=1)
def preview_catalog() -> tuple[tuple[Attraction, ...], tuple[Candidate, ...]]:
    root = PROJECT_ROOT / "data/suzhou"
    places = json.loads((root / "attractions.json").read_text(encoding="utf-8"))
    knowledge = json.loads((root / "knowledge.json").read_text(encoding="utf-8"))
    if places.get("schema_version") != 1 or knowledge.get("schema_version") != 1:
        raise ValueError("Unsupported preview schema")
    rows = tuple(Attraction.model_validate(p) for p in places["attractions"])
    candidates = tuple(Candidate.model_validate(k) for k in knowledge["items"])
    ids = {p.id for p in rows}
    if len(ids) != len(rows) or len({k.id for k in candidates}) != len(candidates):
        raise ValueError("Duplicate preview identifier")
    if any(k.location_id not in ids or k.content_type not in {"fact", "legend", "disputed", "fiction"}
           for k in candidates):
        raise ValueError("Invalid candidate reference or type")
    return rows, candidates


def attraction_dto(place: Attraction) -> dict:
    # Never trust publication/coordinate approval claims in an imported JSON file.
    return {**place.model_dump(), "playable": False, "status": "preview",
            "coordinate_system": "gcj02", "coordinate_status": "approximate_demo",
            "coordinates_verified": False, "entrance_verified": False,
            "opening_status": "unknown", "review_status": "pending", "trust_level": "unverified",
            "human_review_verified": False, "content_review_status": "pending",
            "license_status": "unconfirmed"}


def candidate_dto(candidate: Candidate) -> dict:
    return {**candidate.model_dump(), "review_status": "pending", "trust_level": "unverified",
            "human_review_verified": False, "reviewed_at": None, "is_demo": False,
            "is_fictional": candidate.content_type == "fiction"}


def city_attractions(city_id: str) -> dict:
    if city_id != "suzhou":
        raise DomainError("ATTRACTIONS_NOT_FOUND", "该城市尚未提供全域景点资料。", 404)
    places, _ = preview_catalog()
    return {"items": [attraction_dto(p) for p in places], "total": len(places),
            "scope": "source_candidates_only", "navigable": False}


def attraction_detail(city_id: str, attraction_id: str) -> dict:
    city_attractions(city_id)
    places, candidates = preview_catalog()
    place = next((p for p in places if p.id == attraction_id), None)
    if place is None:
        raise DomainError("ATTRACTION_NOT_FOUND", "景点资料不存在。", 404)
    return {**attraction_dto(place), "knowledge": [],
            "source_candidates": [candidate_dto(k) for k in candidates if k.location_id == place.id]}
