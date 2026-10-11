"""Read-only real-provider evaluation; never substitutes Mock or invents human ratings.

Requires an explicitly reviewed dataset and already published reviewed knowledge.
Run from backend: python scripts/evaluate_live_ai.py --dataset ../data/testsets/my-live-cases.json
"""
import argparse
import hashlib
import json
import platform
import sys
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.ai.agents.npc import PROMPT_VERSION, respond  # noqa: E402
from app.ai.llm.providers import ChatProvider, EmbeddingProvider, Generation, ProviderError  # noqa: E402
from app.ai.rag.index import approved_records  # noqa: E402
from app.ai.safety.policy import POLICY_VERSION, input_risk, redact_log_text  # noqa: E402
from app.ai.settings import AISettings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models import Character, CulturalKnowledge, CulturalLocation  # noqa: E402
from scripts.evaluation_support import (  # noqa: E402
    UsageTransport,
    dry_plan,
    knowledge_hits,
    require_call_authorization,
    validate_reviewed_dataset,
)

CATEGORIES = {
    "direct_knowledge", "multi_evidence", "out_of_knowledge", "disputed", "legend", "fiction",
    "npc_scope", "story_disclosure", "prompt_injection", "false_premise", "invalid_citation", "invalid_json",
}


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    category: str
    npc_id: str
    role_id: str = "scholar"
    location_id: str
    chapter: int = Field(ge=1)
    question: str = Field(min_length=1, max_length=1000)
    expected_behavior: Literal["answer", "refuse"]
    expected_evidence_ids: list[str] = Field(default_factory=list)
    expected_refusal_reasons: list[str] = Field(default_factory=list)
    expected_answer_concepts: list[str] = Field(default_factory=list)
    difficulty: str | None = None
    annotation_notes: str = ""


class Dataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str = "live-evaluation-v1"
    dataset_version: str
    status: Literal["reviewed", "template_requires_human_review"]
    reviewer: str | None
    reviewed_at: str | None
    story_id: str = "suzhou-pingjiang"
    sampling_notes: str
    cases: list[Case] = Field(min_length=1)


class CountingChatProvider(ChatProvider):
    """Track actual model requests separately from deterministic pipeline refusals."""

    def __init__(self, settings: AISettings):
        self.usage = UsageTransport()
        super().__init__(settings, transport=self.usage)
        self.calls = 0

    def generate(self, messages: list[dict[str, str]], mock_reply: dict) -> Generation:
        self.calls += 1
        result = super().generate(messages, mock_reply)
        if result.mock or result.provider == "mock":
            raise ProviderError("MOCK_FALLBACK_FORBIDDEN")
        return result


def verify_configuration(settings: AISettings) -> None:
    if settings.provider not in {"deepseek", "qwen", "ollama"}:
        raise ValueError("LIVE_LLM_REQUIRED: configure a real LLM provider; Mock is forbidden")
    if not settings.model or not settings.base_url:
        raise ValueError("LIVE_LLM_CONFIG_REQUIRED: configure LLM_MODEL and LLM_BASE_URL")
    if settings.provider != "ollama" and not settings.api_key:
        raise ValueError("LIVE_LLM_KEY_REQUIRED: configure the private LLM_API_KEY locally")
    if settings.embedding_provider not in {"openai-compatible", "qwen", "ollama"}:
        raise ValueError("LIVE_EMBEDDING_REQUIRED: keyword-only and fake embeddings are forbidden")
    if not settings.embedding_url or not settings.embedding_model or settings.embedding_dimension <= 0:
        raise ValueError("LIVE_EMBEDDING_CONFIG_REQUIRED: configure model, base URL and dimension")
    if settings.embedding_provider != "ollama" and not settings.embedding_key:
        raise ValueError("LIVE_EMBEDDING_KEY_REQUIRED: configure the private EMBEDDING_API_KEY locally")


def read_dataset(path: Path) -> Dataset:
    dataset = Dataset.model_validate_json(path.read_text(encoding="utf-8"))
    validate_reviewed_dataset(dataset)
    if dataset.status != "reviewed" or not dataset.reviewer or not dataset.reviewed_at:
        raise ValueError("DATASET_REVIEW_REQUIRED: fill and independently review the template first")
    datetime.fromisoformat(dataset.reviewed_at.replace("Z", "+00:00"))
    ids = [case.id for case in dataset.cases]
    if len(ids) != len(set(ids)):
        raise ValueError("DATASET_CASE_IDS_DUPLICATED")
    for case in dataset.cases:
        if case.category not in CATEGORIES or "待补充" in case.question:
            raise ValueError(f"DATASET_CASE_INCOMPLETE: {case.id}")
        if input_risk(case.question) == "PRIVACY_SENSITIVE":
            raise ValueError(f"DATASET_PRIVACY_INPUT_REJECTED: {case.id}")
        if case.expected_behavior == "answer" and not case.expected_evidence_ids:
            raise ValueError(f"DATASET_EVIDENCE_REQUIRED: {case.id}")
    return dataset


