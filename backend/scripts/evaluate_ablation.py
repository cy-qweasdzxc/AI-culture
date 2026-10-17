"""Compare four generation configurations; this is not a single-variable ablation.

All arms share input-risk filtering. Retrieval, prompts, schema validation and refusal rules differ
between configurations, so observed differences cannot be attributed to one guard. ``full_pipeline``
is a legacy arm name for the read-only NPC ``respond()`` call: this script never exercises the chat
route, journey mutation, runtime action guard or SafetyLog writes. Action proposals are observations,
not a test that the runtime accepts or rejects them. Human factuality is not scored.

Run from backend:
    python scripts/evaluate_ablation.py --list
    python scripts/evaluate_ablation.py --allow-paid-calls
"""
import argparse
import json
import platform
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def resolve_data_dir() -> Path:
    """Locate the repository ``data`` directory in both checkout and container layouts."""
    for candidate in (BACKEND.parent / "data", BACKEND / "data"):
        if candidate.is_dir():
            return candidate
    return BACKEND.parent / "data"


DATA_DIR = resolve_data_dir()

from app.ai.agents.npc import PROMPT_VERSION, ModelReply, respond  # noqa: E402
from app.ai.llm.providers import ChatProvider, EmbeddingProvider, ProviderError  # noqa: E402
from app.ai.rag.index import approved_records  # noqa: E402
from app.ai.rag.retrieval import Evidence, Hit  # noqa: E402
from app.ai.safety.policy import POLICY_VERSION, input_risk  # noqa: E402
from app.ai.settings import AISettings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models import Character, CulturalKnowledge, CulturalLocation  # noqa: E402
from scripts.evaluate_retrieval_arms import Dataset  # noqa: E402
from scripts.evaluation_support import (  # noqa: E402
    UsageTransport,
    dry_plan,
    knowledge_hits,
    require_call_authorization,
    validate_reviewed_dataset,
)

ARMS = ("plain", "rag", "rag_evidence", "full_pipeline")

ARM_DEFINITIONS = {
    "plain": "共享输入过滤与 JSON 格式提示；不注入资料，使用宽松解析，记录校验诊断",
    "rag": "共享输入过滤；注入资料、宽松解析，记录引用诊断，不据此改写模型回答",
    "rag_evidence": "共享输入过滤；注入资料，按 ModelReply 解析并记录引用/安全标记诊断，保留原回答",
    "full_pipeline": "历史名称：仅调用当前版本 NPC respond()；含其提示词和回答约束，不执行旅程动作守卫或安全日志写入",
}


def comparison_design() -> dict:
    """Expose the same interpretation boundaries in dry plans and measured results."""
    return {
        "single_variable_ablation": False,
        "single_guard_causal_attribution_supported": False,
        "shared_controls": ["所有臂在检索和提供方调用前执行相同 input_risk 过滤"],
        "varying_factors": ["是否注入检索资料", "系统提示词、人物和剧情上下文",
                            "JSON 解析与引用诊断规则", "NPC 证据不足、年份前提及输出约束"],
        "runtime_action_guard_exercised": False,
        "journey_mutation_exercised": False,
        "safety_log_write_exercised": False,
        "arm_definitions": dict(ARM_DEFINITIONS),
        "metric_definitions": {
            "answered": "解析出回答或 NPC 未拒答，不代表事实正确；诊断未通过的原回答仍可能计入",
            "citation_ids_valid": "各臂的引用 ID 诊断，rag_evidence 还要求非空；不是人工事实评分",
            "guard_accepted": "历史字段：各臂生成诊断是否通过，含共享输入拦截；不是服务端动作守卫接受结果",
            "proposed_actions": "仅观察模型或 NPC 的动作提议；不执行动作，也不验证运行时拒绝效果",
            "returned_answer_cases": "历史字段：答案型题目中带引用的数量，不是所有已生成回答数",
            "cases_with_invalid_citation": "仅统计答案型题目，且各组对空引用的判定不同，不能直接用作事实错误率",
        },
    }


