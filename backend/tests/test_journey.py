import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models import CulturalKnowledge, KnowledgeChunk, StoryEdge, User, UserInventory, UserStoryState
from app.services.journey import add_event, mutate_journey, start_journey
from app.services.seed import seed_database


def action(state, **extra):
    return {"journey_id": state["journeyId"], "state_version": state["stateVersion"], "request_id": str(uuid4()), **extra}


def trigger(client, state, spot):
    response = client.post("/api/location/trigger", json=action(state, spot_id=spot))
    assert response.status_code == 200, response.text
    return response.json()["snapshot"]


def grant_dialogue_clue(client, state, npc, text):
    response = client.post("/api/chat/message", json=action(state, npc_id=npc, text=text))
    assert response.status_code == 200, response.text
    return response.json()["snapshot"]


def complete_route(client, state, skip_final_task=False):
    raw = json.loads((Path(__file__).resolve().parents[2] / "data/demo/seed.json").read_text(encoding="utf-8"))
    for spot in raw["spots"]:
        state = trigger(client, state, spot["id"])
        if spot["id"] == "pingjiang":
            state = grant_dialogue_clue(client, state, "zhou-bo", "平江图")
        if spot["id"] == "subo":
            state = grant_dialogue_clue(client, state, "xiao-shen", "片石白墙")
        for task in raw["tasks"]:
            if task["spotId"] != spot["id"] or (skip_final_task and spot["id"] == "subo"):
                continue
            answer = task.get("answerKey", task.get("password", task.get("sortingAnswer")))
            response = client.post(f"/api/tasks/{task['id']}/verify", json=action(state, answer=answer))
            assert response.status_code == 200, response.text
            assert response.json()["ok"], response.text
            state = response.json()["snapshot"]
    return state


