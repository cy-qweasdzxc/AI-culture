import copy
from itertools import permutations

from app.models import Task, UserStoryState
from app.services.journey import initial_sorting_order

SORTING_TASK_ID = "task-zhuozheng-timeline"
PRIVATE_TASK_FIELDS = {
    "answerKey",
    "answerKeys",
    "matchingAnswer",
    "matchingPairs",
    "password",
    "sortingAnswer",
    "explanation",
}


def test_initial_sorting_order_is_a_non_identity_permutation_for_every_answer():
    for item_count in range(2, 6):
        for answer in permutations(range(item_count)):
            order = initial_sorting_order(item_count, list(answer))
            assert sorted(order) == list(range(item_count))
            assert order != list(answer)
    assert initial_sorting_order(0, []) == []
    # A single item has no other permutation, so identity is unavoidable.
    assert initial_sorting_order(1, [0]) == [0]


def test_public_sorting_task_uses_initial_order_without_leaking_answer(client, db, started):
    journey = db.get(UserStoryState, started["journeyId"])
    assert journey is not None
    # The serializer is the unit under test. Place the journey at the sorting stop
    # directly instead of replaying the whole dialogue and reward flow.
    journey.current_location_id = "zhuozhengyuan"
    journey.state_data = {
        **copy.deepcopy(journey.state_data),
        "spotStatus": {**journey.state_data["spotStatus"], "zhuozhengyuan": "current"},
    }
    db.commit()

    tasks = client.get("/api/tasks").json()["items"]
    public_task = next(task for task in tasks if task["id"] == SORTING_TASK_ID)
    stored = db.get(Task, SORTING_TASK_ID)
    assert stored is not None
    answer = stored.validation["sortingAnswer"]
    item_count = len(stored.data["sortingItems"])

    assert sorted(public_task["initialOrder"]) == list(range(item_count))
    assert public_task["initialOrder"] != answer
    assert "sortingAnswer" not in public_task
    assert not PRIVATE_TASK_FIELDS.intersection(public_task)
