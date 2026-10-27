"""The GitHub mainline and activities coexist with the local authored challenges."""
import pytest
from sqlalchemy import delete, func, select
from test_activities import answer_for, post_answer
from test_journey import action, complete_route, trigger

from app.models import Task, UserStoryState, UserTaskState
from app.services.activities import published
from app.services.experience import task_definition


def task_answer(task, journey):
    definition, rule = task_definition(task, journey)
    key = {"password": "password", "sorting": "sortingAnswer", "multi_select": "answerKeys", "matching": "matchingAnswer"}.get(definition["type"], "answerKey")
    return rule.get(key)


def submit_task(client, state, task, db):
    db.expire_all()
    journey = db.get(UserStoryState, state["journeyId"])
    body = action(state, answer=task_answer(task, journey))
    response = client.post(f"/api/tasks/{task.id}/verify", json=body)
    assert response.status_code == 200 and response.json()["ok"], response.text
    return response.json()["snapshot"], body


def test_both_optional_collections_can_be_skipped_and_mainline_is_read_only_after_ending(client, started):
    state = complete_route(client, started)
    assert len(state["taskStates"]) == 21
    assert state["activityStates"] == {}
    assert state["state"] == "ENDING_READY"
    report = client.get("/api/report").json()
    assert report["requiredTaskCount"] == report["completedRequiredTaskCount"] == 6
    assert report["optionalTaskCount"] == 15 and report["completedOptionalTaskCount"] == 0
    assert report["requiredTaskScore"] == report["requiredTaskMaxScore"] == 140
    assert report["optionalTaskScore"] == 0 and report["optionalTaskMaxScore"] == 120
    assert report["knowledgeScore"] == 140 and report["maxScore"] == 260
    assert report["optionalTotalCount"] == 8 and report["optionalCompletedCount"] == report["optionalScore"] == 0
    assert report["optionalMaxScore"] == 64 and report["totalMaxScore"] == 324
    final = client.post("/api/journeys/finale", json=action(state, choice_key="hang")).json()["snapshot"]
    assert final["endingId"] == "cheng-huai"
    assert client.post("/api/tasks/task-subo-challenge-1/verify", json=action(final, answer="A")).json()["error"]["code"] == "JOURNEY_COMPLETED"
    assert client.post("/api/location/trigger", json=action(final, spot_id="pingjiang")).json()["error"]["code"] == "JOURNEY_COMPLETED"
    assert post_answer(client, final, published()[-1], answer_for(published()[-1], "normal")).json()["error"]["code"] == "JOURNEY_COMPLETED"


def test_challenge_and_activity_rewards_reports_and_replays_are_independent(client, db, started):
    state = trigger(client, started, "pingjiang")
    challenge = db.get(Task, "task-pingjiang-challenge-2")
    assert challenge is not None
    state, task_body = submit_task(client, state, challenge, db)
    mainline = {key: value for key, value in state["taskStates"].items() if "challenge" not in key}
    activity = next(a for a in published() if a.spotId == "pingjiang")
    activity_body = action(state, answer=answer_for(activity, "normal"))
    response = client.post(f"/api/activities/{activity.id}/verify", json=activity_body)
    assert response.status_code == 200 and response.json()["ok"], response.text
    state = response.json()["snapshot"]
    report = client.get("/api/report").json()
    assert report["knowledgeScore"] == report["optionalTaskScore"] == 8
    assert report["optionalScore"] == 8 and report["totalScore"] == 16
    assert report["completedOptionalTaskCount"] == report["optionalCompletedCount"] == 1
    assert {key: value for key, value in state["taskStates"].items() if "challenge" not in key} == mainline
    for path, body in [(f"/api/tasks/{challenge.id}/verify", task_body), (f"/api/activities/{activity.id}/verify", activity_body)]:
        replay = client.post(path, json=body).json()
        assert replay["replayed"] and replay["snapshot"] == state
    duplicate = client.post(f"/api/tasks/{challenge.id}/verify", json=action(state, answer=task_body["answer"]))
    assert duplicate.json()["error"]["code"] == "TASK_COMPLETED"
    assert client.get("/api/report").json()["totalScore"] == 16


