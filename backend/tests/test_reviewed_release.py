"""Controlled release restore from a fresh migrated and seeded database."""
import copy
import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.ai.rag.index import approved_records, has_human_review
from app.models import CulturalKnowledge, KnowledgeChunk, Story
from scripts import restore_reviewed_release as restore

RELEASE = Path(__file__).resolve().parents[2] / "data/releases/cultural-knowledge-reviewed-20261029.json"


def payload():
    return restore.load_release(RELEASE)


def apply(db):
    return restore.restore_release(db, payload(), apply=True, include_archives=True)


def test_fresh_restore_full_release_and_keyword_index(db):
    report = apply(db)
    assert report["restored"] == 137 and report["conflicts"] == []
    assert report["indexed"] >= 137
    reviewed = list(db.scalars(select(CulturalKnowledge).where(CulturalKnowledge.review_status == "reviewed")))
    assert len(reviewed) == 137 and all(has_human_review(r) for r in reviewed)
    assert len({r.knowledge_id for r in approved_records(db, "suzhou-pingjiang")}) == 131
    for story_id in ("hangzhou-xihu", "nanjing-zhongshan"):
        archive = db.get(Story, story_id)
        assert archive.status == "draft" and archive.data["playable"] is False


def test_dry_run_never_writes_or_creates_archives(db):
    result = restore.restore_release(db, payload(), include_archives=True)
    assert result["restored"] == 137 and result["indexed"] == 0
    assert db.scalar(select(func.count()).select_from(KnowledgeChunk)) == 0
    assert db.get(Story, "hangzhou-xihu") is None
    assert not list(db.scalars(select(CulturalKnowledge).where(CulturalKnowledge.review_status == "reviewed")))


def test_repeat_restore_does_not_rebuild_or_duplicate(db, monkeypatch):
    apply(db)
    db.rollback()
    monkeypatch.setattr(restore, "rebuild_knowledge", lambda *_: pytest.fail("unchanged restore rebuilt index"))
    report = apply(db)
    assert report["restored"] == 0 and report["unchanged"] == 137 and report["indexed"] == 0


@pytest.mark.parametrize("change", ["reject", "revoke", "edit", "newer", "pending_edit"])
def test_preserves_database_decisions_and_manual_changes(db, change):
    if change != "pending_edit":
        apply(db)
    row = db.get(CulturalKnowledge, "kn-pingjiangtu")
    if change == "reject":
        row.review_status = "rejected"
    elif change == "revoke":
        row.review_status, row.trust_level, row.reviewer = "pending", "unverified", None
    elif change == "newer":
        row.version += 1
    else:
        row.content += " 人工编辑保留"
    db.commit()
    before = restore.record_values(row)
    db.rollback()
    report = apply(db)
    assert report["conflict_count"] == 1
    assert restore.record_values(db.get(CulturalKnowledge, row.id)) == before
    if change in {"reject", "revoke", "newer", "pending_edit"}:
        assert row.id not in {r.knowledge_id for r in approved_records(db, "suzhou-pingjiang")}


def test_tampered_snapshot_cannot_self_authorize(tmp_path):
    data = payload()
    data["records"][0]["content"] += " forged"
    path = tmp_path / "forged.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="UNTRUSTED_RELEASE_SHA256"):
        restore.load_release(path)


def test_programmatic_payload_tampering_is_rejected(db):
    data = copy.deepcopy(payload())
    data["records"][0]["reviewer"] = "伪造人员"
    with pytest.raises(ValueError, match="UNTRUSTED_RELEASE_CONTENT"):
        restore.restore_release(db, data, apply=True)


def test_transaction_failure_rolls_back_all_data_and_indexes(db, monkeypatch):
    real = restore.rebuild_knowledge
    calls = 0

    def fail(session, record, settings):
        nonlocal calls
        calls += 1
        if calls == 4:
            raise RuntimeError("injected transaction failure")
        return real(session, record, settings)

    monkeypatch.setattr(restore, "rebuild_knowledge", fail)
    with pytest.raises(RuntimeError, match="injected"):
        apply(db)
    assert db.scalar(select(func.count()).select_from(KnowledgeChunk)) == 0
    assert db.get(Story, "hangzhou-xihu") is None
    assert not list(db.scalars(select(CulturalKnowledge).where(CulturalKnowledge.review_status == "reviewed")))


