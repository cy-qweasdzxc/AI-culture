"""An insert-only upgrade keeps historical rows but does not republish old routes."""
from app.models import Character, City, CulturalLocation, Route, RouteStop, Story, UserStoryState
from app.services.seed import seed_database


def test_upgrade_hides_old_catalog_and_new_starts_but_preserves_owned_journey(client, db, started):
    for city_id, story_id, route_id in [
        ("hangzhou", "hangzhou-xihu", "hangzhou-xihu-classic"),
        ("nanjing", "nanjing-zhongshan", "nanjing-zhongshan-classic"),
    ]:
        db.add(City(id=city_id, name=city_id, status="open", data={"id": city_id, "preview_places": []}))
        db.add(Story(id=story_id, name=story_id, status="published", data={"id": story_id}))
        db.flush()
        db.add(Character(id=story_id + "-role", story_id=story_id, kind="player", name="legacy role", data={"id": story_id + "-role", "startClueId": "legacy-clue"}))
        db.add(CulturalLocation(id=story_id + "-stop", story_id=story_id, name="legacy stop", route_order=1, lat=31, lng=120, trigger_radius_m=100, data={"id": story_id + "-stop"}))
        db.add(Route(id=route_id, city_id=city_id, story_id=story_id, name=route_id, status="open", data={"completes_story": True}))
        db.flush()
        db.add(RouteStop(route_id=route_id, location_id=story_id + "-stop", position=1))
    db.add(Route(id="suzhou-garden-stones", city_id="suzhou", story_id="suzhou-pingjiang", name="legacy garden route", status="open", data={"completes_story": True}))
    db.flush()
    db.add(RouteStop(route_id="suzhou-garden-stones", location_id="ouyuan", position=1))
    db.commit()
    seed_database(db)

    cities = client.get("/api/cities").json()["items"]
    assert {city["id"] for city in cities} == {"suzhou", "beijing", "xian", "chengdu"}
    routes = client.get("/api/cities/suzhou/routes").json()["items"]
    assert {route["id"] for route in routes} == {"suzhou-classic", "suzhou-short", "suzhou-branches"}
    assert [route["id"] for route in routes if route["playable"]] == ["suzhou-classic"]
    recommended = client.post("/api/routes/recommend", json={"city_id": "suzhou"}).json()
    assert {route["route_id"] for route in recommended["items"]} == {"suzhou-classic", "suzhou-short"}
    assert client.post("/api/journeys/start", json={"role_id": "scholar", "route_id": "suzhou-garden-stones"}).json()["error"]["code"] == "ROUTE_UNAVAILABLE"
    assert [story["id"] for story in client.get("/api/themes").json()["items"]] == ["suzhou-pingjiang"]
    for city_id, story_id, route_id in [("hangzhou", "hangzhou-xihu", "hangzhou-xihu-classic"), ("nanjing", "nanjing-zhongshan", "nanjing-zhongshan-classic")]:
        assert client.get(f"/api/cities/{city_id}").status_code == 404
        assert client.get(f"/api/cities/{city_id}/routes").status_code == 404
        assert client.post("/api/routes/recommend", json={"city_id": city_id}).status_code == 404
        assert client.get("/api/roles", params={"story_id": story_id}).status_code == 404
        assert client.post("/api/journeys/start", json={"story_id": story_id, "role_id": story_id + "-role", "route_id": route_id}).json()["error"]["code"] == "STORY_INVALID"

    legacy = db.get(UserStoryState, started["journeyId"])
    legacy.story_id, legacy.role_id = "hangzhou-xihu", "hangzhou-xihu-role"
    legacy.current_location_id, legacy.current_node_id = "hangzhou-xihu-stop", None
    legacy.state_data = {"route_id": "hangzhou-xihu-classic", "spotStatus": {"hangzhou-xihu-stop": "current"}}
    db.commit()
    seed_database(db)
    restored = client.post("/api/session").json()["snapshot"]
    assert restored["journeyId"] == started["journeyId"] and restored["storyId"] == "hangzhou-xihu"
    assert restored["routeId"] == "hangzhou-xihu-classic" and restored["currentSpotId"] == "hangzhou-xihu-stop"
    assert db.get(Story, "hangzhou-xihu") and db.get(Route, "suzhou-garden-stones") and db.get(City, "nanjing")
    restored_route = client.get("/api/routes/hangzhou-xihu", params={"journey_id": legacy.id})
    assert restored_route.status_code == 200 and [spot["id"] for spot in restored_route.json()["spots"]] == ["hangzhou-xihu-stop"]
    roles = client.get("/api/roles", params={"story_id": "hangzhou-xihu", "journey_id": legacy.id})
    assert roles.status_code == 200 and [role["id"] for role in roles.json()["items"]] == ["hangzhou-xihu-role"]
    client.cookies.clear()
    client.post("/api/session")
    assert client.get("/api/roles", params={"story_id": "hangzhou-xihu", "journey_id": legacy.id}).status_code == 404


