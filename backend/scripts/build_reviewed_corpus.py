"""Turn the verified source research into a reviewed, publishable corpus.

Input : ``data/raw/culture-source-candidates.json`` — the per-item source verification produced by
        the previous maintenance round, including its verdict for every knowledge item.
Output: a review file (default ``data/raw/culture-reviewed-corpus.json``) that the admin publish
        path can consume, plus an optional direct apply into the database.

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


def build(research: dict, reviewer: str) -> dict:
    sources = source_index(research)
    reviewed_at = datetime.now(UTC).isoformat()
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
        location_id = SPOT_BY_KNOWLEDGE.get(knowledge_id)
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
            "review_status": "reviewed",
            "reviewer": reviewer,
            "reviewed_at": reviewed_at,
            "is_demo": False,
            "metadata_json": {
                "min_chapter": 1,
                "verification_status": verdict,
                "content_origin": "research_proposed_content" if verdict in REWORD_VERDICTS else "original_content",
                "review_note": DEFAULT_REVIEW_NOTE,
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
        "generated_at_utc": reviewed_at,
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


def apply_to_database(corpus: dict) -> dict:
    """Write the reviewed rows and publish their index. Never runs without an explicit --apply."""
    from app.ai.rag.index import rebuild_knowledge
    from app.ai.settings import AISettings
    from app.core.database import SessionLocal
    from app.models import CulturalKnowledge

    settings = AISettings.configured()
    created = updated = chunks = 0
    with SessionLocal() as db:
        for item in corpus["included"]:
            row = db.get(CulturalKnowledge, item["id"])
            if row is None:
                row = CulturalKnowledge(id=item["id"], story_id="suzhou-pingjiang")
                db.add(row)
                created += 1
            else:
                updated += 1
            row.location_id = item["location_id"] or row.location_id
            row.title = item["title"]
            row.content = item["content"]
            row.content_type = item["content_type"]
            row.source = item["source"]
            row.source_url = item["source_url"]
            row.license = item["license"]
            row.review_status = item["review_status"]
            row.reviewer = item["reviewer"]
            row.reviewed_at = datetime.fromisoformat(item["reviewed_at"])
            row.is_demo = item["is_demo"]
            row.metadata_json = item["metadata_json"]
            row.version = (row.version or 0) + 1  # content changed -> old index must be revoked
            db.commit()
            chunks += rebuild_knowledge(db, row, settings)
            db.commit()
        return {"created": created, "updated": updated, "chunks": chunks,
                "embedding_provider": settings.embedding_provider,
                "embedding_model": settings.embedding_model,
                "embedding_dimension": settings.embedding_dimension}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--research", type=Path,
                        default=DATA_DIR / "raw/culture-source-candidates.json")
    parser.add_argument("--output", type=Path,
                        default=DATA_DIR / "raw/culture-reviewed-corpus.json")
    parser.add_argument("--reviewer", default="【待确认】参赛团队指定审核人")
    parser.add_argument("--apply", action="store_true", help="write the corpus into the database and publish its index")
    parser.add_argument("--list", action="store_true", help="print the plan and exit without writing anything")
    args = parser.parse_args()
    try:
        if args.apply or not args.list:
            if not args.reviewer.strip() or "待确认" in args.reviewer:
                raise ValueError("REVIEWER_REQUIRED: 正式语料必须填真实审核人署名，不能使用占位符")
        corpus = build(load_research(args.research), args.reviewer)
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
                          "hint": "复跑时加 --apply 才会写入数据库并发布索引"}, ensure_ascii=False))
        return 0
    result = apply_to_database(corpus)
    print(json.dumps({"applied": True, **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