def test_missing_references_reported_without_creating_playable_content(db):
    report = restore.restore_release(db, payload(), apply=True)
    assert report["restored"] == 131 and report["conflict_count"] == 6
    assert db.get(Story, "hangzhou-xihu") is None


def test_wrong_story_location_cannot_be_reassigned(db):
    from app.models import CulturalLocation
    row = db.get(CulturalLocation, "pingjiang")
    row.name = "人工点位名称"
    db.commit()
    report = apply(db)
    assert report["restored"] == 137
    assert db.get(CulturalLocation, "pingjiang").name == "人工点位名称"


def test_damaged_index_rebuilt_without_granting_new_review(db):
    apply(db)
    chunk = db.scalar(select(KnowledgeChunk))
    chunk.content = "stale"
    db.commit()
    report = apply(db)
    assert report["restored"] == 0 and report["indexed"] > 0
    assert db.scalar(select(func.count()).select_from(KnowledgeChunk).where(KnowledgeChunk.content == "stale")) == 0

@pytest.mark.parametrize("spot", ["pingjiang", "ouyuan", "shizilin", "zhuozhengyuan", "subo"])
def test_restored_facts_reach_real_npc_api_with_local_scope(db, client, started, spot):
    from app.ai.rag.retrieval import retrieve_knowledge
    from app.models import Character, UserStoryState
    apply(db)
    # Isolate the evidence chain at each already-reached station. Full progression is
    # exercised separately by the existing complete-journey browser tests.
    journey = db.get(UserStoryState, started["journeyId"])
    journey.current_location_id, journey.current_node_id = spot, "spot-" + spot
    journey.state, journey.chapter = "AT_SPOT", 5
    db.commit()
    npc = next(n for n in db.scalars(select(Character).where(Character.kind == "npc"))
               if spot in n.data.get("locationIds", []))
    rows = list(db.scalars(select(CulturalKnowledge).where(
        CulturalKnowledge.story_id == "suzhou-pingjiang", CulturalKnowledge.location_id == spot,
        CulturalKnowledge.content_type == "fact", CulturalKnowledge.review_status == "reviewed",
    ).order_by(CulturalKnowledge.id)))[:3]
    assert len(rows) == 3
    records = approved_records(db, "suzhou-pingjiang")
    for row in rows:
        question = row.title + "。" + row.content[:35] + "，有什么来源资料？"
        hits = retrieve_knowledge(question, records, {spot}, 5, mode="keyword")
        assert row.id in {hit.evidence.knowledge_id for hit in hits}
        state = client.get("/api/journeys/current").json()["snapshot"]
        response = client.post("/api/chat/message", json={
            "journey_id": state["journeyId"], "state_version": state["stateVersion"],
            "npc_id": npc.id, "message": question,
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert row.id in body["evidence_ids"], (row.id, body)
        assert body["data_scope"] == "reviewed_only"
        assert all(e["spotId"] == spot and e["review_status"] == "reviewed"
                   and e["source_url"].startswith(("https://", "http://")) for e in body["evidence"])
    # Revocation takes effect immediately without trusting pre-existing chunks.
    revoked = rows[0]
    revoked.review_status, revoked.trust_level = "pending", "unverified"
    db.commit()
    assert revoked.id not in {r.knowledge_id for r in approved_records(db, "suzhou-pingjiang")}


def test_restore_preserves_existing_journey(db, client, started):
    before = client.get("/api/journeys/current").json()
    apply(db)
    assert client.get("/api/journeys/current").json() == before

@pytest.mark.parametrize("ending", [b"\n", b"\r\n"])
def test_release_pin_accepts_only_git_checkout_line_endings(tmp_path, ending):
    original = RELEASE.read_bytes().replace(b"\r\n", b"\n")
    path = tmp_path / "release.json"
    path.write_bytes(original.replace(b"\n", ending))
    assert restore.load_release(path)["record_count"] == 137
