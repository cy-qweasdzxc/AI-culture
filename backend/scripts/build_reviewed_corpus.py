"""Prepare and import source candidates without granting human review.

Input : ``data/raw/culture-source-candidates.json`` — the per-item source verification produced by
        the previous maintenance round, including its verdict for every knowledge item.
Output: a review file (default ``data/raw/culture-reviewed-corpus.json``) that the admin publish
        path can consume, plus an optional pending-only database import.

Guard rails kept deliberately explicit:
  * only verdicts the research actually supports are eligible (``supporting``);
  * records still marked ``needs_wording`` keep their research **proposed** text, because the
    original wording was flagged as unsupported;
  * the review provenance records that the review applied a prior verification, not that a human
    independently re-read every page;
  * nothing is applied without ``--apply``.

Run from backend:
    python scripts/build_reviewed_corpus.py --list
    python scripts/build_reviewed_corpus.py --apply --reviewer "<名字或团队>"
"""
import argparse
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def resolve_data_dir() -> Path:
    """Locate the repository ``data`` directory in both checkout and container layouts.

    In a checkout ``backend/scripts`` sits beside ``data``; inside the backend image the code is at
    ``/app`` with no sibling repository root, so ``/app/data`` holds what the image ships.
    """
    for candidate in (BACKEND.parent / "data", BACKEND / "data"):
        if candidate.is_dir():
            return candidate
    return BACKEND.parent / "data"


DATA_DIR = resolve_data_dir()

# Verdicts whose public evidence directly supports the claim as written.
SUPPORTING_VERDICTS = {"supported_public_evidence_only"}
# Verdicts that are only usable after the research's proposed re-wording is applied.
REWORD_VERDICTS = {"partially_supported_needs_wording"}
# Kept out of the publishable corpus on purpose; reported so the decision is visible.
EXCLUDED_VERDICTS = {
    "not_supported_as_written": "公开来源不支持现有表述，需要人工改写后才能审核",
    "mixed_fact_and_unverified_legend": "史实与未经证实的传说混写，需要人工拆分",
    "fiction_explicit_external_source_not_applicable": "明确为虚构创作，不属于文化史实语料",
}

LICENSE_NOTE = (
    "来源为公开政府与文博机构网页；经参赛团队确认用于本项目非商业赛事演示，"
    "未取得书面转载许可，不复制原始页面图像，仅引述事实并标注出处。"
)
DEFAULT_REVIEW_NOTE = (
    "审核依据上一轮来源核对结论（data/raw/culture-source-candidates.json），"
    "未由审核人逐页独立复核；正式提交前需人工确认。"
)
# Spot ownership comes from the demo seed; the research file only carries source metadata.
SPOT_BY_KNOWLEDGE = {
    "kn-ouyuan-jiaou": "ouyuan",
    "kn-ouyuan-water": "ouyuan",
    "kn-pingjiangtu": "pingjiang",
    "kn-shuangqipan": "pingjiang",
    "kn-yuxiang": "pingjiang",
    "kn-shizi-origin": "shizilin",
    "kn-zhenqu": "shizilin",
    "kn-zhenqu-bian": "shizilin",
    "kn-pianshi": "subo",
    "kn-shouyuandeng": "subo",
    "kn-subo-bei": "subo",
    "kn-zhongwangfu": "subo",
    "kn-shijieyichan": "zhuozhengyuan",
    "kn-wenzhengming": "zhuozhengyuan",
    "kn-zhuozheng-origin": "zhuozhengyuan",
}


