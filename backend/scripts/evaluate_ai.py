"""Reproducible synthetic mechanism checks; never measures real cultural/model quality."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.ai.agents.npc import respond  # noqa: E402
from app.ai.llm.providers import ChatProvider, Generation  # noqa: E402
from app.ai.rag.retrieval import Evidence, retrieve  # noqa: E402
from app.ai.settings import AISettings  # noqa: E402

ROOT = BACKEND.parent


class ScriptedProvider(ChatProvider):
    """A labelled Mock output fault, with no network or external model."""

    def __init__(self, mode: str):
        super().__init__(AISettings(provider="mock"))
        self.mode = mode

    def generate(self, messages: list[dict[str, str]], mock_reply: dict) -> Generation:
        if self.mode == "invalid_json":
            content = "{not valid JSON"
        else:
            content = json.dumps({**mock_reply, "evidence_ids": ["nonexistent-evidence"]})
        return Generation(content, "mock", "scripted-fault-v1", True)


def evaluate(dataset: dict) -> dict:
    records = [Evidence(**record) for record in dataset["records"]]
    results = []
    for case in dataset["cases"]:
        hits = retrieve(case["query"], records, {"pingjiang"}, 1)
        provider = (ScriptedProvider(case["output_override"]) if case.get("output_override")
                    else ChatProvider(AISettings(provider="mock")))
        reply = respond(case["query"], hits, {"name": "测试角色"}, {"name": "测试玩家"},
                        {"chapter": 1, "spot": "pingjiang"}, [], provider)
        checks = {"reason": reply.reason == case["expected_reason"]}
        if "expected_evidence" in case:
            checks["evidence"] = set(reply.evidence_ids) == set(case["expected_evidence"])
        if "required_label" in case:
            checks["content_label"] = case["required_label"] in reply.dialogue
        checks["no_actions"] = not reply.proposed_actions
        checks["mock_or_local_refusal"] = reply.mock or reply.provider == "none"
        results.append({"id": case["id"], "category": case["category"],
                        "passed": all(checks.values()), "checks": checks,
                        "actual_reason": reply.reason, "evidence_ids": reply.evidence_ids,
                        "provider": reply.provider, "model": reply.model, "mock": reply.mock})
    passed = sum(result["passed"] for result in results)
    return {
        "dataset_version": dataset["version"], "synthetic": True,
        "evaluation_kind": "mock_and_local_mechanisms", "network_calls": 0,
        "real_llm_quality": "unverified", "real_culture_quality": "unverified",
        "generated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "timezone": "Asia/Shanghai", "total": len(results), "passed": passed,
        "failed": len(results) - passed, "results": results,
        "limitations": ["合成审核状态，不代表真实文化审核", "未调用真实LLM或Embedding",
                        "通过数是工程断言结果，不能作为文化准确率、召回率或幻觉率"],
    }


def persist_cases(dataset: dict, result: dict, database_url: str) -> int:
    """Upsert only explicit synthetic TestCase rows in a caller-selected migrated DB."""
    from sqlalchemy.orm import Session

    from app.core.database import make_engine
    from app.models import TestCase

    engine = make_engine(database_url)
    completed = {case["id"]: case for case in result["results"]}
    executed_at = datetime.fromisoformat(result["generated_at"]).astimezone(UTC)
    try:
        with Session(engine) as db:
            for case in dataset["cases"]:
                case_id = "synthetic:" + case["id"]
                record = db.get(TestCase, case_id)
                if record is None:
                    record = TestCase(id=case_id)
                    db.add(record)
                record.category = case["category"]
                record.input = {"query": case["query"], "synthetic": True,
                                "dataset_version": dataset["version"], "provider": "mock"}
                record.expected = {key: value for key, value in case.items()
                                   if key.startswith("expected_") or key == "required_label"}
                record.result = completed[case["id"]] | {"synthetic": True, "network_calls": 0,
                                                        "real_culture_quality": "unverified"}
                record.executed_at = executed_at
            db.commit()
        return len(dataset["cases"])
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=ROOT / "data/testsets/ai-cases.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data/testsets/results.json")
    parser.add_argument("--persist-db", action="store_true",
                        help="Upsert synthetic results into an already migrated database; default never opens DB")
    parser.add_argument("--database-url", help="Explicit persistence target, e.g. isolated SQLite test database")
    args = parser.parse_args()
    result = evaluate(json.loads(args.dataset.read_text(encoding="utf-8")))
    result["persistence"] = {"enabled": False}
    if args.persist_db:
        if args.database_url:
            database_url = args.database_url
        else:
            from app.core.config import get_settings

            database_url = get_settings().database_url
        count = persist_cases(json.loads(args.dataset.read_text(encoding="utf-8")), result, database_url)
        result["persistence"] = {"enabled": True, "table": "test_cases", "rows_upserted": count,
                                 "records_synthetic": True}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("evaluation_kind", "total", "passed", "failed", "network_calls")}))
    return int(result["failed"] != 0)


if __name__ == "__main__":
    raise SystemExit(main())
