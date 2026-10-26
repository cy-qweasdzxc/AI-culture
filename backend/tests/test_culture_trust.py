"""Culture lifecycle contracts. Every cultural statement below is synthetic test data."""
from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session
from test_admin import admin_config as admin_config
from test_admin import knowledge_body, login
from test_corpus_import import import_store as import_store
from test_corpus_import import synthetic_corpus
from test_scene_stream import done

from app.ai.rag.index import approved_records, has_human_review, rebuild_knowledge
from app.ai.settings import AISettings
from app.models import CulturalKnowledge, KnowledgeChunk, UserCollection, utcnow
from app.services.seed import seed_database


def current(client):
    return client.get("/api/journeys/current").json()["snapshot"]


def action(state, **extra):
    return {"journey_id": state["journeyId"], "state_version": state["stateVersion"],
            "request_id": str(uuid4()), **extra}


def review(client, identifier, version=1, status="reviewed"):
    response = client.post(f"/api/admin/knowledge/{identifier}/review", json={
        "version": version, "status": status, "reviewer": "合成工程审核员", "confirm_sources": True,
    })
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("status", ["pending", "reviewed", "rejected"])
def test_seed_preserves_real_seed_id_and_manual_content(db, status):
    row = db.get(CulturalKnowledge, "kn-pingjiangtu")
    row.content = "人工修改的合成测试正文，旧 Seed 不得覆盖。"
    row.title, row.source_url, row.license = "人工合成修改", "https://example.invalid/manual", "合成工程自编"
    row.review_status, row.is_demo, row.version = status, False, 8
    row.trust_level = "human_reviewed" if status == "reviewed" else "unverified"
    row.reviewer, row.reviewed_at = "合成工程审核员", utcnow()
    db.commit()
    db.refresh(row)  # Compare the same DB timezone representation across reseeding.
    before = (row.content, row.title, row.source_url, row.license, row.review_status,
              row.trust_level, row.is_demo, row.version, row.reviewer, row.reviewed_at)
    for automatic in (False, True):
        seed_database(db, auto_publish=automatic)
        db.refresh(row)
        assert (row.content, row.title, row.source_url, row.license, row.review_status,
                row.trust_level, row.is_demo, row.version, row.reviewer, row.reviewed_at) == before


@pytest.mark.parametrize("bad_field,bad_value", [
    ("content_type", "unsupported"), ("content", None), ("metadata_json", {"min_chapter": True}),
])
def test_entire_import_is_validated_before_writing(import_store, db, bad_field, bad_value):
    corpus = synthetic_corpus()
    late = deepcopy(corpus["included"][0])
    late["id"] = "synthetic-late-invalid"
    late[bad_field] = bad_value
    corpus["included"].append(late)
    result = import_store(corpus)
    assert result["failures"]
    assert result["created"] == result["updated"] == result["chunks"] == 0
    db.expire_all()
    assert db.get(CulturalKnowledge, "synthetic-import") is None
    assert db.get(CulturalKnowledge, late["id"]) is None


def test_runtime_failure_rolls_back_the_whole_import_batch(import_store, db):
    corpus = synthetic_corpus()
    late = deepcopy(corpus["included"][0])
    late["id"] = "synthetic-late-failure"
    late["content"] += " 第二条合成记录。"
    corpus["included"].append(late)

    def fail_late(_mapper, _connection, target):
        if target.id == late["id"]:
            raise RuntimeError("SYNTHETIC_TRANSACTION_FAILURE")

    event.listen(CulturalKnowledge, "before_insert", fail_late)
    try:
        result = import_store(corpus)
    finally:
        event.remove(CulturalKnowledge, "before_insert", fail_late)
    assert result["failures"] and result["created"] == result["updated"] == result["chunks"] == 0
    db.expire_all()
    assert db.get(CulturalKnowledge, "synthetic-import") is None
    assert db.get(CulturalKnowledge, late["id"]) is None


def test_legacy_human_label_without_review_time_cannot_publish(client, db, admin_config):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    row = db.get(CulturalKnowledge, "fixture-authored")
    row.review_status, row.trust_level, row.reviewer = "reviewed", "human_reviewed", "合成工程署名"
    assert row.reviewed_at is None
    db.commit()
    rebuild_knowledge(db, row, AISettings())
    db.commit()
    assert not has_human_review(row)
    assert approved_records(db, "suzhou-pingjiang") == []
    assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 409


@pytest.mark.parametrize("status", ["pending", "rejected"])
def test_codex_keeps_current_body_and_source_together(client, db, started, status):
    row = db.get(CulturalKnowledge, "kn-pingjiangtu")
    row.title, row.content, row.source = "合成新标题", "合成新正文，不属于旧 Seed。", "合成新来源"
    row.source_url, row.license = "https://example.invalid/current", "合成测试许可"
    row.content_type, row.is_demo, row.review_status = "fiction", False, status
    db.add(UserCollection(journey_id=started["journeyId"], item_id="codex-pingjiangtu", source="synthetic-test"))
    db.commit()
    entry = client.get("/api/codex").json()["items"][0]
    assert (entry["content"], entry["source"], entry["sourceUrl"]) == (row.content, row.source, row.source_url)
    assert entry["reviewStatus"] == status and entry["isDemo"] is False
    assert entry["isFictional"] is True


