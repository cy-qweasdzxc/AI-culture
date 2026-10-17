import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.ai.llm.providers import ChatProvider, Generation
from app.ai.rag.index import rebuild_knowledge
from app.ai.settings import AISettings
from app.models import CulturalKnowledge, DialogueLog


@pytest.fixture
def prepared_chat(client, started, db):
    knowledge = CulturalKnowledge(
        id="fixture-slow-bridge", story_id="suzhou-pingjiang", location_id="pingjiang",
        title="星桥", content="星桥是合成测试中的虚构桥梁。", content_type="fiction",
        source="自有合成夹具", source_url="https://example.invalid/bridge", license="合成测试",
        review_status="reviewed", reviewer="合成审核", is_demo=False,
    )
    db.add(knowledge)
    db.flush()
    rebuild_knowledge(db, knowledge, AISettings())
    db.commit()
    at_spot = client.post("/api/location/trigger", json={
        "journey_id": started["journeyId"], "state_version": started["stateVersion"], "spot_id": "pingjiang",
    }).json()["snapshot"]
    return {"journey_id": at_spot["journeyId"], "state_version": at_spot["stateVersion"],
            "request_id": str(uuid4()), "npc_id": "zhou-bo", "message": "星桥有什么故事？"}, knowledge


@pytest.mark.parametrize("concurrent_action", ["other_user", "same_journey", "withdraw_source"])
def test_provider_wait_holds_no_write_lock_and_revalidates_before_commit(
    client, db, prepared_chat, monkeypatch, concurrent_action,
):
    body, knowledge = prepared_chat
    entered, release = Event(), Event()

    def slow_generate(_self, _messages, mock_reply):
        entered.set()
        assert release.wait(10), "test must release the synthetic provider"
        return Generation(json.dumps(mock_reply), "mock", "fixture", True)

    monkeypatch.setattr(ChatProvider, "generate", slow_generate)

    def mutate_while_waiting():
        if concurrent_action == "other_user":
            from app.main import app
            with TestClient(app) as another:
                assert another.post("/api/session").status_code == 200
                assert another.post("/api/journeys/start", json={"role_id": "scholar", "mode": "virtual"}).status_code == 200
        elif concurrent_action == "same_journey":
            response = client.post("/api/journeys/mode", json={
                "journey_id": body["journey_id"], "state_version": body["state_version"], "mode": "onsite",
            })
            assert response.status_code == 200, response.text
        else:
            knowledge.review_status = "rejected"
            db.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(client.post, "/api/chat/message", json=body)
        assert entered.wait(3)
        try:
            pool.submit(mutate_while_waiting).result(timeout=3)
        finally:
            release.set()
        response = pending.result(timeout=3)
    if concurrent_action == "other_user":
        assert response.status_code == 200, response.text
    else:
        assert response.status_code == 409, response.text
        expected = "STATE_CONFLICT" if concurrent_action == "same_journey" else "EVIDENCE_CHANGED"
        assert response.json()["error"]["code"] == expected
        assert db.scalar(select(func.count()).select_from(DialogueLog)) == 0


def test_chat_replay_and_stale_version_do_not_regenerate(client, prepared_chat, monkeypatch):
    body, _ = prepared_chat
    calls = []

    def generate(_self, _messages, mock_reply):
        calls.append(1)
        return Generation(json.dumps(mock_reply), "mock", "fixture", True)

    monkeypatch.setattr(ChatProvider, "generate", generate)
    first = client.post("/api/chat/message", json=body)
    assert first.status_code == 200
    replay = client.post("/api/chat/message", json=body)
    assert replay.status_code == 200 and replay.json()["replayed"]
    stale = client.post("/api/chat/message", json=body | {"request_id": str(uuid4())})
    assert stale.status_code == 409
    assert len(calls) == 1
