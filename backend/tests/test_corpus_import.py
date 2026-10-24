"""Re-importing an unchanged corpus must not bump versions or spend embedding calls.

Two real defects this pins down:

1. ``reviewed_at`` was regenerated from ``datetime.now()`` on every run, so the corpus always looked
   changed and every entry was rewritten, incremented in version and re-indexed.
2. The comparison helpers did not normalise ``metadata_json`` (JSON string in the file, dict in the
   ORM) or timestamps (offset-aware in the file, naive after a database round-trip), so even a
   byte-identical corpus reported a difference.
"""
import json
import sys
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from test_admin import admin_config as admin_config
from test_admin import login

from app.ai.rag.index import approved_records
from app.models import CulturalKnowledge, KnowledgeChunk

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from build_reviewed_corpus import (  # noqa: E402
    CONTENT_FIELDS,
    _canonical_time,
    _remember_reviewed_at,
    apply_to_database,
    build,
    content_signature,
    load_research,
    row_signature,
)

CORPUS = BACKEND.parent / "data/raw/culture-reviewed-corpus.json"
RESEARCH = BACKEND.parent / "data/raw/culture-source-candidates.json"
pytestmark = pytest.mark.skipif(not RESEARCH.exists(), reason="来源核对文件不在工作区")


def test_canonical_time_treats_naive_and_aware_as_the_same_instant() -> None:
    aware = "2026-10-11T09:10:47.742792+00:00"
    naive = "2026-10-11T09:10:47.742792"
    assert _canonical_time(aware) == _canonical_time(naive)


def test_canonical_time_keeps_a_different_instant_different() -> None:
    base = datetime(2026, 10, 11, 9, 10, 47, tzinfo=UTC)
    assert _canonical_time(base.isoformat()) != _canonical_time((base + timedelta(seconds=1)).isoformat())


def test_metadata_json_string_and_dict_compare_equal() -> None:
    payload = {"min_chapter": 1, "cited_sources": [{"id": "a", "url": "https://example.invalid"}]}
    as_text = {**{f: "x" for f in CONTENT_FIELDS}, "metadata_json": json.dumps(payload, ensure_ascii=False)}
    as_object = {**{f: "x" for f in CONTENT_FIELDS}, "metadata_json": payload}
    assert content_signature(as_text) == content_signature(as_object)
    assert content_signature(as_object) != content_signature({**as_object, "metadata_json": {"min_chapter": 2}})


def test_rebuilding_from_the_same_input_is_stable() -> None:
    """The same research file must produce the same corpus twice, byte for byte."""
    research = load_research(RESEARCH)
    first = build(research, "Penknife", reviewed_at="2026-10-11T15:30:00+08:00")
    second = build(research, "Penknife", reviewed_at="2026-10-11T15:30:00+08:00")
    assert json.dumps(first, sort_keys=True, ensure_ascii=False) == json.dumps(
        second, sort_keys=True, ensure_ascii=False)


def test_rebuild_inherits_the_recorded_review_time() -> None:
    """Preparation provenance is stable and never becomes an assertion of human review."""
    research = load_research(RESEARCH)
    published = build(research, "Penknife", reviewed_at="2026-10-11T15:30:00+08:00")
    rebuilt = build(research, "Penknife", previous=published)
    assert {item["metadata_json"]["prepared_at"] for item in rebuilt["included"]} == {"2026-10-11T15:30:00+08:00"}
    assert all(item["review_status"] == "pending" and item["trust_level"] == "unverified"
               and item["reviewed_at"] is None and item["reviewer"] is None for item in rebuilt["included"])


def test_remember_reviewed_at_rejects_a_mixed_file() -> None:
    mixed = {"included": [{"reviewed_at": "2026-01-01T00:00:00+00:00"},
                          {"reviewed_at": "2026-02-01T00:00:00+00:00"}]}
    assert _remember_reviewed_at(mixed) is None
    assert _remember_reviewed_at(None) is None


