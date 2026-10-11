"""Retrieval-arm comparison (keyword / vector / hybrid) over an already reviewed corpus.

This tool is deliberately narrower than ``evaluate_live_ai.py``: it measures **retrieval only**
and therefore needs a real Embedding provider but **no chat model at all**. That makes the
Retrieval@K experiment reproducible without spending anything on generation.

Fair-comparison rules enforced here:
  * every arm sees the exact same evidence set and the same per-case chapter/spot scope;
  * each question is embedded exactly once and that one vector is reused by every arm;
  * each arm runs with the identical ``limit``;
  * the arm configuration (thresholds, weights, model, dimension) travels with the result.

It refuses to run instead of faking numbers: no reviewed corpus, no embedding provider, or a
dataset with no answer case all produce ``{"executed": false, "reason": ...}`` on stderr.

Run from backend:
    python scripts/evaluate_retrieval_arms.py
    python scripts/evaluate_retrieval_arms.py --dataset ../data/testsets/my-retrieval-cases.json
"""
import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.ai.llm.providers import EmbeddingProvider, ProviderError  # noqa: E402
from app.ai.rag.index import approved_records  # noqa: E402
from app.ai.rag.retrieval import RETRIEVAL_CONFIG, RetrievalMode  # noqa: E402
from app.ai.safety.policy import input_risk  # noqa: E402
from app.ai.settings import AISettings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models import CulturalKnowledge, CulturalLocation  # noqa: E402
from scripts.evaluation_support import (  # noqa: E402
    UsageTransport,
    dry_plan,
    knowledge_hits,
    require_call_authorization,
    validate_reviewed_dataset,
)

ARMS: tuple[RetrievalMode, ...] = ("keyword", "vector", "hybrid")


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    category: str
    npc_id: str | None = None
    role_id: str | None = None
    location_id: str
    chapter: int = Field(ge=1)
    question: str = Field(min_length=1, max_length=1000)
    expected_behavior: str | None = None
    expected_evidence_ids: list[str] = Field(default_factory=list)
    expected_refusal_reasons: list[str] = Field(default_factory=list)
    expected_answer_concepts: list[str] = Field(default_factory=list)
    difficulty: str | None = None
    annotation_notes: str = ""


class Dataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str = "live-evaluation-v1"
    dataset_version: str
    status: str = "template_requires_human_review"
    reviewer: str | None = None
    reviewed_at: str | None = None
    story_id: str = "suzhou-pingjiang"
    sampling_notes: str = ""
    cases: list[Case] = Field(min_length=1)


def require_embedding(settings: AISettings) -> None:
    """Retrieval arms need vectors; a keyword-only run must not be dressed up as a comparison."""
    if settings.embedding_provider not in {"openai-compatible", "qwen", "ollama"}:
        raise ValueError("EMBEDDING_REQUIRED: configure a real Embedding provider; 'none' cannot run a comparison")
    if not settings.embedding_url or not settings.embedding_model or settings.embedding_dimension <= 0:
        raise ValueError("EMBEDDING_CONFIG_REQUIRED: configure EMBEDDING_MODEL, EMBEDDING_BASE_URL and EMBEDDING_DIMENSION")
    if settings.embedding_provider != "ollama" and not settings.embedding_key:
        raise ValueError("EMBEDDING_KEY_REQUIRED: configure the private EMBEDDING_API_KEY locally")


def read_dataset(path: Path) -> Dataset:
    dataset = Dataset.model_validate_json(path.read_text(encoding="utf-8"))
    validate_reviewed_dataset(dataset)
    return dataset


def build_corpus_manifest(db, allowed_ids: set[str]) -> list[dict]:
    """Record exactly which reviewed versions produced these numbers."""
    entries = []
    for knowledge_id in sorted(allowed_ids):
        knowledge = db.get(CulturalKnowledge, knowledge_id)
        entries.append({
            "id": knowledge.id, "title": knowledge.title, "location_id": knowledge.location_id,
            "content_type": knowledge.content_type, "version": knowledge.version,
            "content_sha256": hashlib.sha256(knowledge.content.encode("utf-8")).hexdigest(),
            "source": knowledge.source, "source_url": knowledge.source_url,
            "license": knowledge.license, "reviewer": knowledge.reviewer,
            "reviewed_at": knowledge.reviewed_at.isoformat() if knowledge.reviewed_at else None,
        })
    return entries


