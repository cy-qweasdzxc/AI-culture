"""Tests for the retrieval-arm comparison tool.

Two layers:
  * metric arithmetic is checked against the real ``retrieve()`` function, not a copy of it;
  * the honest-refusal guard is checked by invoking the script exactly as a user would.
"""
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.ai.rag.retrieval import Evidence
from app.models import CulturalKnowledge
from scripts.evaluate_retrieval_arms import ARMS, run_arm


def evidence(**changes):
    defaults = dict(id="fixture:0", knowledge_id="fixture", spot_id="pingjiang", title="古桥",
                    content="合成古桥的测试资料。", content_type="fiction", source="合成测试夹具",
                    source_url="https://example.invalid/fixture", license="仅供测试",
                    review_status="reviewed", chapter=1)
    return Evidence(**(defaults | changes))


def test_run_arm_metrics_match_the_real_retrieval_function():
    """Recall@K / RR / precision are derived from retrieve() output, not recomputed by hand."""
    lexical = evidence(id="lex:0", knowledge_id="lex", title="古桥", content="合成古桥资料")
    semantic = evidence(id="sem:0", knowledge_id="sem", title="水巷", content="合成河道资料",
                        embedding=[1.0, 0.0], embedding_model="fixture-model")
    cases = [
        # the lexical arm surfaces "lex" -> full recall at rank 1
        {"id": "c1", "category": "direct", "location_id": "pingjiang", "chapter": 1,
         "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["lex"],
         "vector": [1.0, 0.0]},
        # shares no lexical overlap, so only a vector arm can surface "sem"
        {"id": "c2", "category": "semantic", "location_id": "pingjiang", "chapter": 1,
         "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["sem"],
         "vector": [1.0, 0.0]},
    ]
    corpus = [lexical, semantic]
    arms = {mode: run_arm(mode, cases, corpus, "fixture-model", 4) for mode in ARMS}

    # Each single arm has its own blind spot: the lexical arm cannot reach the semantically
    # similar chunk, and the vector arm cannot reach the chunk that has no embedding at all.
    assert arms["keyword"]["summary"]["scored_cases"] == 2
    assert arms["keyword"]["records"][0]["retrieved_evidence_ids"] == ["lex"]
    assert arms["keyword"]["records"][0]["recall_at_k"] == pytest.approx(1.0)
    assert arms["keyword"]["records"][0]["reciprocal_rank"] == pytest.approx(1.0)
    assert arms["keyword"]["records"][1]["recall_at_k"] == 0.0
    assert arms["keyword"]["records"][1]["reciprocal_rank"] == 0.0
    assert arms["keyword"]["summary"]["mean_recall_at_k"] == pytest.approx(0.5)

    assert arms["vector"]["records"][0]["retrieved_evidence_ids"] == ["sem"]
    assert arms["vector"]["records"][0]["recall_at_k"] == 0.0
    assert arms["vector"]["records"][1]["recall_at_k"] == pytest.approx(1.0)
    assert arms["vector"]["records"][1]["reciprocal_rank"] == pytest.approx(1.0)
    assert arms["vector"]["summary"]["mean_recall_at_k"] == pytest.approx(0.5)

    # The hybrid arm is the only one that covers both cases; that is the point of the comparison.
    assert arms["hybrid"]["summary"]["mean_recall_at_k"] == pytest.approx(1.0)
    assert arms["hybrid"]["summary"]["full_recall_cases"] == 2
    assert arms["hybrid"]["records"][0]["reciprocal_rank"] == pytest.approx(1.0)
    assert arms["hybrid"]["records"][1]["retrieved_evidence_ids"] == ["lex", "sem"]

    for mode in ARMS:
        summary = arms[mode]["summary"]
        assert summary["cases"] == 2
        assert summary["mean_elapsed_ms"] >= 0
        assert summary["max_elapsed_ms"] >= summary["p95_elapsed_ms"] - 1e-9
    # per-category summaries exist so a weak category cannot hide inside the mean
    assert set(arms["keyword"]["by_category"]) == {"direct", "semantic"}