def test_place_detail_separates_candidates_from_human_review(client, admin_config):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    response = client.get("/api/places/pingjiang")
    assert response.status_code == 200
    body = response.json()
    assert body["knowledge"] == []
    candidate = next(row for row in body["source_candidates"] if row["id"] == "fixture-authored")
    assert (candidate["review_status"], candidate["trust_level"], candidate["is_demo"]) == ("pending", "unverified", False)
    assert candidate["source_url"] == knowledge_body()["source_url"] and candidate["license"]
    assert candidate["is_fictional"] is True
    review(client, "fixture-authored")
    assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 200
    body = client.get("/api/places/pingjiang").json()
    assert [row["id"] for row in body["knowledge"]] == ["fixture-authored"]
    assert all(row["id"] != "fixture-authored" for row in body["source_candidates"])


@pytest.mark.parametrize("kind", ["human", "pending", "auto", "missing_time"])
def test_single_npc_and_scene_share_the_same_authorized_facts(client, db, started, admin_config, kind):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    if kind == "human":
        review(client, "fixture-authored")
        assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 200
    elif kind in {"auto", "missing_time"}:
        row = db.get(CulturalKnowledge, "fixture-authored")
        row.review_status = "reviewed"
        row.trust_level = "auto_published" if kind == "auto" else "human_reviewed"
        row.reviewer = "system-auto-publish" if kind == "auto" else "合成工程署名"
        row.reviewed_at = utcnow() if kind == "auto" else None
        db.commit()
        rebuild_knowledge(db, row, AISettings())
        db.commit()
    response = client.post("/api/location/trigger", json=action(started, spot_id="pingjiang"))
    assert response.status_code == 200, response.text
    expected = {"fixture-authored"} if kind == "human" else set()
    single = client.post("/api/chat/message", json=action(current(client), npc_id="zhou-bo", message="合成古桥"))
    assert single.status_code == 200, single.text
    assert set(single.json()["evidence_ids"]) == expected
    scene = done(client.post("/api/chat/scene/stream", json=action(
        current(client), npc_id="zhou-bo", message="合成古桥", participant_ids=["zhou-bo"],
    )))
    evidence = [entry for message in scene["messages"] for entry in message.get("evidence", [])]
    assert {entry["id"] for entry in evidence} == expected
    for entry in [*single.json()["evidence"], *evidence]:
        assert entry["review_status"] == "reviewed" and entry["trust_level"] == "human_reviewed"
        assert entry["is_demo"] is False and entry["is_fictional"] is True
        assert entry["version"] == 2 and entry["reviewed_at"]


def test_withdrawal_refreshes_historical_evidence_labels(client, db, started, admin_config):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    review(client, "fixture-authored")
    assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 200
    assert client.post("/api/location/trigger", json=action(started, spot_id="pingjiang")).status_code == 200
    sent = client.post("/api/chat/message", json=action(current(client), npc_id="zhou-bo", message="合成古桥"))
    assert sent.status_code == 200 and sent.json()["evidence_ids"] == ["fixture-authored"]
    review(client, "fixture-authored", version=2, status="rejected")
    state = current(client)
    entry = state["evidence"]["fixture-authored"]
    assert entry["review_status"] == "rejected" and entry["trust_level"] == "unverified"
    assert entry["citation_current"] is False
    assert approved_records(db, "suzhou-pingjiang") == []
    assert not list(db.scalars(select(KnowledgeChunk)))
    seed_database(db)
    assert db.get(CulturalKnowledge, "fixture-authored").review_status == "rejected"


def test_seed_transaction_failure_does_not_commit_partial_changes(database):
    with Session(database) as db:
        original = db.get(CulturalKnowledge, "kn-pingjiangtu").content
        db.get(CulturalKnowledge, "kn-pingjiangtu").content = "未提交合成编辑，不应留在数据库。"
        real_commit = db.commit
        db.commit = lambda: (_ for _ in ()).throw(RuntimeError("SYNTHETIC_COMMIT_FAILURE"))
        with pytest.raises(RuntimeError, match="SYNTHETIC_COMMIT_FAILURE"):
            seed_database(db)
        db.rollback()
        db.commit = real_commit
    with Session(database) as db:
        assert db.get(CulturalKnowledge, "kn-pingjiangtu").content == original


def test_idempotent_replay_cannot_restore_withdrawn_evidence_badges(client, started, admin_config):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    review(client, "fixture-authored")
    assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 200
    assert client.post("/api/location/trigger", json=action(started, spot_id="pingjiang")).status_code == 200
    request = action(current(client), npc_id="zhou-bo", message="合成古桥")
    original = client.post("/api/chat/message", json=request)
    assert original.status_code == 200 and original.json()["evidence_ids"] == ["fixture-authored"]
    review(client, "fixture-authored", version=2, status="rejected")
    replay = client.post("/api/chat/message", json=request)
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert replay.json()["evidence"][0]["review_status"] == "rejected"
    assert replay.json()["evidence"][0]["citation_current"] is False


def test_admin_body_digest_does_not_revoke_unchanged_review_on_import(client, db, import_store, admin_config):
    login(client)
    corpus = synthetic_corpus()
    item = corpus["included"][0]
    body = {key: item[key] for key in ("id", "location_id", "title", "content", "content_type", "source", "source_url", "license")}
    assert client.post("/api/admin/knowledge", json=body).status_code == 201
    review(client, item["id"])
    assert client.post(f"/api/admin/knowledge/{item['id']}/publish").status_code == 200
    result = import_store(corpus)
    assert result["skipped"] == 1 and result["updated"] == 0
    db.expire_all()
    row = db.get(CulturalKnowledge, item["id"])
    assert row.version == 2 and row.review_status == "reviewed"
    assert row.metadata_json["sha256"] and has_human_review(row)
    assert [record.knowledge_id for record in approved_records(db, "suzhou-pingjiang")] == [item["id"]]
