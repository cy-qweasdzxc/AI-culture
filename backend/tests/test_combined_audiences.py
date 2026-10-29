import pytest
from test_journey import action, complete_route, trigger

from app.ai.rag.index import approved_records
from app.models import UserStoryState
from app.services.activities import available_activities
from app.services.experience import agent_context


@pytest.mark.parametrize("audience,default", [("child", "easy"), ("student", "normal"),
                                             ("adult", "normal"), ("senior", "easy")])
def test_all_four_profiles_restore_and_keep_the_same_fact_boundary(client, db, audience, default):
    client.post("/api/session")
    response = client.post("/api/journeys/start", json={"role_id": "scholar", "audience_mode": audience})
    assert response.status_code == 200, response.text
    state = response.json()["snapshot"]
    assert state["audienceMode"] == audience and state["difficulty"] == default
    assert client.post("/api/session").json()["snapshot"]["audienceMode"] == audience
    state = trigger(client, state, "pingjiang")
    journey = db.get(UserStoryState, state["journeyId"])
    context = agent_context(journey)
    assert context["audience_mode"] == audience and "同一证据约束" in context["truthfulness_instruction"]
    assert context["expression_instruction"]
    # All modes can read the same exploration without leaking answer variants.
    activities = available_activities(journey)
    assert activities and all(a["audienceMode"] == audience for a in activities)
    assert all(not {"answer", "variants", "supports"} & a.keys() for a in activities)
    assert approved_records(db, "suzhou-pingjiang") == []
    recommendation = client.post("/api/routes/recommend", json={"city_id": "suzhou", "audience_mode": audience})
    assert recommendation.status_code == 200
    assert client.get("/api/journeys/current").json()["snapshot"]["audienceMode"] == audience


def test_senior_mainline_completes_and_student_remains_available(client):
    client.post("/api/session")
    state = client.post("/api/journeys/start", json={"role_id": "scholar", "audience_mode": "senior"}).json()["snapshot"]
    state = complete_route(client, state)
    finished = client.post("/api/journeys/finale", json=action(state, choice_key="hang"))
    assert finished.status_code == 200 and finished.json()["snapshot"]["state"] == "COMPLETED"
    state = finished.json()["snapshot"]
    reset = client.post("/api/journeys/reset", json=action(state))
    assert reset.status_code == 200
    response = client.post("/api/journeys/start", json={"role_id": "scholar", "audience_mode": "student"})
    assert response.status_code == 200 and response.json()["snapshot"]["audienceMode"] == "student"


def test_directory_associations_are_read_only_and_do_not_expose_answers(client, started):
    detail = client.get("/api/cities/suzhou/attractions/pingjiang")
    assert detail.status_code == 200
    data = detail.json()
    assert any(route["id"] == "suzhou-classic" and route["playable"] for route in data["routes"])
    assert data["tasks"] and all(set(task) == {"id", "title", "type"} for task in data["tasks"])
    assert data["knowledge"] == []
    assert client.get("/api/journeys/current").json()["snapshot"] == started
    unplayable = client.get("/api/cities/suzhou/attractions/tongli").json()
    assert unplayable["routes"] == [] and unplayable["tasks"] == [] and not unplayable["playable"]