def test_health_openapi_and_anonymous_cookie(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert "/api/tasks/{task_id}/verify" in client.get("/api/openapi.json").json()["paths"]
    first = client.post("/api/session")
    assert "HttpOnly" in first.headers["set-cookie"]
    assert "SameSite=lax" in first.headers["set-cookie"]
    assert client.post("/api/session").json()["sessionId"] == first.json()["sessionId"]


def test_migrations_and_idempotent_seed(db, database):
    tables = inspect(database).get_table_names()
    assert len(tables) == 19  # 17 planned entities, action receipts and Alembic revision.
    seed_database(db)
    seed_database(db)
    assert db.scalar(select(func.count()).select_from(CulturalKnowledge)) == 24
    assert not db.scalar(select(func.count()).select_from(CulturalKnowledge).where(CulturalKnowledge.review_status != "pending"))
    assert not db.scalar(select(func.count()).select_from(KnowledgeChunk))
    assert db.scalar(select(func.count()).select_from(StoryEdge)) > 20


def test_missing_session_and_invalid_role(client):
    assert client.get("/api/journeys/current").json()["error"]["code"] == "SESSION_INVALID"
    client.post("/api/session")
    response = client.post("/api/journeys/start", json={"role_id": "zhou-bo"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "ROLE_INVALID"


def test_session_restores_authoritative_state(client, started):
    state = trigger(client, started, "pingjiang")
    restored = client.post("/api/session").json()["snapshot"]
    assert restored["stateVersion"] == state["stateVersion"]
    assert restored["currentSpotId"] == "pingjiang"


def test_other_session_cannot_access_journey(client, started):
    client.cookies.clear()
    client.post("/api/session")
    denied = client.post("/api/location/trigger", json=action(started, spot_id="pingjiang"))
    assert denied.status_code == 404
    assert denied.json()["error"]["code"] == "JOURNEY_NOT_FOUND"


def test_future_nodes_hidden_and_task_answers_redacted(client, started):
    route = client.get(f"/api/routes/suzhou-pingjiang?journey_id={started['journeyId']}").json()
    assert [spot["id"] for spot in route["spots"]] == ["pingjiang"]
    assert client.get("/api/tasks").json()["items"] == []
    trigger(client, started, "pingjiang")
    body = client.get("/api/tasks").json()
    assert len(body["items"]) == 2
    for task in body["items"]:
        assert not {"answerKey", "password", "sortingAnswer", "explanation"}.intersection(task)
    assert client.get("/api/codex").json()["items"] == []


def test_out_of_order_location_and_task_rejected(client, started):
    denied = client.post("/api/location/trigger", json=action(started, spot_id="subo"))
    assert denied.json()["error"]["code"] == "LOCATION_LOCKED"
    denied = client.post("/api/tasks/task-jiaou/verify", json=action(started, answer="B"))
    assert denied.json()["error"]["code"] == "TASK_UNAVAILABLE"
    assert client.get("/api/journeys/current").json()["snapshot"]["stateVersion"] == started["stateVersion"]


def test_wrong_answer_and_missing_clues(client, started):
    state = trigger(client, started, "pingjiang")
    wrong = client.post("/api/tasks/task-shuangqipan/verify", json=action(state, answer="A")).json()
    assert not wrong["ok"]
    state = wrong["snapshot"]
    assert state["taskStates"]["task-shuangqipan"] == {"status": "available", "attempts": 1, "score": 0}
    missing = client.post("/api/tasks/task-pingjiangtu/verify", json=action(state, answer="1229")).json()
    assert missing["missingClues"] == ["clue-shaoding"]
    assert missing["snapshot"]["taskStates"]["task-pingjiangtu"]["attempts"] == 0
    assert missing["snapshot"]["unlockedCodex"] == []


def test_idempotent_retries_cannot_duplicate_rewards(client, started, db):
    state = trigger(client, started, "pingjiang")
    body = action(state, answer="B")
    first = client.post("/api/tasks/task-shuangqipan/verify", json=body)
    second = client.post("/api/tasks/task-shuangqipan/verify", json=body)
    assert first.status_code == second.status_code == 200
    assert second.json()["replayed"]
    assert first.json()["snapshot"]["stateVersion"] == second.json()["snapshot"]["stateVersion"]
    assert first.json()["snapshot"]["unlockedCodex"] == ["codex-shuangqipan"]
    assert first.json()["snapshot"]["taskStates"]["task-shuangqipan"]["score"] == 20
    changed = client.post("/api/tasks/task-shuangqipan/verify", json={**body, "answer": "A"})
    assert changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    state = first.json()["snapshot"]
    repeated = client.post("/api/tasks/task-shuangqipan/verify", json=action(state, answer="B"))
    assert repeated.json()["error"]["code"] == "TASK_COMPLETED"
    assert db.scalar(select(func.count()).select_from(UserInventory)) == 1


def test_version_conflict(client, started):
    trigger(client, started, "pingjiang")
    stale = client.post("/api/journeys/mode", json=action(started, mode="onsite"))
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "STATE_CONFLICT"


def test_old_idempotent_retry_returns_latest_snapshot(client, started):
    body = action(started, spot_id="pingjiang")
    first = client.post("/api/location/trigger", json=body).json()["snapshot"]
    second = client.post("/api/journeys/mode", json=action(first, mode="onsite")).json()["snapshot"]
    replayed = client.post("/api/location/trigger", json=body)
    assert replayed.status_code == 200
    assert replayed.json()["snapshot"]["stateVersion"] == second["stateVersion"]
    assert replayed.json()["snapshot"]["mode"] == "onsite"


def test_approved_codex_uses_current_reviewed_version(client, started, db):
    state = trigger(client, started, "pingjiang")
    client.post("/api/tasks/task-shuangqipan/verify", json=action(state, answer="B"))
    knowledge = db.get(CulturalKnowledge, "kn-shuangqipan")
    knowledge.content = "经过测试审核的最新文本，仅用于验证，不是文化事实。"
    knowledge.source = "测试来源"
    knowledge.review_status = "reviewed"
    db.commit()
    entry = client.get("/api/codex").json()["items"][0]
    assert entry["content"] == knowledge.content
    assert entry["source"] == "测试来源"
    assert entry["reviewStatus"] == "reviewed"


def test_parallel_starts_are_unique_and_return_stable_conflict(database, client, monkeypatch):
    import threading

    import app.services.journey as service

    session_id = client.post("/api/session").json()["sessionId"]
    barrier = threading.Barrier(2)
    original = service.current_journey

    def synchronized_query(db, user):
        result = original(db, user)
        if result is None:
            barrier.wait(timeout=5)
        return result

    monkeypatch.setattr(service, "current_journey", synchronized_query)

    def run(_index):
        with Session(database, expire_on_commit=False) as db:
            user = db.get(User, session_id)
            try:
                return start_journey(db, user, "suzhou-pingjiang", "scholar", "virtual").id
            except DomainError as error:
                return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [1, 2]))
    assert results.count("JOURNEY_EXISTS") == 1
    with Session(database) as db:
        assert db.scalar(select(func.count()).select_from(UserStoryState)) == 1


def test_parallel_mutations_one_wins(database, started):
    import threading
    barrier = threading.Barrier(2)

    def run(index):
        with Session(database, expire_on_commit=False) as db:
            journey = db.get(UserStoryState, started["journeyId"])
            barrier.wait(timeout=5)
            try:
                result = mutate_journey(db, journey, started["stateVersion"], str(uuid4()), f"parallel:{index}", {}, lambda cur: (add_event(cur, "mode", str(index)) or {}))
                return result["snapshot"]["stateVersion"]
            except DomainError as error:
                return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [1, 2]))
    assert sorted(map(str, results)) == [str(started["stateVersion"] + 1), "STATE_CONFLICT"]