def test_row_signature_matches_an_imported_corpus_file(db, import_store, admin_config) -> None:
    """Exercise the shipped corpus on a fresh migrated DB rather than skipping pending fixtures."""
    if not CORPUS.exists():
        pytest.skip("已发布语料不在工作区")
    published = json.loads(CORPUS.read_text(encoding="utf-8"))
    result = import_store(published)
    assert not result["failures"]
    for item in published["included"]:
        row = db.get(CulturalKnowledge, item["id"])
        assert row is not None and row.review_status == "pending" and row.trust_level == "unverified"
        assert content_signature(item) == row_signature(row), f"{item['id']} 签名不一致"
    assert import_store(published)["skipped"] == len(published["included"])


@pytest.fixture
def import_store(database, monkeypatch):
    """Every import uses the same migrated, seeded isolation database as the real APIs."""
    import app.core.database as storage
    monkeypatch.setattr(storage, "SessionLocal", sessionmaker(bind=database, expire_on_commit=False))
    return apply_to_database


def synthetic_corpus():
    return {"included": [{
        "id": "synthetic-import", "location_id": "pingjiang", "title": "合成古桥",
        "content": "合成古桥是测试夹具中的石桥，不是真实文化事实。", "content_type": "fiction",
        "source": "自编工程测试夹具", "source_url": "https://example.invalid/synthetic",
        "license": "仅用于合成工程测试", "metadata_json": {"min_chapter": 1},
        # Legacy files and untrusted imports cannot authorize their own publication.
        "review_status": "reviewed", "trust_level": "human_reviewed", "is_demo": False,
        "reviewer": "合成夹具署名", "reviewed_at": "2026-10-11T07:46:10+00:00",
    }]}


def synthetic_review_and_publish(client, version=1):
    response = client.post("/api/admin/knowledge/synthetic-import/review", json={
        "version": version, "status": "reviewed", "reviewer": "合成测试审核员", "confirm_sources": True,
    })
    assert response.status_code == 200, response.text
    response = client.post("/api/admin/knowledge/synthetic-import/publish")
    assert response.status_code == 200, response.text


def test_import_never_treats_corpus_review_fields_as_authorization(import_store, db, admin_config):
    result = import_store(synthetic_corpus())
    assert result["failures"] == [] and result["created"] == 1
    row = db.get(CulturalKnowledge, "synthetic-import")
    assert (row.review_status, row.trust_level, row.reviewer, row.reviewed_at) == ("pending", "unverified", None, None)
    assert not list(db.scalars(select(KnowledgeChunk)))
    assert approved_records(db, "suzhou-pingjiang") == []
    version = row.version
    repeated = import_store(synthetic_corpus())
    assert repeated["skipped"] == 1 and repeated["created"] == repeated["updated"] == 0
    db.refresh(row)
    assert row.version == version


def test_import_review_publish_retrieve_npc_and_revoke_form_one_chain(
    import_store, client, db, started, admin_config,
):
    corpus = synthetic_corpus()
    import_store(corpus)
    login(client)
    search = {"query": "合成古桥", "location_id": "pingjiang"}
    assert client.post("/api/admin/retrieval/test", json=search).json()["items"] == []
    assert client.post("/api/admin/knowledge/synthetic-import/publish").status_code == 409
    synthetic_review_and_publish(client)
    hits = client.post("/api/admin/retrieval/test", json=search).json()
    assert [item["id"] for item in hits["items"]] == ["synthetic-import"]
    arrival = client.post("/api/location/trigger", json={
        "journey_id": started["journeyId"], "state_version": started["stateVersion"],
        "request_id": str(uuid4()), "spot_id": "pingjiang",
    })
    assert arrival.status_code == 200, arrival.text
    state = arrival.json()["snapshot"]
    reply = client.post("/api/chat/message", json={
        "journey_id": state["journeyId"], "state_version": state["stateVersion"],
        "request_id": str(uuid4()), "npc_id": "zhou-bo", "message": "合成古桥",
    })
    assert reply.status_code == 200, reply.text
    assert "synthetic-import" in reply.json()["evidence_ids"]
    unchanged = import_store(corpus)
    assert unchanged["skipped"] == 1
    withdrawn = client.post("/api/admin/knowledge/synthetic-import/review", json={
        "version": 2, "status": "rejected", "reviewer": "合成测试审核员",
    })
    assert withdrawn.status_code == 200
    assert import_store(corpus)["skipped"] == 1
    assert client.post("/api/admin/retrieval/test", json=search).json()["items"] == []
    db.expire_all()
    assert db.get(CulturalKnowledge, "synthetic-import").review_status == "rejected"
    assert not list(db.scalars(select(KnowledgeChunk)))
    assert approved_records(db, "suzhou-pingjiang") == []