def test_legacy_journey_synthesizes_missing_challenge_without_writing_until_submission(client, db, started):
    state = trigger(client, started, "pingjiang")
    task_id = "task-pingjiang-challenge-3"
    db.execute(delete(UserTaskState).where(UserTaskState.journey_id == state["journeyId"], UserTaskState.task_id == task_id))
    db.commit()
    before = db.scalar(select(func.count()).select_from(UserTaskState))
    restored = client.post("/api/session").json()["snapshot"]
    assert restored["taskStates"][task_id] == {"status": "available", "attempts": 0, "score": 0}
    public = next(t for t in client.get("/api/tasks").json()["items"] if t["id"] == task_id)
    assert public["matchingLeft"] and public["matchingRight"]
    assert client.get("/api/report").status_code == 200
    assert db.scalar(select(func.count()).select_from(UserTaskState)) == before
    task = db.get(Task, task_id)
    state, _ = submit_task(client, restored, task, db)
    db.expire_all()
    persisted = db.get(UserTaskState, (state["journeyId"], task_id))
    assert persisted.status == "completed" and persisted.score == 8 and persisted.attempts == 1
    assert db.scalar(select(func.count()).select_from(UserTaskState)) == before + 1


def test_return_challenge_preserves_following_stop_and_finale_progress(client, db, started):
    state = complete_route(client, started, skip_final_task=True)
    assert state["spotStatus"]["subo"] == "current"
    state = trigger(client, state, "pingjiang")
    task = db.get(Task, "task-pingjiang-challenge-1")
    assert task is not None
    state, _ = submit_task(client, state, task, db)
    assert state["spotStatus"]["ouyuan"] == "completed"
    assert state["spotStatus"]["subo"] == "current"
    state = trigger(client, state, "subo")
    assert state["currentSpotId"] == "subo"
    task = db.get(Task, "task-pianshi")
    state, _ = submit_task(client, state, task, db)
    assert state["state"] == "ENDING_READY"
    wrong = client.post("/api/tasks/task-subo-challenge-1/verify", json=action(state, answer="wrong")).json()
    assert not wrong["ok"] and wrong["snapshot"]["state"] == "ENDING_READY"
    state, _ = submit_task(client, wrong["snapshot"], db.get(Task, "task-subo-challenge-1"), db)
    assert state["state"] == "ENDING_READY"
    assert client.post("/api/journeys/finale", json=action(state, choice_key="keep")).json()["snapshot"]["endingId"] == "qu-jing"


def test_challenge_answers_and_pair_relationships_are_redacted_before_and_after_completion(client, db, started):
    state = trigger(client, started, "pingjiang")
    items = client.get("/api/tasks").json()["items"]
    assert len(items) == 5
    forbidden = {"answerKey", "answerKeys", "matchingAnswer", "matchingPairs", "password", "sortingAnswer"}
    for task in items:
        assert not forbidden & task.keys()
        assert "explanation" not in task
    matching = next(t for t in items if t["type"] == "matching")
    assert {x["id"] for x in matching["matchingLeft"]}.isdisjoint(x["id"] for x in matching["matchingRight"])
    state, _ = submit_task(client, state, db.get(Task, matching["id"]), db)
    completed = next(t for t in client.get("/api/tasks").json()["items"] if t["id"] == matching["id"])
    assert completed["explanation"] and not forbidden & completed.keys()


def test_onsite_first_arrival_and_revisit_both_require_fresh_location(client):
    client.post("/api/session")
    state = client.post("/api/journeys/start", json={"role_id": "scholar", "mode": "onsite"}).json()["snapshot"]
    denied = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang"))
    assert denied.json()["error"]["code"] == "LOCATION_REQUIRED"
    response = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang", lat=31.3169, lng=120.6343, accuracy_m=10, coordinate_system="gcj02"))
    assert response.status_code == 200, response.text
    state = response.json()["snapshot"]
    reopened = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang"))
    assert reopened.json()["error"]["code"] == "LOCATION_REQUIRED"
    reopened = client.post("/api/location/trigger", json=action(state, spot_id="pingjiang", lat=31.3169, lng=120.6343, accuracy_m=10, coordinate_system="gcj02"))
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["location"]["proof"] == "browser_coordinates_untrusted"