def load_research(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("sources", "records"):
        if key not in data:
            raise ValueError(f"RESEARCH_FILE_INCOMPLETE: missing {key}")
    return data


def source_index(research: dict) -> dict[str, dict]:
    return {entry["id"]: entry for entry in research["sources"]}


def _remember_reviewed_at(previous: dict | None) -> str | None:
    """Reuse the review timestamp already recorded in the published corpus, if there is one.

    Only meaningful when every included entry shares one timestamp, which is how this script writes
    them. A mixed set means the file was edited by hand, so fall back to "not remembered".
    """
    if not previous:
        return None
    stamps = {item.get("reviewed_at") for item in previous.get("included", [])}
    return stamps.pop() if len(stamps) == 1 else None


def build(research: dict, reviewer: str, *, reviewed_at: str | None = None,
          previous: dict | None = None) -> dict:
    sources = source_index(research)
    # 审核时间是一次性的人工事实，不是本脚本的运行时刻。优先用显式传入值，其次沿用已发布
    # 语料中记录的时间；否则每次复跑都会"看起来有变化"，从而无条件增长版本并重建索引
    # （其中包含付费 Embedding 调用）。
    recorded_at = (reviewed_at or (previous or {}).get("generated_at_utc")
                   or _remember_reviewed_at(previous) or datetime.now(UTC).isoformat())
    included, excluded = [], []
    for record in research["records"]:
        verdict = record.get("verification_status")
        knowledge_id = record["knowledge_id"]
        if verdict in EXCLUDED_VERDICTS:
            excluded.append({"knowledge_id": knowledge_id, "verification_status": verdict,
                             "reason": EXCLUDED_VERDICTS[verdict]})
            continue
        if verdict not in SUPPORTING_VERDICTS | REWORD_VERDICTS:
            excluded.append({"knowledge_id": knowledge_id, "verification_status": verdict,
                             "reason": "未在可发布结论白名单内"})
            continue
        cited = [sources[source_id] for source_id in record.get("source_ids", []) if source_id in sources]
        if not cited:
            excluded.append({"knowledge_id": knowledge_id, "verification_status": verdict,
                             "reason": "没有可引用的来源候选"})
            continue
        primary = cited[0]
        # A record flagged as needing re-wording must not republish the wording the research rejected.
        content = record["proposed_content"] if verdict in REWORD_VERDICTS else record["original_content"]
        location_id = record.get("spot_id") or SPOT_BY_KNOWLEDGE.get(knowledge_id)
        if not location_id:
            excluded.append({"knowledge_id": knowledge_id, "verification_status": verdict,
                             "reason": "缺少点位归属映射，不能入库"})
            continue
        included.append({
            "id": knowledge_id,
            "location_id": location_id,
            "title": record["original_title"],
            "content": content,
            "content_type": record["original_type"],
            "source": primary["institution"],
            "source_url": primary["url"],
            "license": LICENSE_NOTE,
            "review_status": "pending",
            "trust_level": "unverified",
            "reviewer": None,
            "reviewed_at": None,
            "is_demo": False,
            "metadata_json": {
                "min_chapter": 1,
                "verification_status": verdict,
                "content_origin": "research_proposed_content" if verdict in REWORD_VERDICTS else "original_content",
                "review_note": DEFAULT_REVIEW_NOTE,
                "prepared_by": reviewer,
                "prepared_at": recorded_at,
                "cited_sources": [
                    {"id": s["id"], "institution": s["institution"], "url": s["url"],
                     "published_on": s.get("published_on"), "accessed_on": s.get("accessed_on"),
                     "locator": s.get("locator"), "supports": s.get("supports"),
                     "limitations": s.get("limitations")}
                    for s in cited
                ],
                "research_limitations": record.get("unsupported_or_unverified_claims", []),
                "human_followup": record.get("human_followup", ""),
            },
        })
    return {
        "schema_version": "culture-reviewed-corpus-v1",
        "generated_at_utc": recorded_at,
        "reviewer": reviewer,
        "research_file": "data/raw/culture-source-candidates.json",
        "research_verified_on": research.get("verified_on"),
        "policy": {
            "supporting_verdicts": sorted(SUPPORTING_VERDICTS),
            "reword_verdicts": sorted(REWORD_VERDICTS),
            "excluded_verdicts": EXCLUDED_VERDICTS,
            "license_note": LICENSE_NOTE,
        },
        "summary": {"included": len(included), "excluded": len(excluded)},
        "included": included,
        "excluded": excluded,
    }


CONTENT_FIELDS = ("location_id", "title", "content", "content_type", "source", "source_url",
                  "license", "metadata_json")


def _canonical_json(value) -> str:
    """Canonical JSON for comparison.

    The corpus file stores ``metadata_json`` as a JSON string while the ORM column reads it back as
    a dict, so both sides must be normalised before they can be compared.
    """
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return value
    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)


def _canonical_time(value) -> str | None:
    """Compare timestamps by instant, not by string form.

    ``datetime.fromisoformat`` on an offset-aware string yields an aware datetime, but the database
    reads it back naive, so a naive/aware mismatch would report a false difference on every run.
    """
    if value is None:
        return None
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def content_signature(item: dict) -> tuple:
    """Everything that, when changed, invalidates the published index for this entry."""
    return tuple(_canonical_json(item.get(field)) if field == "metadata_json" else item.get(field)
                 for field in CONTENT_FIELDS)