def test_changed_import_revokes_human_review_and_old_chunks(import_store, client, db, admin_config):
    corpus = synthetic_corpus()
    import_store(corpus)
    login(client)
    synthetic_review_and_publish(client)
    changed = deepcopy(corpus)
    changed["included"][0]["content"] += " 合成第二版，不属于已审核原文。"
    result = import_store(changed)
    assert result["updated"] == 1 and not result["failures"]
    db.expire_all()
    row = db.get(CulturalKnowledge, "synthetic-import")
    assert row.version == 3 and row.review_status == "pending" and row.trust_level == "unverified"
    assert row.reviewer is None and row.reviewed_at is None
    assert approved_records(db, "suzhou-pingjiang") == []
    assert not list(db.scalars(select(KnowledgeChunk)))
    assert import_store(changed)["skipped"] == 1


def test_import_embedding_rebuild_and_failure_are_atomic(import_store, client, db, admin_config, monkeypatch):
    from dataclasses import replace

    from app.ai.llm.providers import EmbeddingProvider, ProviderError
    from app.ai.settings import AISettings

    corpus = synthetic_corpus()
    import_store(corpus)
    login(client)
    settings = AISettings(embedding_provider="fixture", embedding_model="model-a", embedding_dimension=2)
    monkeypatch.setattr(AISettings, "configured", classmethod(lambda cls: settings))
    calls = []
    def embed(_provider, texts):
        calls.append(len(texts))
        return [[1.0, 0.0] for _ in texts]
    monkeypatch.setattr(EmbeddingProvider, "embed", embed)
    synthetic_review_and_publish(client)
    assert calls == [1]
    assert import_store(corpus)["skipped"] == 1 and calls == [1]
    settings = replace(settings, embedding_model="model-b")
    assert import_store(corpus)["updated"] == 1 and calls == [1, 1]
    db.expire_all()
    chunk = db.scalar(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == "synthetic-import"))
    assert chunk.embedding_model == "model-b"
    assert db.get(CulturalKnowledge, "synthetic-import").version == 2
    settings = replace(settings, embedding_provider="fixture-other")
    assert import_store(corpus)["updated"] == 1 and calls == [1, 1, 1]
    settings = replace(settings, embedding_model="model-c")
    def fail(_provider, texts):
        raise ProviderError("SYNTHETIC_PROVIDER_FAILURE")
    monkeypatch.setattr(EmbeddingProvider, "embed", fail)
    failed = import_store(corpus)
    assert len(failed["failures"]) == 1 and failed["updated"] == failed["created"] == failed["chunks"] == 0
    db.expire_all()
    assert db.get(CulturalKnowledge, "synthetic-import").version == 2
    chunk = db.scalar(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == "synthetic-import"))
    assert chunk.embedding_model == "model-b" and len(approved_records(db, "suzhou-pingjiang")) == 1


def test_invalid_import_rolls_back_and_reports_only_committed_counts(import_store, db, admin_config):
    corpus = synthetic_corpus()
    corpus["included"][0]["location_id"] = "beijing-forbidden-city"
    result = import_store(corpus)
    assert len(result["failures"]) == 1 and result["created"] == result["updated"] == result["chunks"] == 0
    assert db.get(CulturalKnowledge, "synthetic-import") is None
    assert not list(db.scalars(select(KnowledgeChunk)))


@pytest.mark.parametrize("bad_entry", [None, "duplicate"])
def test_invalid_batch_structure_fails_before_any_entry_is_written(import_store, db, admin_config, bad_entry):
    corpus = synthetic_corpus()
    corpus["included"].append(deepcopy(corpus["included"][0]) if bad_entry == "duplicate" else bad_entry)
    with pytest.raises(ValueError, match="CORPUS_STRUCTURE_INVALID"):
        import_store(corpus)
    assert db.get(CulturalKnowledge, "synthetic-import") is None
