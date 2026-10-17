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
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from build_reviewed_corpus import (  # noqa: E402
    CONTENT_FIELDS,
    _canonical_time,
    _remember_reviewed_at,
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


def test_rebuilding_from_the_same_input_is_stable() -> None:
    """The same research file must produce the same corpus twice, byte for byte."""
    research = load_research(RESEARCH)
    first = build(research, "Penknife", reviewed_at="2026-10-11T15:30:00+08:00")
    second = build(research, "Penknife", reviewed_at="2026-10-11T15:30:00+08:00")
    assert json.dumps(first, sort_keys=True, ensure_ascii=False) == json.dumps(
        second, sort_keys=True, ensure_ascii=False)


def test_rebuild_inherits_the_recorded_review_time() -> None:
    """Without an explicit timestamp the previously published one is reused, not regenerated."""
    research = load_research(RESEARCH)
    published = build(research, "Penknife", reviewed_at="2026-10-11T15:30:00+08:00")
    rebuilt = build(research, "Penknife", previous=published)
    assert {item["reviewed_at"] for item in rebuilt["included"]} == {"2026-10-11T15:30:00+08:00"}


def test_remember_reviewed_at_rejects_a_mixed_file() -> None:
    mixed = {"included": [{"reviewed_at": "2026-01-01T00:00:00+00:00"},
                          {"reviewed_at": "2026-02-01T00:00:00+00:00"}]}
    assert _remember_reviewed_at(mixed) is None
    assert _remember_reviewed_at(None) is None


def test_row_signature_matches_a_published_corpus_file(db) -> None:
    """The published corpus must already match the database, or every import would look changed.

    The test fixture explicitly seeds pending demo knowledge, so there is normally nothing to compare
    here; the real equivalence check on a deployed database lives in the acceptance run
    (``--expect 0`` against the containerised PostgreSQL).
    """
    if not CORPUS.exists():
        pytest.skip("已发布语料不在工作区")
    published = json.loads(CORPUS.read_text(encoding="utf-8"))
    from app.models import CulturalKnowledge

    matched = 0
    for item in published["included"]:
        row = db.get(CulturalKnowledge, item["id"])
        # 夹具库里同 id 可能是 pending 演示条目，内容与已审核发布版本不同，不属于本次比对范围。
        if row is None or row.review_status != "reviewed":
            continue
        assert content_signature(item) == row_signature(row), f"{item['id']} 签名不一致"
        matched += 1
    if matched == 0:
        pytest.skip("测试夹具库没有已审核语料（只有 pending 演示数据）")
