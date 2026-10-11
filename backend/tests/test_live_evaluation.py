import json
from pathlib import Path

import pytest

from app.ai.settings import AISettings
from scripts.evaluate_live_ai import Dataset, evaluate, read_dataset


def dataset():
    return Dataset(dataset_version="fixture", status="reviewed", reviewer="合成测试审核员", reviewed_at="2026-10-10T00:00:00+00:00", sampling_notes="合成工程夹具，不是文化质量实验", cases=[{"id": "one", "category": "direct_knowledge", "npc_id": "zhou-bo", "location_id": "pingjiang", "chapter": 1, "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["fixture"]}])


def test_programmatic_live_evaluation_requires_explicit_authorization():
    settings = AISettings(provider="deepseek", api_key="fixture-key", base_url="https://example.invalid/v1", model="fixture", embedding_provider="qwen", embedding_key="fixture-key", embedding_url="https://example.invalid/v1", embedding_model="fixture", embedding_dimension=2)
    with pytest.raises(ValueError, match="PAID_CALLS_NOT_AUTHORIZED"):
        evaluate(dataset(), settings)


def test_live_dataset_refuses_missing_human_review(tmp_path):
    path = tmp_path / "dataset.json"
    body = dataset().model_dump() | {"status": "template_requires_human_review", "reviewer": None, "reviewed_at": None}
    path.write_text(json.dumps(body), encoding="utf-8")
    with pytest.raises(ValueError, match="DATASET_REVIEW_REQUIRED"):
        read_dataset(path)


def test_live_template_has_all_expected_categories():
    path = Path(__file__).resolve().parents[2] / "data/testsets/real-model-evaluation-template.json"
    parsed = Dataset.model_validate_json(path.read_text(encoding="utf-8"))
    assert len(parsed.cases) == 12
    assert parsed.status == "template_requires_human_review"


def test_cli_live_default_only_prints_cost_unknown_plan(tmp_path, monkeypatch, capsys):
    import sys

    import scripts.evaluate_live_ai as script

    path = tmp_path / "reviewed.json"
    path.write_text(dataset().model_dump_json(), encoding="utf-8")
    settings = AISettings(provider="deepseek", api_key="fixture-key", base_url="https://example.invalid/v1", model="fixture", embedding_provider="qwen", embedding_key="fixture-key", embedding_url="https://example.invalid/v1", embedding_model="fixture", embedding_dimension=2)
    monkeypatch.setattr(script.AISettings, "configured", lambda: settings)
    monkeypatch.setattr(script, "evaluate", lambda *args, **kwargs: pytest.fail("preflight must not execute any calls"))
    monkeypatch.setattr(sys, "argv", ["evaluate_live_ai.py", "--dataset", str(path)])
    assert script.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["executed"] is False
    assert result["dry_plan"]["estimated_cost"] is None
    assert result["dry_plan"]["estimated_provider_input_tokens"] is None


def test_usage_accounting_preserves_only_reported_tokens(monkeypatch):
    import httpx

    from scripts.evaluation_support import UsageTransport

    transport = UsageTransport()
    transport.delegate = httpx.MockTransport(lambda request: httpx.Response(200, json={"usage": {"prompt_tokens": 23, "completion_tokens": 7, "total_tokens": 30}, "private_api_key": "must-not-be-kept"}))
    transport.handle_request(httpx.Request("POST", "https://example.invalid/v1"))
    result = transport.summary()
    assert result["provider_reported_token_totals"] == {"prompt_tokens": 23, "completion_tokens": 7, "total_tokens": 30}
    assert "must-not-be-kept" not in json.dumps(result)
    assert result["estimated_cost"] is None
    assert result["token_accounting_complete"] is True
