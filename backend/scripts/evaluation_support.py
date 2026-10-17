"""Shared human-review, explicit-call and honest accounting rules for evaluation tools."""
import json
from datetime import datetime
from typing import Any

import httpx

from app.ai.safety.policy import input_risk


def validate_reviewed_dataset(dataset: Any) -> None:
    if dataset.status != "reviewed" or not dataset.reviewer or not dataset.reviewer.strip() or "待补充" in dataset.reviewer or not dataset.reviewed_at:
        raise ValueError("DATASET_REVIEW_REQUIRED: an independent reviewer and date are required")
    datetime.fromisoformat(dataset.reviewed_at.replace("Z", "+00:00"))
    if len({case.id for case in dataset.cases}) != len(dataset.cases):
        raise ValueError("DATASET_CASE_IDS_DUPLICATED")
    for case in dataset.cases:
        if not case.question.strip() or "待补充" in case.question:
            raise ValueError(f"DATASET_CASE_INCOMPLETE: {case.id}")
        if input_risk(case.question) == "PRIVACY_SENSITIVE":
            raise ValueError(f"DATASET_PRIVACY_INPUT_REJECTED: {case.id}")
        if case.expected_behavior == "answer" and not case.expected_evidence_ids:
            raise ValueError(f"DATASET_EVIDENCE_REQUIRED: {case.id}")
    if not any(case.expected_evidence_ids and case.expected_behavior != "refuse" for case in dataset.cases):
        raise ValueError("DATASET_ANSWER_CASE_REQUIRED: refusal-only cases cannot verify retrieval quality")


def require_call_authorization(allow_paid_calls: bool) -> None:
    if not allow_paid_calls:
        raise ValueError("PAID_CALLS_NOT_AUTHORIZED: this tool defaults to preflight; explicitly authorize a run with --allow-paid-calls")


def dry_plan(dataset: Any, *, chat: bool) -> dict:
    eligible = [case.question for case in dataset.cases if not input_risk(case.question)]
    return {
        "case_count": len(dataset.cases),
        "risk_cases_processed_locally": len(dataset.cases) - len(eligible),
        "embedding_request_count_upper_bound": len(eligible) if chat else int(bool(eligible)),
        "embedding_input_text_count_upper_bound": len(eligible),
        "embedding_input_character_count": sum(len(question) for question in eligible),
        "embedding_input_utf8_bytes": sum(len(question.encode("utf-8")) for question in eligible),
        "chat_request_count_upper_bound": len(eligible) if chat else 0,
        "chat_completion_token_limit_per_call": 700 if chat else 0,
        "estimated_provider_input_tokens": None,
        "estimated_cost": None,
        "pricing_verified": False,
        "unknowns": ["未配置提供方 tokenizer，不能把字符数冒充 token 数。", "未核实当前模型单价、缓存与计费规则，成本未知。", "实际生成是否调用取决于证据充分性；输入还包括 NPC、角色与证据上下文。"] if chat else ["未配置提供方 tokenizer，字符数不是 token 数。", "未核实 Embedding 单价及计费规则，成本未知。"],
    }


def knowledge_hits(query, evidence, allowed_spots, chapter, vector, model, limit, mode="hybrid"):
    from app.ai.rag.retrieval import retrieve_knowledge

    return retrieve_knowledge(query, evidence, allowed_spots, chapter, vector, model, limit, mode)


class UsageTransport(httpx.BaseTransport):
    """Keep only numeric provider-reported usage, never credentials or provider response bodies."""

    def __init__(self):
        self.delegate = httpx.HTTPTransport()
        self.response_count = 0
        self.usage_response_count = 0
        self.totals: dict[str, int] = {}

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        response = self.delegate.handle_request(request)
        response.read()
        self.response_count += 1
        try:
            payload = json.loads(response.content)
            if not isinstance(payload, dict):
                return response
            usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else payload
            allowed = {"prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "prompt_eval_count", "eval_count"}
            values = {key: value for key, value in usage.items() if key in allowed and type(value) is int and value >= 0}
            if values:
                self.usage_response_count += 1
                for key, value in values.items():
                    self.totals[key] = self.totals.get(key, 0) + value
        except (ValueError, TypeError):
            pass
        return response

    def summary(self) -> dict:
        return {"responses": self.response_count, "responses_with_usage": self.usage_response_count, "provider_reported_token_totals": self.totals or None, "token_accounting_complete": self.response_count > 0 and self.response_count == self.usage_response_count, "estimated_cost": None, "pricing_verified": False}

    def close(self) -> None:
        self.delegate.close()