@pytest.mark.parametrize("difficulty", ["easy", "normal", "advanced"])
def test_all_21_tasks_and_eight_activities_complete_with_matching_group_totals(client, db, difficulty):
    from test_journey import grant_dialogue_clue

    from app.repositories.catalog import locations, tasks

    client.post("/api/session")
    state = client.post("/api/journeys/start", json={"role_id": "scholar", "difficulty": difficulty}).json()["snapshot"]
    for place in locations(db, "suzhou-pingjiang"):
        state = trigger(client, state, place.id)
        if place.id == "pingjiang":
            state = grant_dialogue_clue(client, state, "zhou-bo", "平江图")
        if place.id == "subo":
            state = grant_dialogue_clue(client, state, "xiao-shen", "片石白墙")
        for task in tasks(db, "suzhou-pingjiang"):
            if task.location_id == place.id:
                state, _ = submit_task(client, state, task, db)
        for activity in published():
            if activity.spotId != place.id:
                continue
            if activity.requiredHintOnAdvanced and difficulty == "advanced":
                state = grant_dialogue_clue(client, state, activity.npcId, activity.hintQuestion)
            response = post_answer(client, state, activity, answer_for(activity, difficulty))
            assert response.status_code == 200 and response.json()["ok"], response.text
            state = response.json()["snapshot"]
    report = client.get("/api/report").json()
    assert report["completedRequiredTaskCount"] == report["requiredTaskCount"] == 6
    assert report["completedOptionalTaskCount"] == report["optionalTaskCount"] == 15
    assert report["completedTaskCount"] == report["totalTaskCount"] == 21
    assert report["optionalCompletedCount"] == report["optionalTotalCount"] == 8
    assert report["knowledgeScore"] == report["maxScore"] == report["requiredTaskScore"] + report["optionalTaskScore"]
    assert report["requiredTaskScore"] == report["requiredTaskMaxScore"]
    assert report["optionalTaskScore"] == report["optionalTaskMaxScore"]
    assert report["optionalScore"] == report["optionalMaxScore"] == 64
    assert report["totalScore"] == report["totalMaxScore"] == report["maxScore"] + 64
    if difficulty == "normal":
        assert report["totalScore"] == 324
    final = client.post("/api/journeys/finale", json=action(state, choice_key="hang"))
    assert final.status_code == 200 and final.json()["snapshot"]["endingId"] == "cheng-huai", final.text


def test_missing_legacy_required_state_does_not_make_optional_answer_complete_stop(client, db, started):
    state = trigger(client, started, "pingjiang")
    db.execute(delete(UserTaskState).where(UserTaskState.journey_id == state["journeyId"], UserTaskState.task_id.in_(["task-shuangqipan", "task-pingjiangtu"])))
    db.commit()
    state, _ = submit_task(client, state, db.get(Task, "task-pingjiang-challenge-1"), db)
    assert state["spotStatus"]["pingjiang"] == "current"
    assert state["spotStatus"]["ouyuan"] == "undiscovered"
    assert state["taskStates"]["task-shuangqipan"]["status"] == "available"
    assert state["taskStates"]["task-pingjiang-challenge-1"]["status"] == "completed"


def test_ended_journey_can_read_unfinished_challenges_at_previous_visited_stop(client, started):
    state = complete_route(client, started)
    final = client.post("/api/journeys/finale", json=action(state, choice_key="hang")).json()["snapshot"]
    items = client.get("/api/tasks").json()["items"]
    pingjiang = [task for task in items if task["spotId"] == "pingjiang"]
    assert len(pingjiang) == 5 and sum(task.get("optional", False) for task in pingjiang) == 3
    challenge = next(task for task in pingjiang if task["id"] == "task-pingjiang-challenge-3")
    assert challenge["matchingLeft"] and challenge["matchingRight"] and "explanation" not in challenge
    assert not {"answerKey", "answerKeys", "matchingAnswer", "matchingPairs"} & challenge.keys()
    denied = client.post(f"/api/tasks/{challenge['id']}/verify", json=action(final, answer={}))
    assert denied.json()["error"]["code"] == "JOURNEY_COMPLETED"