def test_browser_position_checks_accuracy_distance_and_mode(client):
    client.post("/api/session")
    state = client.post("/api/journeys/start", json={"role_id": "apprentice", "mode": "onsite"}).json()["snapshot"]
    missing = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang"))
    assert missing.json()["error"]["code"] == "LOCATION_REQUIRED"
    poor = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang", lat=31.3169, lng=120.6343, accuracy_m=500, coordinate_system="gcj02"))
    assert poor.json()["error"]["code"] == "LOCATION_INACCURATE"
    far = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang", lat=32, lng=121, accuracy_m=10, coordinate_system="gcj02"))
    assert far.json()["error"]["code"] == "LOCATION_TOO_FAR"
    valid = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang", lat=31.3169, lng=120.6343, accuracy_m=10, coordinate_system="gcj02"))
    assert valid.status_code == 200
    assert valid.json()["location"]["proof"] == "browser_coordinates_untrusted"


def test_illegal_npc_and_early_ending(client, started):
    state = trigger(client, started, "pingjiang")
    denied = client.post("/api/chat/message", json=action(state, npc_id="xiao-shen", text="你好"))
    assert denied.json()["error"]["code"] == "NPC_UNAVAILABLE"
    denied = client.post("/api/chat/message", json=action(state, npc_id="scholar", text="你好"))
    assert denied.json()["error"]["code"] == "NPC_INVALID"
    denied = client.post("/api/journeys/finale", json=action(state, choice_key="hang"))
    assert denied.json()["error"]["code"] == "ENDING_NOT_READY"


@pytest.mark.parametrize(("choice", "expected"), [("hang", "cheng-huai"), ("keep", "qu-jing")])
def test_complete_route_and_persistent_endings(client, started, choice, expected):
    state = complete_route(client, started)
    assert state["state"] == "ENDING_READY"
    result = client.post("/api/journeys/finale", json=action(state, choice_key=choice))
    assert result.status_code == 200, result.text
    final = result.json()["snapshot"]
    assert final["state"] == "COMPLETED"
    assert final["endingId"] == expected
    assert client.get("/api/ending").json()["ending"]["id"] == expected
    report = client.get("/api/report").json()
    assert report["knowledgeScore"] == report["maxScore"] == 140
    assert report["completedTaskCount"] == 6
    assert report["completedSpotCount"] == 5
    # Every codex entry must be reachable: task rewards plus the ending grant cover them all.
    assert report["unlockedCodexCount"] == report["totalCodexCount"] == 24
    assert report["metricSource"] == "persisted_journey"
    blocked = client.post("/api/journeys/mode", json=action(final, mode="onsite"))
    assert blocked.json()["error"]["code"] == "JOURNEY_COMPLETED"


def test_incomplete_ending_uses_rule_priority(client, started):
    state = complete_route(client, started, skip_final_task=True)
    response = client.post("/api/journeys/finale", json=action(state, choice_key="hang"))
    assert response.status_code == 200, response.text
    assert response.json()["snapshot"]["endingId"] == "wei-jin"
    assert client.get("/api/ending").json()["ruleSnapshot"]["allTasksComplete"] is False


def test_clear_progress_and_session_privacy(client, started, db):
    state = trigger(client, started, "pingjiang")
    assert client.post("/api/journeys/reset", json=action(state)).json()["snapshot"] is None
    assert client.post("/api/session").json()["snapshot"] is None
    assert db.scalar(select(func.count()).select_from(UserStoryState)) == 0
    assert client.delete("/api/session").json()["deleted"]
    assert client.get("/api/journeys/current").status_code == 401


def test_untrusted_state_fields_and_cross_origin_request(client, started):
    tampered = client.post("/api/location/trigger", json=action(started, spot_id="pingjiang", score=999, inventory=["clue-baibi"]))
    assert tampered.status_code == 422
    assert tampered.json()["error"]["code"] == "VALIDATION_ERROR"
    forbidden = client.post("/api/journeys/mode", json=action(started, mode="onsite"), headers={"Origin": "https://attacker.example"})
    assert forbidden.status_code == 403
    assert client.get("/api/journeys/current").json()["snapshot"]["stateVersion"] == started["stateVersion"]