def test_existing_garden_journey_retains_its_three_stops_start_node_and_finale(client, db, started):
    from sqlalchemy import delete
    from test_journey import action, trigger
    from test_merged_gameplay import submit_task

    from app.models import StoryEdge, StoryNode, Task, UserTaskState

    route_id, start_id, finale_id = "suzhou-garden-stones", "start-suzhou-garden-stones", "finale-suzhou-garden-stones"
    ending_id = "ending-suzhou-garden-hang"
    chain = ["ouyuan", "shizilin", "zhuozhengyuan"]
    db.add(Route(id=route_id, city_id="suzhou", story_id="suzhou-pingjiang", name="legacy garden route", status="open", data={"completes_story": True, "start_node_id": start_id, "finale_node_id": finale_id, "finale_location_id": chain[-1], "final_codex_id": None}))
    db.add(StoryNode(id=start_id, story_id="suzhou-pingjiang", kind="start", data={}))
    db.add(StoryNode(id=finale_id, story_id="suzhou-pingjiang", location_id=chain[-1], kind="choice", data={}))
    db.add(StoryNode(id=ending_id, story_id="suzhou-pingjiang", kind="ending", data={"id": ending_id, "name": "园林留影"}))
    db.flush()
    for position, spot_id in enumerate(chain, 1):
        db.add(RouteStop(route_id=route_id, location_id=spot_id, position=position))
    for source, destination, choice, conditions in [
        (start_id, "spot-ouyuan", None, {}),
        ("spot-zhuozhengyuan", finale_id, None, {}),
        (finale_id, ending_id, "hang", {"all_tasks_complete": True}),
    ]:
        db.add(StoryEdge(id=source + "--" + destination, story_id="suzhou-pingjiang", from_node_id=source, to_node_id=destination, choice_key=choice, conditions=conditions))
    legacy = db.get(UserStoryState, started["journeyId"])
    legacy.current_node_id = start_id
    legacy.state_data = {**legacy.state_data, "route_id": route_id, "spotStatus": {spot_id: "discovered" if index == 0 else "undiscovered" for index, spot_id in enumerate(chain)}}
    db.execute(delete(UserTaskState).where(UserTaskState.journey_id == legacy.id, UserTaskState.task_id.in_(["task-shuangqipan", "task-pingjiangtu", "task-pianshi", *["task-" + spot + "-challenge-" + str(index) for spot in ["pingjiang", "subo"] for index in range(1, 4)]])))
    db.commit()
    state = client.post("/api/session").json()["snapshot"]
    assert state["routeId"] == route_id and len(state["taskStates"]) == 12
    visible = client.get("/api/routes/suzhou-pingjiang", params={"journey_id": legacy.id}).json()
    assert [spot["id"] for spot in visible["spots"]] == ["ouyuan"]
    for spot_id, task_id in zip(chain, ["task-jiaou", "task-shizi-dynasty", "task-zhuozheng-timeline"], strict=True):
        state = trigger(client, state, spot_id)
        state, _ = submit_task(client, state, db.get(Task, task_id), db)
    assert state["state"] == "ENDING_READY" and "subo" not in state["spotStatus"]
    report = client.get("/api/report").json()
    assert report["totalSpotCount"] == report["completedSpotCount"] == 3
    assert report["requiredTaskCount"] == report["completedRequiredTaskCount"] == 3
    assert report["optionalTaskCount"] == 9 and report["totalTaskCount"] == 12
    from app.services.activities import published
    route_activities = [activity for activity in published() if activity.spotId in chain]
    assert report["optionalTotalCount"] == len(route_activities)
    assert report["optionalMaxScore"] == sum(activity.baseScore for activity in route_activities)
    ending = client.post("/api/journeys/finale", json=action(state, choice_key="hang"))
    assert ending.status_code == 200 and ending.json()["snapshot"]["endingId"] == ending_id, ending.text