def test_run_arm_marks_cases_with_no_evidence_instead_of_scoring_them():
    """A refusal-shaped case (no expected evidence) must not enter the recall mean."""
    only = evidence(id="lex:0", knowledge_id="lex", title="古桥", content="合成古桥资料")
    cases = [
        {"id": "answer", "category": "direct", "location_id": "pingjiang", "chapter": 1,
         "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["lex"],
         "vector": [1.0, 0.0]},
        {"id": "outside", "category": "out_of_knowledge", "location_id": "pingjiang", "chapter": 1,
         "question": "毫不相关的提问", "expected_behavior": "refuse", "expected_evidence_ids": [],
         "vector": [0.0, 1.0]},
    ]
    arm = run_arm("keyword", cases, [only], "fixture-model", 4)
    assert arm["summary"]["cases"] == 2 and arm["summary"]["scored_cases"] == 1
    assert arm["summary"]["mean_recall_at_k"] == pytest.approx(1.0)
    assert arm["records"][1]["recall_at_k"] is None
    assert arm["records"][1]["no_evidence_returned"] is True
    assert arm["summary"]["cases_with_no_evidence"] == 1


def test_script_refuses_to_run_without_an_embedding_provider():
    """No provider means no comparison: say so rather than print keyword-only numbers.

    The child environment is pinned to ``EMBEDDING_PROVIDER=none`` so this guard is verified
    deterministically even when the developer running the suite has a real provider in ``.env``.
    """
    script = Path(__file__).resolve().parents[1] / "scripts" / "evaluate_retrieval_arms.py"
    isolated = os.environ.copy()
    isolated["EMBEDDING_PROVIDER"] = "none"
    for key in ("EMBEDDING_API_KEY", "EMBEDDING_BASE_URL", "EMBEDDING_MODEL"):
        isolated.pop(key, None)
    completed = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=120,
                               encoding="utf-8", errors="replace", env=isolated)
    assert completed.returncode == 2, completed.stdout + completed.stderr
    payload = json.loads(completed.stderr.strip().splitlines()[-1])
    assert payload["executed"] is False
    assert "EMBEDDING_REQUIRED" in payload["reason"]


