from copy import deepcopy

import pytest
from sqlalchemy import func, select

from app.ai.rag.index import approved_records
from app.models import CulturalKnowledge, KnowledgeChunk
from app.services.attractions import (
    Attraction,
    Candidate,
    attraction_dto,
    candidate_dto,
    preview_catalog,
)


def test_preview_catalog_is_complete_but_never_playable_or_human_reviewed(client, db):
    before = (db.scalar(select(func.count()).select_from(CulturalKnowledge)),
              db.scalar(select(func.count()).select_from(KnowledgeChunk)))
    catalog = client.get("/api/cities/suzhou/attractions")
    assert catalog.status_code == 200
    rows = catalog.json()["items"]
    assert len(rows) == 50 and len({r["id"] for r in rows}) == 50
    assert catalog.json()["navigable"] is False
    assert all(r["playable"] is False and r["human_review_verified"] is False
               and r["review_status"] == "pending" and r["entrance_verified"] is False for r in rows)
    total = 0
    for row in rows:
        detail = client.get("/api/cities/suzhou/attractions/" + row["id"])
        assert detail.status_code == 200
        body = detail.json()
        assert body["knowledge"] == []
        for item in body["source_candidates"]:
            total += 1
            assert item["review_status"] == "pending" and item["trust_level"] == "unverified"
            assert not item["human_review_verified"] and item["reviewed_at"] is None
    assert total == 10
    assert before == (db.scalar(select(func.count()).select_from(CulturalKnowledge)),
                      db.scalar(select(func.count()).select_from(KnowledgeChunk)))
    assert approved_records(db, "suzhou-pingjiang") == []


def test_preview_catalog_does_not_expand_published_routes_or_task_access(client, started):
    routes_before = client.get("/api/cities/suzhou/routes").json()
    places_before = client.get("/api/cities/suzhou/places").json()
    state_before = client.get("/api/journeys/current").json()
    client.get("/api/cities/suzhou/attractions/tongli")
    assert client.get("/api/cities/suzhou/routes").json() == routes_before
    assert client.get("/api/cities/suzhou/places").json() == places_before
    assert client.get("/api/journeys/current").json() == state_before
    assert client.post("/api/location/trigger", json={"journey_id": started["journeyId"],
        "state_version": started["stateVersion"], "request_id": "preview-cannot-unlock", "spot_id": "tongli"}).status_code in {404, 409, 422}


@pytest.mark.parametrize("path", ["/api/cities/unknown/attractions", "/api/cities/beijing/attractions",
                                  "/api/cities/suzhou/attractions/not-a-place"])
def test_unknown_preview_is_not_a_fake_playable_place(client, path):
    assert client.get(path).status_code == 404


def test_json_review_claims_are_ignored():
    places, candidates = preview_catalog()
    fake = {**places[0].model_dump(), "playable": True, "coordinates_verified": True,
            "review_status": "reviewed", "trust_level": "human_reviewed"}
    row = attraction_dto(Attraction.model_validate(fake))
    assert row["playable"] is False and row["review_status"] == "pending" and not row["coordinates_verified"]
    fake = {**candidates[0].model_dump(), "review_status": "reviewed", "reviewer": "file claim"}
    assert candidate_dto(Candidate.model_validate(fake))["review_status"] == "pending"


def test_preview_model_rejects_nonfinite_coordinates():
    raw = deepcopy(preview_catalog()[0][0].model_dump())
    raw["lat"] = float("nan")
    with pytest.raises(ValueError):
        Attraction.model_validate(raw)