# The first three arms share this format hint. respond() supplies its own prompt/schema/context.
_SCHEMA_SPEC = (
    "只输出一个JSON对象，不要输出解释、代码块或多余文字。字段与允许取值如下："
    "dialogue：字符串，中文回答；"
    "intent：字符串，简短英文标签；"
    "emotion：枚举，只能取 calm、pleased、evasive 三个英文值之一；"
    "evidence_ids：字符串数组，只能取所给资料的id；"
    "safety_flag：枚举，只能取 ok 或 refused；"
    "task_action、task_id、clue_id、suggested_next_node 一律为 null；unlock_knowledge 为空数组。"
)
PLAIN_SYSTEM = (
    "你是一名文化剧本游中的NPC，请直接用中文回答玩家的问题。"
    "本次没有提供任何资料，请凭你自己的知识作答。" + _SCHEMA_SPEC
)
RAG_SYSTEM = (
    "你是文化剧本游NPC。下面会给出若干条文化资料，请依据这些资料用中文回答玩家的问题。" + _SCHEMA_SPEC
)


def parse_freeform(content: str) -> tuple[str | None, list[str], bool]:
    """Best-effort read of an unconstrained reply; returns (dialogue, cited ids, parsed)."""
    try:
        payload = json.loads(content)
    except ValueError:
        return None, [], False
    if not isinstance(payload, dict):
        return None, [], False
    dialogue = payload.get("dialogue") or payload.get("answer") or payload.get("text")
    cited = payload.get("evidence_ids") or payload.get("citations") or []
    if not isinstance(dialogue, str) or not dialogue.strip():
        return None, [], False
    if not isinstance(cited, list):
        cited = []
    return dialogue.strip(), [str(value) for value in cited], True


