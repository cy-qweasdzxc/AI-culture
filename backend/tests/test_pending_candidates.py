"""The candidate importer must only add pending records to an isolated database."""

import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest
from sqlalchemy import inspect, select, text

from app.ai.rag.retrieval import fingerprint
from app.models import CulturalKnowledge, KnowledgeChunk

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
from import_pending_candidates import import_candidates, load_candidates, main  # noqa: E402

PACK = BACKEND.parent / "data/candidates/suzhou-cultural-candidates-20261028.json"


def file_for(tmp_path, records):
    payload = json.loads(PACK.read_text(encoding="utf-8"))
    payload["records"] = records
    path = tmp_path / "candidates.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def snapshot(engine):
    """Capture every table, including unrelated story and user state."""
    with engine.connect() as connection:
        return {
            table: [tuple(row) for row in connection.execute(text(f'SELECT * FROM "{table}" ORDER BY rowid'))]
            for table in inspect(engine).get_table_names()
        }


def test_dry_run_is_read_only(database):
    before = snapshot(database)
    result = import_candidates(PACK, str(database.url))
    assert result["total"] == 109 and result["created"] == 109 and not result["applied"]
    assert snapshot(database) == before


def test_full_candidate_pack_can_be_reviewed_published_and_used_by_npcs(database, client, monkeypatch):
    """Exercise the real approval pipeline, using a synthetic reviewer and no paid model."""
    from sqlalchemy.orm import Session

    from app.ai.agents.npc import respond
    from app.ai.agents.voice import TYPE_LABELS
    from app.ai.llm.providers import ChatProvider
    from app.ai.rag.index import approved_records
    from app.ai.rag.retrieval import evidence_dto, retrieve_knowledge
    from app.ai.settings import AISettings
    from app.core.config import get_settings

    monkeypatch.setenv("ADMIN_PASSWORD", "fixture-corpus-password")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "fixture-corpus-private-signing-key-32-chars")
    monkeypatch.setenv("EMBEDDING_PROVIDER", "none")
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    get_settings.cache_clear()
    try:
        import_candidates(PACK, str(database.url), apply=True)
        assert client.post("/api/admin/login", json={
            "username": "admin", "password": "fixture-corpus-password",
        }).status_code == 200
        candidates = load_candidates(PACK)
        for row in candidates:
            endpoint = f"/api/admin/knowledge/{row['id']}"
            review = client.post(endpoint + "/review", json={
                "version": 1, "status": "reviewed", "reviewer": "合成测试审核员", "confirm_sources": True,
            })
            assert review.status_code == 200, (row["id"], review.text)
            assert review.json()["human_review_verified"]
            publication = client.post(endpoint + "/publish")
            assert publication.status_code == 200, (row["id"], publication.text)
        with Session(database) as session:
            records = approved_records(session, "suzhou-pingjiang")
        assert {record.knowledge_id for record in records} == {row["id"] for row in candidates}
        provider = ChatProvider(AISettings())
        for row in candidates:
            question = "请介绍" + row["title"]
            hits = retrieve_knowledge(question, records, {row["location_id"]}, 1, mode="keyword")
            assert row["id"] in {hit.evidence.knowledge_id for hit in hits}, row["id"]
            assert all(hit.evidence.spot_id == row["location_id"] for hit in hits)
            npc_id = {"pingjiang": "zhou-bo", "subo": "xiao-shen"}.get(row["location_id"], "a-heng")
            reply = respond(question, hits, {"id": npc_id, "name": "合成测试讲解员"}, {"name": "测试游客"},
                            {"spot": row["location_id"]}, [], provider)
            assert reply.intent != "refusal", (row["id"], reply.reason)
            assert row["id"] in reply.evidence_ids
            assert TYPE_LABELS[row["content_type"]] in reply.dialogue
            cited = evidence_dto(next(hit.evidence for hit in hits if hit.evidence.knowledge_id == row["id"]))
            assert cited["human_review_verified"] and cited["citation_current"]
            assert cited["source_url"] == row["source_url"] and cited["version"] == 2
        for station in {row["location_id"] for row in candidates}:
            public = client.get(f"/api/places/{station}").json()
            assert {row["id"] for row in candidates if row["location_id"] == station} == {
                row["id"] for row in public["knowledge"]
            }
            assert all(row["human_review_verified"] for row in public["knowledge"])
    finally:
        get_settings.cache_clear()