def run_arm(mode: RetrievalMode, arm_cases: list[dict], evidence, embedding_model: str, limit: int) -> dict:
    latencies = []
    records = []
    retrieved_counter = 0
    for case in arm_cases:
        started = time.perf_counter()
        hits = [] if input_risk(case["question"]) else knowledge_hits(case["question"], evidence, {case["location_id"]}, case["chapter"], case["vector"], embedding_model, limit, mode)
        latencies.append(round((time.perf_counter() - started) * 1000, 3))
        retrieved_ids = list(dict.fromkeys(hit.evidence.knowledge_id for hit in hits))
        expected = set(case["expected_evidence_ids"])
        hit_rank = next((index + 1 for index, value in enumerate(retrieved_ids) if value in expected), None)
        recalled = expected & set(retrieved_ids)
        records.append({
            "id": case["id"], "category": case["category"], "difficulty": case.get("difficulty"),
            "location_id": case["location_id"],
            "chapter": case["chapter"], "expected_behavior": case["expected_behavior"],
            "expected_evidence_ids": sorted(expected), "retrieved_evidence_ids": retrieved_ids,
            "retrieved_chunk_ids": [hit.evidence.id for hit in hits],
            "recall_at_k": round(len(recalled) / len(expected), 4) if expected else None,
            "reciprocal_rank": round(1 / hit_rank, 4) if hit_rank else (0.0 if expected else None),
            "precision_at_k": round(len(recalled) / limit, 4) if expected else None,
            "precision_of_returned": round(len(recalled) / len(retrieved_ids), 4) if retrieved_ids and expected else (0.0 if expected else None),
            "no_evidence_returned": not retrieved_ids,
        })
        if retrieved_ids:
            retrieved_counter += 1
    ordered = sorted(latencies)
    answer_records = [row for row in records if row["recall_at_k"] is not None]
    recall_rows = [row["recall_at_k"] for row in answer_records]
    rr_rows = [row["reciprocal_rank"] for row in answer_records if row["reciprocal_rank"] is not None]
    by_category: dict[str, dict] = {}
    by_difficulty: dict[str, dict] = {}
    for row in answer_records:
        bucket = by_category.setdefault(row["category"], {"cases": 0, "recall_sum": 0.0, "full_hit": 0})
        bucket["cases"] += 1
        bucket["recall_sum"] += row["recall_at_k"]
        bucket["full_hit"] += row["recall_at_k"] == 1.0
        # Difficulty grouping is what shows whether an arm actually adds reach beyond wording overlap.
        level = row.get("difficulty") or "unlabelled"
        level_bucket = by_difficulty.setdefault(level, {"cases": 0, "recall_sum": 0.0, "full_hit": 0})
        level_bucket["cases"] += 1
        level_bucket["recall_sum"] += row["recall_at_k"]
        level_bucket["full_hit"] += row["recall_at_k"] == 1.0
    return {
        "records": records,
        "summary": {
            "cases": len(records),
            "scored_cases": len(answer_records),
            "cases_with_no_evidence": len(records) - retrieved_counter,
            "mean_recall_at_k": round(sum(recall_rows) / len(recall_rows), 4) if recall_rows else None,
            "full_recall_cases": sum(value == 1.0 for value in recall_rows),
            "mean_reciprocal_rank": round(sum(rr_rows) / len(rr_rows), 4) if rr_rows else None,
            "mean_precision_at_k": round(
                sum(row["precision_at_k"] for row in answer_records) / len(answer_records), 4) if answer_records else None,
            "mean_elapsed_ms": round(sum(latencies) / len(latencies), 3),
            "p95_elapsed_ms": ordered[max(0, (95 * len(ordered) + 99) // 100 - 1)],
            "max_elapsed_ms": ordered[-1],
        },
        "by_category": {key: {"cases": value["cases"],
                             "mean_recall_at_k": round(value["recall_sum"] / value["cases"], 4),
                             "full_recall_cases": value["full_hit"]}
                        for key, value in sorted(by_category.items())},
        "by_difficulty": {key: {"cases": value["cases"],
                                "mean_recall_at_k": round(value["recall_sum"] / value["cases"], 4),
                                "full_recall_cases": value["full_hit"]}
                          for key, value in sorted(by_difficulty.items())},
    }


def evaluate(dataset: Dataset, settings: AISettings, limit: int, *, allow_paid_calls: bool = False) -> dict:
    require_call_authorization(allow_paid_calls)
    validate_reviewed_dataset(dataset)
    require_embedding(settings)
    if limit < 1 or limit > 50:
        raise ValueError("LIMIT_OUT_OF_RANGE: use 1..50")
    usage = UsageTransport()
    embedder = EmbeddingProvider(settings, transport=usage)
    with SessionLocal() as db:
        evidence = approved_records(db, dataset.story_id)
        if not evidence:
            raise ValueError("REVIEWED_PUBLISHED_CORPUS_REQUIRED: pending seed is not an evaluation corpus")
        allowed_ids = {record.knowledge_id for record in evidence}
        unpublished = sorted({case_id for case in dataset.cases
                              for case_id in case.expected_evidence_ids if case_id not in allowed_ids})
        if unpublished:
            raise ValueError(f"DATASET_EVIDENCE_UNPUBLISHED: {', '.join(unpublished)}")
        for case in dataset.cases:
            spot = db.get(CulturalLocation, case.location_id)
            if spot is None or spot.story_id != dataset.story_id:
                raise ValueError(f"DATASET_LOCATION_INVALID: {case.id}")
        matching = [entry for entry in evidence
                    if entry.embedding_model == settings.embedding_model
                    and len(entry.embedding) == settings.embedding_dimension]
        if len(matching) != len(evidence):
            raise ValueError("CORPUS_EMBEDDING_MISMATCH: publish every evaluated chunk with the configured real embedding model/dimension")
        manifest = build_corpus_manifest(db, allowed_ids)
        # Embed every question exactly once; all arms reuse the same vector for a fair comparison.
        eligible = [case for case in dataset.cases if not input_risk(case.question)]
        questions = [case.question for case in eligible]
        started = time.perf_counter()
        vectors = embedder.embed(questions) if questions else []
        embedding_elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        by_id = {case.id: vector for case, vector in zip(eligible, vectors, strict=True)}
        arm_cases = [{**case.model_dump(), "vector": by_id.get(case.id)} for case in dataset.cases]
        arms = {mode: run_arm(mode, arm_cases, evidence, settings.embedding_model, limit) for mode in ARMS}
        # No ORM writes: this tool never changes review state or publishes anything.
        db.rollback()
    return {
        "schema_version": "retrieval-arm-comparison-v1",
        "executed_at_utc": datetime.now(UTC).isoformat(),
        "experiment_kind": "retrieval_only_real_embedding",
        "python_version": platform.python_version(),
        "dataset_version": dataset.dataset_version,
        "dataset_status": dataset.status,
        "dataset_reviewer": dataset.reviewer,
        "dataset_reviewed_at": dataset.reviewed_at,
        "question_count": len(dataset.cases),
        "arms": list(ARMS),
        "limit": limit,
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.embedding_model,
        "embedding_dimension": settings.embedding_dimension,
        "embedding_calls": int(bool(questions)),
        "embedded_text_count": len(questions),
        "embedding_elapsed_ms": embedding_elapsed_ms,
        "vector_distance": RETRIEVAL_CONFIG["distance"],
        "index": RETRIEVAL_CONFIG["index"],
        "retrieval_config": RETRIEVAL_CONFIG,
        "ranking_unit": "distinct_knowledge_id",
        "metric_definitions": {"recall_at_k": "relevant distinct knowledge IDs among top K / expected IDs", "precision_at_k": "relevant distinct knowledge IDs among top K / configured K; empty answer retrieval scores zero", "precision_of_returned": "relevant returned distinct knowledge IDs / actually returned IDs", "unlabeled_or_refusal_cases": "excluded from means unless independently annotated with relevant evidence"},
        "authorization": "explicit_allow_paid_calls",
        "usage": usage.summary(),
        "corpus_count": len(evidence),
        "corpus_manifest": manifest,
        "results": {mode: arms[mode]["records"] for mode in ARMS},
        "summaries": {mode: arms[mode]["summary"] for mode in ARMS},
        "by_category": {mode: arms[mode]["by_category"] for mode in ARMS},
        "by_difficulty": {mode: arms[mode]["by_difficulty"] for mode in ARMS},
        "summaries_are_retrieval_only": True,
        "limitations": [
            "只测检索，不含生成；不衡量文化事实准确性、幻觉率或表达质量。",
            "Recall@K 标准来自标记已人审的数据集，但本工具不能代替审核者核实标注内容。",
            "样本由人工数据集决定，不能把单次结果推广为总体召回率。",
            "本轮未做人工事实性评分；需要人工评分时必须另附评分标准与记录。",
            "阈值为工程初始参数，不是调优结果；不得据此宣称检索质量达到某一档位。",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path,
                        default=BACKEND.parent / "data/testsets/real-model-evaluation-template.json")
    parser.add_argument("--output", type=Path,
                        default=BACKEND.parent / "data/testsets/retrieval-arm-results.json")
    parser.add_argument("--limit", type=int, default=RETRIEVAL_CONFIG["default_limit"],
                        help="top-K used by every arm (default 4)")
    parser.add_argument("--allow-paid-calls", action="store_true", help="explicitly authorize this run's provider calls; default only prints a dry plan")
    args = parser.parse_args()
    try:
        if args.limit < 1 or args.limit > 50:
            raise ValueError("LIMIT_OUT_OF_RANGE: use 1..50")
        settings = AISettings.configured()
        require_embedding(settings)  # fail before any network call
        dataset = read_dataset(args.dataset)
        if not args.allow_paid_calls:
            print(json.dumps({"executed": False, "requires_explicit_authorization": True, "dry_plan": dry_plan(dataset, chat=False)}, ensure_ascii=False))
            return 0
        result = evaluate(dataset, settings, args.limit, allow_paid_calls=True)
        result["dataset_sha256"] = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    except (ValueError, ValidationError, OSError) as error:
        message = "DATASET_SCHEMA_INVALID" if isinstance(error, ValidationError) else str(error)
        print(json.dumps({"executed": False, "reason": message}, ensure_ascii=False), file=sys.stderr)
        return 2
    except ProviderError as error:
        print(json.dumps({"executed": False, "reason": f"EMBEDDING_CALL_FAILED: {error}"}, ensure_ascii=False), file=sys.stderr)
        return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()),
                      "summaries": result["summaries"],
                      "corpus_count": result["corpus_count"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
