from dataclasses import replace

import pytest

from app.ai.rag.retrieval import Evidence, retrieve_knowledge
from scripts.evaluation_support import knowledge_hits


def long_corpus():
    first = Evidence("a:0", "a", "pingjiang", "星桥", "星桥资料第零段。", "fiction",
                     "自有测试", "https://example.invalid", "合成测试许可", "reviewed", 1,
                     [1.0, 0.0], "fixture")
    return [replace(first, id=f"a:{i}", content=f"星桥资料第{i}段。") for i in range(6)] + [
        replace(first, id="b:0", knowledge_id="b", content="星桥的另一份独立资料。"),
        replace(first, id="future:0", knowledge_id="future", chapter=2),
    ]


@pytest.mark.parametrize("mode", ["keyword", "vector", "hybrid"])
def test_production_and_evaluation_rank_distinct_knowledge_identically(mode):
    records = long_corpus()
    live = retrieve_knowledge("星桥", records, {"pingjiang"}, 1, [1.0, 0.0], "fixture", 4, mode)
    evaluated = knowledge_hits("星桥", records, {"pingjiang"}, 1, [1.0, 0.0], "fixture", 4, mode)
    assert live == evaluated
    assert [hit.evidence.knowledge_id for hit in live] == ["a", "b"]
    assert live[0].evidence.id == "a:0"


def test_chat_uses_the_same_top_k_with_a_long_source(client, started, monkeypatch):
    records = long_corpus()
    monkeypatch.setattr("app.api.routes.ai.approved_records", lambda *args: records)
    arrived = client.post("/api/location/trigger", json={
        "journey_id": started["journeyId"], "state_version": started["stateVersion"], "spot_id": "pingjiang",
    }).json()["snapshot"]
    response = client.post("/api/chat/message", json={
        "journey_id": arrived["journeyId"], "state_version": arrived["stateVersion"],
        "npc_id": "zhou-bo", "message": "星桥",
    })
    assert response.status_code == 200, response.text
    assert response.json()["evidence_ids"] == ["a", "b"]