class _EmbeddingHandler(BaseHTTPRequestHandler):
    """Deterministic stand-in for an OpenAI-compatible /embeddings endpoint."""

    def do_POST(self):  # noqa: N802 - stdlib naming
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length) or b"{}")
        inputs = request.get("input") or []
        data = [{"index": index, "embedding": [1.0, 0.0]} for index, _ in enumerate(inputs)]
        body = json.dumps({"data": data}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # keep test output clean
        return


@pytest.fixture
def embedding_server():
    server = HTTPServer(("127.0.0.1", 0), _EmbeddingHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/v1"
    server.shutdown()
    server.server_close()


@pytest.fixture
def configured_embedding(monkeypatch, embedding_server):
    """Point the app settings at the stub provider and clear the settings cache afterwards."""
    from app.core.config import get_settings

    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai-compatible")
    monkeypatch.setenv("EMBEDDING_BASE_URL", embedding_server)
    monkeypatch.setenv("EMBEDDING_MODEL", "fixture-embedding")
    monkeypatch.setenv("EMBEDDING_API_KEY", "fixture-key")
    monkeypatch.setenv("EMBEDDING_DIMENSION", "2")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def script_db(monkeypatch, database):
    """The script opens its own SessionLocal; bind it to the isolated test database."""
    binding = sessionmaker(bind=database, expire_on_commit=False)
    monkeypatch.setattr("scripts.evaluate_retrieval_arms.SessionLocal", binding)
    yield binding


def publish_reviewed(db, *, knowledge_id: str, title: str, content: str, location_id: str, settings) -> None:
    from app.ai.rag.index import rebuild_knowledge

    knowledge = CulturalKnowledge(
        id=knowledge_id, story_id="suzhou-pingjiang", location_id=location_id, title=title,
        content=content, content_type="fact", source="合成测试来源（非真实授权）",
        source_url="https://example.invalid/audited-source", license="合成测试授权，非真实凭证",
        review_status="reviewed", trust_level="human_reviewed", reviewer="合成测试审核员", is_demo=False,
        metadata_json={"min_chapter": 1},
    )
    db.add(knowledge)
    db.commit()
    assert rebuild_knowledge(db, knowledge, settings) > 0
    db.commit()


def test_evaluate_runs_all_arms_and_reports_its_own_configuration(db, script_db, configured_embedding):
    """End-to-end over the real publish path: three arms, full configuration, read-only outcome."""
    from app.ai.settings import AISettings
    from scripts.evaluate_retrieval_arms import Dataset, evaluate

    settings = AISettings.configured()
    publish_reviewed(db, knowledge_id="fixture-arm-corpus", title="合成石桥",
                     content="合成石桥是工程测试夹具，用于验证检索对照，不代表任何真实史实。",
                     location_id="pingjiang", settings=settings)

    dataset = Dataset(dataset_version="fixture-retrieval-v1", status="reviewed", reviewer="合成测试审核员",
                      reviewed_at="2026-10-10T00:00:00+00:00",
                      cases=[{"id": "c1", "category": "direct_knowledge", "location_id": "pingjiang",
                              "chapter": 1, "question": "合成石桥", "expected_behavior": "answer",
                              "expected_evidence_ids": ["fixture-arm-corpus"]}])
    result = evaluate(dataset, settings, 4, allow_paid_calls=True)

    assert result["arms"] == list(ARMS)
    assert result["corpus_count"] >= 1 and result["corpus_manifest"]
    assert result["embedding_model"] == "fixture-embedding" and result["embedding_dimension"] == 2
    # cost/effort accounting: every question is embedded exactly once and shared by all arms
    assert result["embedding_calls"] == 1 and result["embedded_text_count"] == 1
    assert result["embedding_elapsed_ms"] >= 0
    for mode in ARMS:
        assert result["summaries"][mode]["cases"] == 1
        assert result["summaries"][mode]["mean_elapsed_ms"] >= 0
    # the stub returns one identical vector for every text, so the vector arm must find the chunk
    assert result["summaries"]["vector"]["mean_recall_at_k"] == pytest.approx(1.0)
    assert result["retrieval_config"]["lexical_min_score"] == 0.12
    assert result["summaries_are_retrieval_only"] is True
    assert any("只测检索" in note for note in result["limitations"])
    assert result["corpus_manifest"][0]["reviewer"] == "合成测试审核员"


def test_evaluate_refuses_an_unreviewed_corpus(db, script_db, configured_embedding):
    """Pending seed data is not an evaluation corpus."""
    from app.ai.settings import AISettings
    from scripts.evaluate_retrieval_arms import Dataset, evaluate

    assert db.scalar(select(CulturalKnowledge).where(CulturalKnowledge.review_status == "reviewed")) is None
    dataset = Dataset(dataset_version="fixture-retrieval-v1", status="reviewed", reviewer="合成测试审核员", reviewed_at="2026-10-10",
                      cases=[{"id": "c1", "category": "direct_knowledge", "location_id": "pingjiang",
                              "chapter": 1, "question": "平江路", "expected_behavior": "answer",
                              "expected_evidence_ids": ["kn-shuangqipan"]}])
    with pytest.raises(ValueError, match="REVIEWED_PUBLISHED_CORPUS_REQUIRED"):
        evaluate(dataset, AISettings.configured(), 4, allow_paid_calls=True)


def test_evaluate_refuses_evidence_that_is_not_published(db, script_db, configured_embedding):
    """A dataset may only reference knowledge that is actually reviewed and published."""
    from app.ai.settings import AISettings
    from scripts.evaluate_retrieval_arms import Dataset, evaluate

    settings = AISettings.configured()
    publish_reviewed(db, knowledge_id="fixture-published", title="合成茶棚",
                     content="合成茶棚是工程测试夹具，用于验证未发布证据必须被拒绝。",
                     location_id="pingjiang", settings=settings)
    dataset = Dataset(dataset_version="fixture-retrieval-v1", status="reviewed", reviewer="合成测试审核员", reviewed_at="2026-10-10",
                      cases=[{"id": "c1", "category": "direct_knowledge", "location_id": "pingjiang",
                              "chapter": 1, "question": "合成茶棚",
                              "expected_evidence_ids": ["fixture-published", "kn-yuxiang"]}])
    with pytest.raises(ValueError, match="DATASET_EVIDENCE_UNPUBLISHED"):
        evaluate(dataset, settings, 4, allow_paid_calls=True)


def test_dataset_review_is_required_before_reading_cases(tmp_path):
    from scripts.evaluate_retrieval_arms import read_dataset

    path = tmp_path / "unreviewed.json"
    path.write_text(json.dumps({"dataset_version": "fixture", "status": "template_requires_human_review", "cases": [{"id": "one", "category": "direct_knowledge", "location_id": "pingjiang", "chapter": 1, "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["fixture"]}]}), encoding="utf-8")
    with pytest.raises(ValueError, match="DATASET_REVIEW_REQUIRED"):
        read_dataset(path)


def test_full_live_template_schema_is_accepted_without_execution():
    from scripts.evaluate_retrieval_arms import Dataset

    template = Path(__file__).resolve().parents[2] / "data/testsets/real-model-evaluation-template.json"
    dataset = Dataset.model_validate_json(template.read_text(encoding="utf-8"))
    assert len(dataset.cases) == 12
    assert dataset.cases[0].expected_answer_concepts == []
    assert dataset.cases[8].expected_refusal_reasons == ["PROMPT_INJECTION"]


def test_empty_answer_retrieval_scores_zero_precision_and_is_in_mean():
    only = evidence(id="lex:0", knowledge_id="lex", title="古桥", content="合成古桥资料")
    cases = [{"id": "hit", "category": "direct", "location_id": "pingjiang", "chapter": 1, "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["lex"], "vector": [1.0, 0.0]}, {"id": "miss", "category": "direct", "location_id": "pingjiang", "chapter": 1, "question": "银河火箭", "expected_behavior": "answer", "expected_evidence_ids": ["lex"], "vector": [0.0, 1.0]}]
    arm = run_arm("keyword", cases, [only], "fixture-model", 1)
    assert arm["records"][1]["precision_at_k"] == 0.0
    assert arm["summary"]["mean_precision_at_k"] == 0.5


def test_top_k_ranks_distinct_knowledge_not_duplicate_chunks():
    corpus = [evidence(id="same:0", knowledge_id="same", content="古桥第一个不同切片", embedding=[1.0, 0.0], embedding_model="fixture-model"), evidence(id="same:1", knowledge_id="same", content="古桥第二个不同切片", embedding=[1.0, 0.0], embedding_model="fixture-model"), evidence(id="second:0", knowledge_id="second", content="古桥另一个条目", embedding=[0.9, 0.1], embedding_model="fixture-model")]
    case = {"id": "one", "category": "direct", "location_id": "pingjiang", "chapter": 1, "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["same", "second"], "vector": [1.0, 0.0]}
    for mode in ARMS:
        result = run_arm(mode, [case], corpus, "fixture-model", 2)
        assert result["records"][0]["retrieved_evidence_ids"] == ["same", "second"]
        assert result["records"][0]["recall_at_k"] == 1.0


def test_programmatic_evaluation_requires_explicit_call_authorization():
    from app.ai.settings import AISettings
    from scripts.evaluate_retrieval_arms import Dataset, evaluate

    dataset = Dataset(dataset_version="fixture", status="reviewed", reviewer="合成审核员", reviewed_at="2026-10-10", cases=[{"id": "one", "category": "direct_knowledge", "location_id": "pingjiang", "chapter": 1, "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["fixture"]}])
    settings = AISettings(embedding_provider="qwen", embedding_key="fixture-key", embedding_url="https://example.invalid/v1", embedding_model="fixture", embedding_dimension=2)
    with pytest.raises(ValueError, match="PAID_CALLS_NOT_AUTHORIZED"):
        evaluate(dataset, settings, 4)


def test_cli_default_prints_plan_without_provider_calls(tmp_path, monkeypatch, capsys):
    import scripts.evaluate_retrieval_arms as script
    from app.ai.settings import AISettings

    path = tmp_path / "reviewed.json"
    path.write_text(json.dumps({"dataset_version": "fixture", "status": "reviewed", "reviewer": "合成测试审核员", "reviewed_at": "2026-10-10", "cases": [{"id": "one", "category": "direct_knowledge", "location_id": "pingjiang", "chapter": 1, "question": "古桥", "expected_behavior": "answer", "expected_evidence_ids": ["fixture"]}]}), encoding="utf-8")
    settings = AISettings(embedding_provider="qwen", embedding_key="fixture-key", embedding_url="https://example.invalid/v1", embedding_model="fixture", embedding_dimension=2)
    monkeypatch.setattr(script.AISettings, "configured", lambda: settings)
    monkeypatch.setattr(script, "evaluate", lambda *args, **kwargs: pytest.fail("preflight must never call a provider"))
    monkeypatch.setattr(sys, "argv", ["evaluate_retrieval_arms.py", "--dataset", str(path)])
    assert script.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["executed"] is False
    assert result["dry_plan"]["estimated_cost"] is None
    assert result["dry_plan"]["embedding_request_count_upper_bound"] == 1