def row_signature(row) -> tuple:
    return tuple(_canonical_json(row.metadata_json) if field == "metadata_json" else getattr(row, field)
                 for field in CONTENT_FIELDS)


def apply_to_database(corpus: dict, *, force_reindex: bool = False) -> dict:
    """Import technical content; only independently approved, unchanged rows may reindex.

    Three properties this function must keep:

    * **Idempotent.** Re-running it with unchanged input and unchanged embedding configuration must
      not bump ``version`` or spend an embedding call. Every bump revokes the old index and rebuilds
      it, so an unconditional bump would keep inflating versions and paying for embeddings.
    * **Index-consistent.** A change of embedding provider, model or dimension must rebuild the
      index even when the text is unchanged; otherwise retrieval silently keeps vectors produced by
      a different model and the configured similarity threshold stops meaning anything.
    * **Atomic per entry.** The row change and the index rebuild share one transaction: a rebuild
      failure must not leave an entry marked reviewed with a missing or partial index.
    """
    items = corpus.get("included") if isinstance(corpus, dict) else None
    if not isinstance(items, list):
        raise ValueError("CORPUS_STRUCTURE_INVALID")
    identifiers = set()
    for item in items:
        identifier = item.get("id") if isinstance(item, dict) else None
        if (not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,89}", identifier)
                or identifier in identifiers):
            raise ValueError("CORPUS_STRUCTURE_INVALID")
        identifiers.add(identifier)

    from sqlalchemy import delete, select, update
    from sqlalchemy.orm.attributes import set_committed_value

    from app.ai.rag.index import has_human_review, rebuild_knowledge
    from app.ai.settings import AISettings
    from app.core.database import SessionLocal
    from app.models import CulturalKnowledge, CulturalLocation, KnowledgeChunk

    settings = AISettings.configured()
    created = updated = skipped = chunks = 0
    index_reasons: dict[str, int] = {}
    failures: list[dict] = []
    with SessionLocal() as db:
        for item in items:
            identity = (item.get("id"), 0)
            try:
                row = db.scalar(select(CulturalKnowledge).where(
                    CulturalKnowledge.id == item["id"]).with_for_update())
                identity = (row.id, row.version) if row is not None else (item["id"], 0)
                location = db.get(CulturalLocation, item["location_id"])
                if (location is None or location.story_id != "suzhou-pingjiang"
                        or (row is not None and row.story_id != location.story_id)):
                    raise ValueError("IMPORT_LOCATION_INVALID")
                if any(not isinstance(item.get(field), str) or not item[field].strip()
                       for field in CONTENT_FIELDS if field != "metadata_json"):
                    raise ValueError("IMPORT_CONTENT_INVALID")
                if not isinstance(item.get("metadata_json"), dict):
                    raise ValueError("IMPORT_METADATA_INVALID")
                chapter = item["metadata_json"].get("min_chapter", 1)
                if isinstance(chapter, bool) or not isinstance(chapter, int) or not 1 <= chapter <= 100:
                    raise ValueError("IMPORT_CHAPTER_INVALID")
                is_new = row is None
                changed = is_new or row_signature(row) != content_signature(item)
                stored = list(db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == item["id"])))
                approved = not changed and has_human_review(row)
                reason = "new_entry" if is_new else "content_changed" if changed else None
                if not changed and row.review_status == "reviewed" and not approved:
                    reason = "unverified_review_reset"
                elif not changed and approved:
                    expected_model = settings.embedding_model if settings.embedding_provider != "none" else ""
                    expected_dim = settings.embedding_dimension if settings.embedding_provider != "none" else 0
                    if force_reindex:
                        reason = "forced"
                    elif not stored:
                        reason = "index_missing"
                    elif any(chunk.knowledge_version != row.version for chunk in stored):
                        reason = "index_stale_version"
                    elif any(chunk.embedding_model != expected_model or chunk.embedding_dimension != expected_dim
                             or chunk.metadata_json.get("embedding_provider", "none") != settings.embedding_provider
                             for chunk in stored):
                        reason = "embedding_config_changed"
                elif not changed and stored:
                    reason = "unreviewed_index_removed"
                if reason is None:
                    skipped += 1
                    db.rollback()
                    continue
                if is_new:
                    row = CulturalKnowledge(id=item["id"], story_id="suzhou-pingjiang")
                    db.add(row)
                else:
                    claimed = db.execute(update(CulturalKnowledge).where(
                        CulturalKnowledge.id == row.id, CulturalKnowledge.version == row.version,
                    ).values(version=row.version + int(changed or reason == "unverified_review_reset"))
                      .execution_options(synchronize_session=False))
                    if claimed.rowcount != 1:
                        raise ValueError("IMPORT_VERSION_CONFLICT")
                    set_committed_value(row, "version", identity[1] + int(changed or reason == "unverified_review_reset"))
                if changed:
                    for field in CONTENT_FIELDS:
                        setattr(row, field, item[field])
                    row.is_demo = False
                if changed or reason == "unverified_review_reset":
                    row.review_status, row.trust_level = "pending", "unverified"
                    row.reviewer = row.reviewed_at = None
                if is_new:
                    row.version = 1
                # Never pay for or publish pending/rejected candidates. Unchanged human
                # approval survives a technical reimport; content edits require a new review.
                written_chunks = rebuild_knowledge(db, row, settings) if approved else 0
                if not approved:
                    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == row.id))
                db.commit()
                created += int(is_new)
                updated += int(not is_new)
                chunks += written_chunks
                index_reasons[reason] = index_reasons.get(reason, 0) + 1
            except Exception as error:  # noqa: BLE001 - report every failing entry, keep going
                db.rollback()
                failures.append({"id": identity[0], "previous_version": identity[1],
                                 "error": type(error).__name__})
        return {"created": created, "updated": updated, "skipped": skipped,
                "chunks": chunks, "failures": failures, "reindex_reasons": index_reasons,
                "embedding_provider": settings.embedding_provider,
                "embedding_model": settings.embedding_model,
                "embedding_dimension": settings.embedding_dimension}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--research", type=Path,
                        default=DATA_DIR / "raw/culture-source-candidates.json")
    parser.add_argument("--output", type=Path,
                        default=DATA_DIR / "raw/culture-reviewed-corpus.json")
    parser.add_argument("--prepared-by", "--reviewer", dest="reviewer", default="【待确认】资料整理人",
                        help="技术整理人的署名；不授予文化审核或发布权限")
    parser.add_argument("--apply", action="store_true", help="import pending candidates; unchanged human approvals are preserved")
    parser.add_argument("--list", action="store_true", help="print the plan and exit without writing anything")
    parser.add_argument("--expect", type=int, default=None,
                        help="断言本次变更条数；用于证明重复导入不会再次改动（--expect 0）")
    parser.add_argument("--prepared-at", "--reviewed-at", dest="reviewed_at", default=None,
                        help="技术整理时间，不作为人工审核时间；缺省沿用已有记录以保证幂等")
    parser.add_argument("--force-reindex", action="store_true",
                        help="内容未变也强制重建索引；用于嵌入模型/维度变更或修复索引")
    args = parser.parse_args()
    try:
        if args.apply or not args.list:
            if not args.reviewer.strip() or "待确认" in args.reviewer:
                raise ValueError("PREPARER_REQUIRED: 请填资料整理人的署名；导入后仍需独立人工审核")
        previous = None
        if args.output.exists():
            try:
                previous = json.loads(args.output.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                previous = None
        corpus = build(load_research(args.research), args.reviewer,
                       reviewed_at=args.reviewed_at, previous=previous)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"executed": False, "reason": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({"summary": corpus["summary"],
                      "included_ids": [item["id"] for item in corpus["included"]],
                      "excluded": corpus["excluded"]}, ensure_ascii=False, indent=2))
    if args.list:
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"written": str(args.output.resolve())}, ensure_ascii=False))
    if not args.apply:
        print(json.dumps({"applied": False,
                          "hint": "--apply 仅导入待审核资料；人工审核和正式发布需通过管理端另行完成"}, ensure_ascii=False))
        return 0
    result = apply_to_database(corpus, force_reindex=args.force_reindex)
    print(json.dumps({"applied": True, **result}, ensure_ascii=False))
    # 任一条目写入或索引失败都必须让调用方看到非零退出码，避免把部分成功当成成功。
    if result["failures"]:
        return 1
    if args.expect is not None and result["created"] + result["updated"] != args.expect:
        print(json.dumps({"executed": False, "reason":
                          f"EXPECT_MISMATCH: 期望变更 {args.expect} 条，实际 "
                          f"{result['created'] + result['updated']} 条（跳过 {result['skipped']} 条）"},
                         ensure_ascii=False), file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