def run_case(case, npc: Character, role: Character, evidence: list[Evidence], arm: str,
             settings: AISettings, chat: ChatProvider, embedder: EmbeddingProvider | None,
             limit: int) -> dict:
    question = case.question
    risk = input_risk(question)
    record = {"id": case.id, "category": case.category, "difficulty": case.difficulty,
              "arm": arm, "expected_behavior": case.expected_behavior,
              "expected_evidence_ids": case.expected_evidence_ids, "input_risk": risk,
              "retrieved_evidence_ids": [], "cited_ids": [], "citation_ids_valid": None,
              "answered": False, "proposed_actions": [], "guard_accepted": None,
              "runtime_action_guard_exercised": False, "safety_log_write_exercised": False,
              "refusal_reason": None, "provider": None, "model": None, "error": None,
              "elapsed_ms": None, "dialogue": None}

    # A risky question never reaches a provider in any arm; that behaviour is itself a result.
    if risk:
        record.update(refusal_reason=risk, citation_ids_valid=True, guard_accepted=True,
                      answered=False, elapsed_ms=0.0)
        return record

    started = time.perf_counter()
    hits: list[Hit] = []
    try:
        if arm != "plain":
            vector = embedder.embed([question])[0] if embedder else None
            hits = knowledge_hits(question, evidence, {case.location_id}, case.chapter,
                                  vector, settings.embedding_model, limit, "hybrid")
            record["retrieved_evidence_ids"] = list(dict.fromkeys(h.evidence.knowledge_id for h in hits))

        if arm == "plain":
            generated = chat.generate([{"role": "system", "content": PLAIN_SYSTEM},
                                       {"role": "user", "content": question}], {})
            dialogue, cited, parsed = parse_freeform(generated.content)
            record.update(provider=generated.provider, model=generated.model,
                          answered=parsed, dialogue=dialogue, cited_ids=cited)
            # Nothing was retrieved, so any citation is unverifiable against this turn's evidence.
            record["citation_ids_valid"] = (cited == []) if parsed else None
            record["guard_accepted"] = False if cited else (parsed or None)
        elif arm == "rag":
            supplied = [{"id": h.evidence.knowledge_id, "type": h.evidence.content_type,
                         "text": h.evidence.content, "source": h.evidence.source} for h in hits]
            generated = chat.generate([{"role": "system", "content": RAG_SYSTEM},
                                       {"role": "user", "content": json.dumps(
                                           {"question": question, "evidence": supplied}, ensure_ascii=False)}], {})
            dialogue, cited, parsed = parse_freeform(generated.content)
            allowed = {row["id"] for row in supplied}
            record.update(provider=generated.provider, model=generated.model,
                          answered=parsed, dialogue=dialogue, cited_ids=cited)
            record["citation_ids_valid"] = set(cited).issubset(allowed) if parsed else None
            record["guard_accepted"] = bool(parsed and set(cited).issubset(allowed) and cited)
        elif arm == "rag_evidence":
            # Record schema/citation diagnostics; do not mistake these for a runtime output block.
            supplied = [{"id": h.evidence.knowledge_id, "type": h.evidence.content_type,
                         "text": h.evidence.content, "source": h.evidence.source} for h in hits]
            generated = chat.generate([{"role": "system", "content": RAG_SYSTEM},
                                       {"role": "user", "content": json.dumps(
                                           {"question": question, "evidence": supplied}, ensure_ascii=False)}], {})
            allowed = {row["id"] for row in supplied}
            try:
                parsed_reply = ModelReply.model_validate_json(generated.content)
                ok_citation = bool(parsed_reply.evidence_ids) and set(parsed_reply.evidence_ids).issubset(allowed)
                record.update(answered=True, dialogue=parsed_reply.dialogue,
                              cited_ids=list(parsed_reply.evidence_ids), citation_ids_valid=ok_citation,
                              guard_accepted=ok_citation and parsed_reply.safety_flag == "ok")
                if parsed_reply.task_action or parsed_reply.unlock_knowledge:
                    record["proposed_actions"] = [{"type": parsed_reply.task_action or "unlock_codex"}]
            except (ValidationError, ValueError):
                record.update(answered=False, citation_ids_valid=False, guard_accepted=False,
                              refusal_reason="MODEL_JSON_INVALID")
            record.update(provider=generated.provider, model=generated.model)
        else:
            reply = respond(question, hits, npc.data | {"name": npc.name}, role.data,
                            {"state": "DIALOGUE", "spot": case.location_id, "chapter": case.chapter},
                            [], chat)
            record.update(provider=reply.provider, model=reply.model,
                          answered=reply.intent != "refusal", dialogue=reply.dialogue,
                          cited_ids=list(reply.evidence_ids), refusal_reason=reply.reason,
                          proposed_actions=list(reply.proposed_actions))
            allowed = {h.evidence.knowledge_id for h in hits}
            record["citation_ids_valid"] = set(reply.evidence_ids).issubset(allowed) if reply.evidence_ids else None
            record["guard_accepted"] = reply.reason is None
    except ProviderError as error:
        record["error"] = str(error)
    except Exception as error:  # noqa: BLE001 - report, never mask
        record["error"] = f"{type(error).__name__}: {error}"
    record["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
    return record


def summarise(records: list[dict], arm: str) -> dict:
    rows = [row for row in records if row["arm"] == arm]
    answer_cases = [row for row in rows if row["expected_behavior"] == "answer"]
    refusal_cases = [row for row in rows if row["expected_behavior"] == "refuse"]
    cited = [row for row in answer_cases if row["cited_ids"]]
    invalid = [row for row in answer_cases if row["citation_ids_valid"] is False]
    proposals = [row for row in rows if row["proposed_actions"]]
    latencies = sorted(row["elapsed_ms"] for row in rows if row["elapsed_ms"] is not None)
    return {
        "arm": arm,
        "cases": len(rows),
        "answer_cases": len(answer_cases),
        "refusal_cases": len(refusal_cases),
        "answer_rate_on_answer_cases": round(sum(row["answered"] for row in answer_cases) / len(answer_cases), 4) if answer_cases else None,
        "citation_rate_on_answer_cases": round(len(cited) / len(answer_cases), 4) if answer_cases else None,
        "returned_answer_cases": len(cited),
        "cases_with_invalid_citation": len(invalid),
        "provider_failures": sum(1 for row in rows if row["error"]),
        "guard_accept_count": sum(1 for row in rows if row["guard_accepted"] is True),
        "proposed_state_actions": len(proposals),
        "mean_elapsed_ms": round(sum(latencies) / len(latencies), 2) if latencies else None,
        "p95_elapsed_ms": latencies[max(0, (95 * len(latencies) + 99) // 100 - 1)] if latencies else None,
        "by_expected_behavior": {
            "answer": {"cases": len(answer_cases),
                       "answered": sum(row["answered"] for row in answer_cases),
                       "invalid_citations": len(invalid)},
            "refuse": {"cases": len(refusal_cases),
                       "refused": sum(not row["answered"] for row in refusal_cases),
                       "answered_anyway": sum(row["answered"] for row in refusal_cases)},
        },
    }


def evaluate(dataset: Dataset, settings: AISettings, limit: int, *, allow_paid_calls: bool) -> dict:
    require_call_authorization(allow_paid_calls)
    validate_reviewed_dataset(dataset)
    if settings.provider not in {"deepseek", "qwen", "ollama"}:
        raise ValueError("ABLATION_LLM_REQUIRED: configure a real chat provider; Mock cannot be ablated")
    if not settings.model or not settings.base_url:
        raise ValueError("ABLATION_LLM_CONFIG_REQUIRED: configure LLM_MODEL and LLM_BASE_URL")
    if settings.provider != "ollama" and not settings.api_key:
        raise ValueError("ABLATION_LLM_KEY_REQUIRED: configure the private LLM_API_KEY locally")

    chat_usage = UsageTransport()
    chat = ChatProvider(settings, chat_usage)
    embedding_usage = UsageTransport()
    embedder = EmbeddingProvider(settings, embedding_usage) if settings.embedding_provider != "none" else None

    records: list[dict] = []
    corpus_manifest: list[dict] = []
    with SessionLocal() as db:
        evidence = approved_records(db, dataset.story_id)
        if not evidence:
            raise ValueError("REVIEWED_PUBLISHED_CORPUS_REQUIRED: pending seed is not an evaluation corpus")
        allowed_ids = {record.knowledge_id for record in evidence}
        for knowledge_id in sorted(allowed_ids):
            knowledge = db.get(CulturalKnowledge, knowledge_id)
            corpus_manifest.append({"id": knowledge.id, "version": knowledge.version,
                                    "reviewer": knowledge.reviewer,
                                    "source": knowledge.source, "source_url": knowledge.source_url})
        vectors_ready = [entry for entry in evidence
                         if entry.embedding_model == settings.embedding_model
                         and len(entry.embedding) == settings.embedding_dimension]
        if embedder is not None and len(vectors_ready) != len(evidence):
            raise ValueError("CORPUS_EMBEDDING_MISMATCH: publish every evaluated chunk with the configured embedding model/dimension")
        npcs: dict[str, Character] = {}
        roles: dict[str, Character] = {}
        for case in dataset.cases:
            npc = db.get(Character, case.npc_id)
            role = db.get(Character, case.role_id)
            spot = db.get(CulturalLocation, case.location_id)
            if npc is None or npc.kind != "npc" or role is None or role.kind != "player" or spot is None:
                raise ValueError(f"DATASET_CHARACTER_OR_LOCATION_INVALID: {case.id}")
            npcs[case.id], roles[case.id] = npc, role
        # Every arm runs the same case list in the same order; usage is aggregated across all arms.
        for arm in ARMS:
            for case in dataset.cases:
                records.append(run_case(case, npcs[case.id], roles[case.id], evidence, arm,
                                        settings, chat, embedder, limit))
        db.rollback()

    return {
        "schema_version": "generation-comparison-v2",
        "executed_at_utc": datetime.now(UTC).isoformat(),
        "experiment_kind": "generation_configuration_comparison",
        "experiment_design": comparison_design(),
        "python_version": platform.python_version(),
        "dataset_version": dataset.dataset_version,
        "dataset_reviewer": dataset.reviewer,
        "dataset_reviewed_at": dataset.reviewed_at,
        "provider": settings.provider, "model": settings.model,
        "embedding_provider": settings.embedding_provider, "embedding_model": settings.embedding_model,
        "embedding_dimension": settings.embedding_dimension,
        "prompt_version": PROMPT_VERSION, "safety_policy_version": POLICY_VERSION,
        "limit": limit, "arms": list(ARMS), "corpus_count": len(evidence),
        "corpus_manifest": corpus_manifest,
        "arm_definitions": dict(ARM_DEFINITIONS),
        "usage": {"chat": chat_usage.summary(), "embedding": embedding_usage.summary()},
        "summaries": {arm: summarise(records, arm) for arm in ARMS},
        "records": records,
        "limitations": [
            "只测管线行为与引用有效性，不构成文化事实准确性或幻觉率的人工评分。",
            "plain 臂没有可检索资料，其“引用无效”是结构性的，不是模型缺陷。",
            f"样本为 {len(corpus_manifest)} 条已审核知识与有限题集，不能推广为总体质量。",
            "多项配置同时变化，不能将组间差异归因于单一动作守卫。所有臂共享输入过滤。",
            "full_pipeline 仅为历史名称；未执行旅程动作守卫、状态变更或 SafetyLog 写入。",
            "模型可能不产生越权动作，因此 proposed_state_actions 为 0 只说明本次未触发，不代表防护无必要。",
            "未填写人工事实性评分；自动引用校验不等于逐句事实一致性。",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATA_DIR / "testsets/golden-evaluation-dataset.json")
    parser.add_argument("--output", type=Path, default=DATA_DIR / "testsets/generation-comparison-results.json")
    parser.add_argument("--limit", type=int, default=4)
    parser.add_argument("--allow-paid-calls", action="store_true",
                        help="explicitly authorize this run's provider calls; default only prints a dry plan")
    parser.add_argument("--list", action="store_true", help="print the plan and exit")
    args = parser.parse_args()
    try:
        settings = AISettings.configured()
        dataset = Dataset.model_validate_json(args.dataset.read_text(encoding="utf-8"))
        validate_reviewed_dataset(dataset)
        plan = dry_plan(dataset, chat=True)
        # Each retrieval arm embeds independently; a one-arm plan understates possible usage.
        for key in ("embedding_request_count_upper_bound", "embedding_input_text_count_upper_bound",
                    "embedding_input_character_count", "embedding_input_utf8_bytes"):
            plan[key] *= len(ARMS) - 1
        plan["arms"] = list(ARMS)
        plan["experiment_design"] = comparison_design()
        plan["cases_per_arm"] = len(dataset.cases)
        plan["chat_request_count_upper_bound"] = len(dataset.cases) * len(ARMS)
        if args.list or not args.allow_paid_calls:
            print(json.dumps({"executed": False, "requires_explicit_authorization": not args.allow_paid_calls,
                              "dry_plan": plan}, ensure_ascii=False, indent=2))
            return 0
        result = evaluate(dataset, settings, args.limit, allow_paid_calls=True)
    except (ValueError, ValidationError, OSError, json.JSONDecodeError) as error:
        message = "DATASET_SCHEMA_INVALID" if isinstance(error, ValidationError) else str(error)
        print(json.dumps({"executed": False, "reason": message}, ensure_ascii=False), file=sys.stderr)
        return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()),
                      "summaries": result["summaries"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