def evaluate(dataset: Dataset, settings: AISettings, *, allow_paid_calls: bool = False) -> dict:
    require_call_authorization(allow_paid_calls)
    validate_reviewed_dataset(dataset)
    verify_configuration(settings)
    chat = CountingChatProvider(settings)
    embedding_usage = UsageTransport()
    embedder = EmbeddingProvider(settings, transport=embedding_usage)
    records = []
    embedding_calls = 0
    with SessionLocal() as db:
        evidence = approved_records(db, dataset.story_id)
        if not evidence:
            raise ValueError("REVIEWED_PUBLISHED_CORPUS_REQUIRED: pending seed is not an evaluation corpus")
        if not any(case.expected_behavior == "answer" for case in dataset.cases):
            raise ValueError("LIVE_ANSWER_CASE_REQUIRED: refusal-only cases cannot verify a real model")
        allowed_ids = {record.knowledge_id for record in evidence}
        for case in dataset.cases:
            if not set(case.expected_evidence_ids).issubset(allowed_ids):
                raise ValueError(f"DATASET_EVIDENCE_UNPUBLISHED: {case.id}")
        corpus_manifest = []
        for knowledge_id in sorted(allowed_ids):
            knowledge = db.get(CulturalKnowledge, knowledge_id)
            corpus_manifest.append({"id": knowledge.id, "version": knowledge.version, "sha256": hashlib.sha256(knowledge.content.encode()).hexdigest(), "source": knowledge.source, "source_url": knowledge.source_url, "license": knowledge.license, "reviewer": knowledge.reviewer, "reviewed_at": knowledge.reviewed_at.isoformat() if knowledge.reviewed_at else None})
        matching_vectors = [entry for entry in evidence if entry.embedding_model == settings.embedding_model and len(entry.embedding) == settings.embedding_dimension]
        if len(matching_vectors) != len(evidence):
            raise ValueError("CORPUS_EMBEDDING_MISMATCH: publish every evaluated chunk with the configured real embedding model/dimension")
        for case in dataset.cases:
            npc = db.get(Character, case.npc_id)
            role = db.get(Character, case.role_id)
            spot = db.get(CulturalLocation, case.location_id)
            if npc is None or npc.kind != "npc" or npc.story_id != dataset.story_id or role is None or role.kind != "player" or role.story_id != dataset.story_id or spot is None or spot.story_id != dataset.story_id:
                raise ValueError(f"DATASET_CHARACTER_OR_LOCATION_INVALID: {case.id}")
            if case.location_id not in npc.data.get("locationIds", []):
                raise ValueError(f"DATASET_NPC_UNAVAILABLE: {case.id}; use a legal current point and an out-of-scope question")
            started = time.perf_counter()
            calls_before = chat.calls
            error = None
            hits = []
            reply = None
            try:
                vector = None
                if not input_risk(case.question):
                    embedding_calls += 1
                    vector = embedder.embed([case.question])[0]
                hits = [] if input_risk(case.question) else knowledge_hits(case.question, evidence, {case.location_id}, case.chapter, vector, settings.embedding_model, 4)
                reply = respond(case.question, hits, npc.data, role.data, {"state": "DIALOGUE", "spot": case.location_id, "chapter": case.chapter}, [], chat)
            except ProviderError as provider_error:
                error = str(provider_error)
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            actual_answer = reply is not None and reply.intent != "refusal"
            retrieved = list(dict.fromkeys(hit.evidence.knowledge_id for hit in hits))
            expected = set(case.expected_evidence_ids)
            recall = len(expected.intersection(retrieved)) / len(expected) if expected else None
            citations = reply.evidence_ids if reply else []
            citation_valid = set(citations).issubset(set(retrieved)) if reply else False
            provider_failure = error is not None or (reply is not None and reply.reason in {"MODEL_UNAVAILABLE", "MODEL_NOT_CONFIGURED", "BASE_URL_NOT_CONFIGURED", "PROVIDER_INVALID", "MOCK_FALLBACK_FORBIDDEN", "API_KEY_MISSING"})
            behavior_matches = not provider_failure and reply is not None and actual_answer == (case.expected_behavior == "answer")
            refusal_reason_matches = not case.expected_refusal_reasons or (reply is not None and reply.reason in case.expected_refusal_reasons)
            records.append({
                "id": case.id, "category": case.category, "question": redact_log_text(case.question),
                "expected_behavior": case.expected_behavior, "expected_evidence_ids": case.expected_evidence_ids,
                "expected_refusal_reasons": case.expected_refusal_reasons,
                "expected_answer_concepts": case.expected_answer_concepts,
                "retrieved_evidence_ids": retrieved, "retrieval_recall_at_4": recall,
                "retrieved_chunk_ids": [hit.evidence.id for hit in hits],
                "citation_ids_valid": citation_valid, "behavior_matches": behavior_matches,
                "refusal_reason_matches": refusal_reason_matches, "pipeline_checks_passed": behavior_matches and refusal_reason_matches and citation_valid,
                "model_called": chat.calls > calls_before, "provider_failure": provider_failure,
                "elapsed_ms": elapsed, "error_code": error,
                "reply": asdict(reply) if reply else None,
                "manual_review": {"reviewer": None, "reviewed_at": None, "factual_grounding_0_to_2": None, "role_consistency_0_to_2": None, "type_labels_correct": None, "unsafe_output": None, "notes": "人工核对实际回答与证据后填写；自动引用检查不等于事实真实性评分。"},
            })
        # No ORM writes or approved-state changes are performed by this script.
        db.rollback()
    latencies = sorted(row["elapsed_ms"] for row in records)
    answer_rows = [row for row in records if row["expected_behavior"] == "answer"]
    recalls = [row["retrieval_recall_at_4"] for row in answer_rows]
    return {
        "schema_version": "live-evaluation-results-v1", "executed_at_utc": datetime.now(UTC).isoformat(),
        "experiment_kind": "real_llm_and_real_embedding_pipeline", "python_version": platform.python_version(),
        "dataset_version": dataset.dataset_version, "dataset_reviewer": dataset.reviewer,
        "dataset_reviewed_at": dataset.reviewed_at, "dataset_status": dataset.status,
        "provider": settings.provider, "model": settings.model,
        "embedding_provider": settings.embedding_provider, "embedding_model": settings.embedding_model,
        "embedding_dimension": settings.embedding_dimension, "vector_distance": "cosine", "index": "exact",
        "prompt_version": PROMPT_VERSION, "safety_policy_version": POLICY_VERSION,
        "ranking_unit": "distinct_knowledge_id", "authorization": "explicit_allow_paid_calls",
        "usage": {"llm": chat.usage.summary(), "embedding": embedding_usage.summary()},
        "corpus_manifest": corpus_manifest,
        "summary": {"case_count": len(records), "actual_model_calls": chat.calls, "actual_embedding_calls": embedding_calls, "pipeline_check_pass_count": sum(row["pipeline_checks_passed"] for row in records), "provider_failure_count": sum(row["provider_failure"] for row in records), "mean_retrieval_recall_at_4_on_answer_cases": round(sum(recalls) / len(recalls), 4) if recalls else None, "mean_elapsed_ms": round(sum(latencies) / len(latencies), 2), "p95_elapsed_ms": latencies[max(0, (95 * len(latencies) + 99) // 100 - 1)], "human_fact_accuracy": None, "human_hallucination_rate": None, "human_review_complete": False},
        "limitations": ["引用 ID 校验不等于逐句事实一致性；人工评分尚未填写。", "样本范围由人工审核数据集决定；不能将单次实验推广为总体准确率。", "本工具直接调用只读检索与 Agent；API 状态、认证和位置另由集成测试验证。", "invalid_citation/invalid_json 类检查真实模型自然输出，不能保证每次产生异常；故障注入属于独立合成测试。"],
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=BACKEND.parent / "data/testsets/real-model-evaluation-template.json")
    parser.add_argument("--output", type=Path, default=BACKEND.parent / "data/testsets/live-ai-results.json")
    parser.add_argument("--allow-paid-calls", action="store_true", help="explicitly authorize this run's provider calls; default only prints a dry plan")
    args = parser.parse_args()
    try:
        settings = AISettings.configured()
        verify_configuration(settings)  # Fail before any network call when credentials/configuration are absent.
        dataset = read_dataset(args.dataset)
        if not args.allow_paid_calls:
            print(json.dumps({"executed": False, "requires_explicit_authorization": True, "dry_plan": dry_plan(dataset, chat=True)}, ensure_ascii=False))
            return 0
        result = evaluate(dataset, settings, allow_paid_calls=True)
        result["dataset_sha256"] = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    except (ValueError, ValidationError, OSError) as error:
        message = "DATASET_SCHEMA_INVALID" if isinstance(error, ValidationError) else str(error)
        print(json.dumps({"executed": False, "reason": message}, ensure_ascii=False), file=sys.stderr)
        return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), "summary": result["summary"]}, ensure_ascii=False))
    return 1 if result["summary"]["provider_failure_count"] or result["summary"]["actual_model_calls"] == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