def test_cli_requires_explicit_apply_for_writes(database, monkeypatch, capsys):
    before = snapshot(database)
    monkeypatch.setattr(sys, "argv", ["import_pending_candidates.py", "--file", str(PACK),
                                   "--database-url", str(database.url)])
    assert main() == 0
    assert json.loads(capsys.readouterr().out)["applied"] is False
    assert snapshot(database) == before


def test_apply_adds_all_records_pending_without_chunks(database):
    before = snapshot(database)
    result = import_candidates(PACK, str(database.url), apply=True)
    assert result["total"] == result["created"] == 109
    assert result["skipped"] == 0
    assert result["stations"] == {
        "ouyuan": 23, "pingjiang": 19, "shizilin": 22, "subo": 20, "zhuozhengyuan": 25,
    }
    with database.connect() as connection:
        additions = list(connection.execute(select(CulturalKnowledge).where(
            CulturalKnowledge.id.in_([row["id"] for row in load_candidates(PACK)]))))
        assert len(additions) == 109
        assert all(row.review_status == "pending" and row.trust_level == "unverified"
                   and row.reviewer is None and row.reviewed_at is None and row.is_demo is False
                   and row.version == 1 for row in additions)
        assert not list(connection.execute(select(KnowledgeChunk).where(
            KnowledgeChunk.knowledge_id.in_([row["id"] for row in load_candidates(PACK)]))))
    after = snapshot(database)
    for table, old_rows in before.items():
        if table != "cultural_knowledge":
            assert after[table] == old_rows, table
        else:
            assert len(after[table]) == len(old_rows) + 109
            assert all(row in after[table] for row in old_rows)


def test_rerun_preserves_later_human_review_and_metadata(database):
    import_candidates(PACK, str(database.url), apply=True)
    first = load_candidates(PACK)[0]
    with database.begin() as connection:
        connection.execute(text("UPDATE cultural_knowledge SET review_status='reviewed', "
                                "trust_level='human_reviewed', reviewer='真人审核', "
                                "reviewed_at=:reviewed, version=7, metadata_json=:metadata "
                                "WHERE id=:id"), {
            "id": first["id"], "reviewed": "2026-10-28 12:00:00",
            "metadata": json.dumps({"human_note": "保留"}, ensure_ascii=False),
        })
        connection.execute(text("INSERT INTO knowledge_chunks "
                                "(id, knowledge_id, chunk_index, content, embedding, embedding_model, "
                                "embedding_dimension, knowledge_version, metadata_json) "
                                "VALUES (:chunk_id, :id, 0, 'reviewed chunk', '[]', '', 0, 7, '{}')"),
                           {"id": first["id"], "chunk_id": first["id"] + ":test"})
    before = snapshot(database)
    result = import_candidates(PACK, str(database.url), apply=True)
    assert result["created"] == 0 and result["skipped"] == 109
    assert snapshot(database) == before


def test_late_invalid_record_rejects_whole_pack(database, tmp_path):
    rows = deepcopy(load_candidates(PACK))
    rows[-1]["review_status"] = "reviewed"
    before = snapshot(database)
    with pytest.raises(ValueError, match="must be pending"):
        import_candidates(file_for(tmp_path, rows), str(database.url), apply=True)
    assert snapshot(database) == before


@pytest.mark.parametrize("change, message", [
    ({"source_url": "https://name:secret@example.org/page"}, "invalid source URL"),
    ({"source_url": "https://example.org:abc/path"}, "invalid source URL"),
    ({"source_url": "https://-bad.example/path"}, "invalid source URL"),
    ({"source_url": "ftp://example.org/page"}, "invalid source URL"),
    ({"source": "【待补充】"}, "incomplete attribution"),
    ({"location_id": "not-a-station"}, "invalid story or station"),
    ({"reviewer": "claimed reviewer"}, "must be pending"),
])
def test_late_invalid_source_or_state_rejects_whole_pack(database, tmp_path, change, message):
    rows = deepcopy(load_candidates(PACK))
    rows[-1].update(change)
    before = snapshot(database)
    with pytest.raises(ValueError, match=message):
        import_candidates(file_for(tmp_path, rows), str(database.url), apply=True)
    assert snapshot(database) == before


@pytest.mark.parametrize("identifier", [
    "kn-zhenqu",
    "kn-shouyuandeng",
    "kn-sz-pingjiang-mismatched-station",
])
def test_rejects_out_of_namespace_or_mismatched_station_id(database, tmp_path, identifier):
    rows = deepcopy(load_candidates(PACK))
    rows[-1]["id"] = identifier
    before = snapshot(database)
    with pytest.raises(ValueError, match="invalid candidate ID for station"):
        import_candidates(file_for(tmp_path, rows), str(database.url), apply=True)
    assert snapshot(database) == before


@pytest.mark.parametrize("change, message", [
    ({"min_chapter": 2}, "invalid chapter"),
    ({"source_access": "not_read"}, "invalid collection provenance"),
    ({"collection_model": "other-model"}, "invalid collection provenance"),
])
def test_rejects_changed_collection_contract(database, tmp_path, change, message):
    rows = deepcopy(load_candidates(PACK))
    rows[-1]["metadata_json"].update(change)
    before = snapshot(database)
    with pytest.raises(ValueError, match=message):
        import_candidates(file_for(tmp_path, rows), str(database.url), apply=True)
    assert snapshot(database) == before


def test_duplicate_body_and_id_reject_whole_pack(database, tmp_path):
    rows = deepcopy(load_candidates(PACK))
    for change, message in (({"content": rows[0]["content"]}, "duplicate content"),
                            ({"id": rows[0]["id"]}, "duplicate ID")):
        changed = deepcopy(rows)
        changed[-1].update(change)
        before = snapshot(database)
        with pytest.raises(ValueError, match=message):
            import_candidates(file_for(tmp_path, changed), str(database.url), apply=True)
        assert snapshot(database) == before


def test_changed_id_and_existing_body_collision_reject(database, tmp_path):
    rows = deepcopy(load_candidates(PACK))
    import_candidates(file_for(tmp_path, rows[:1]), str(database.url), apply=True)
    before = snapshot(database)
    changed = deepcopy(rows[:1])
    changed[0]["content"] += "（改变）"
    with pytest.raises(ValueError, match="ID collision"):
        import_candidates(file_for(tmp_path, changed), str(database.url), apply=True)
    changed = deepcopy(rows[:1])
    changed[0]["source"] += " (altered)"
    with pytest.raises(ValueError, match="ID collision"):
        import_candidates(file_for(tmp_path, changed), str(database.url), apply=True)
    renamed = deepcopy(rows[1:2])
    renamed[0]["content"] = rows[0]["content"]
    assert fingerprint(renamed[0]["content"]) == fingerprint(rows[0]["content"])
    with pytest.raises(ValueError, match="duplicate content already stored"):
        import_candidates(file_for(tmp_path, renamed), str(database.url), apply=True)
    assert snapshot(database) == before


def test_invalid_database_station_rejects_whole_batch(database, tmp_path):
    rows = deepcopy(load_candidates(PACK))
    with database.begin() as connection:
        connection.execute(text("INSERT INTO stories (id, name, status, version, data) "
                                "VALUES ('fixture-other-story', 'Other', 'draft', 'v1', '{}')"))
        connection.execute(text("UPDATE cultural_locations SET story_id='fixture-other-story' "
                                "WHERE id='zhuozhengyuan'"))
    before = snapshot(database)
    with pytest.raises(ValueError, match="station missing"):
        import_candidates(file_for(tmp_path, rows), str(database.url), apply=True)
    assert snapshot(database) == before


def test_runtime_insert_failure_rolls_back_entire_batch(database):
    before = snapshot(database)
    last_id = load_candidates(PACK)[-1]["id"]
    with database.begin() as connection:
        connection.execute(text("CREATE TRIGGER reject_last_candidate BEFORE INSERT ON cultural_knowledge "
                                f"WHEN NEW.id='{last_id}' "
                                "BEGIN SELECT RAISE(ABORT, 'synthetic insert failure'); END"))
    try:
        with pytest.raises(Exception, match="synthetic insert failure"):
            import_candidates(PACK, str(database.url), apply=True)
    finally:
        with database.begin() as connection:
            connection.execute(text("DROP TRIGGER reject_last_candidate"))
    assert snapshot(database) == before
