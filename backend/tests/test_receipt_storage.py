import json
from uuid import uuid4

from sqlalchemy import select

from app.models import ActionReceipt, UserStoryState
from app.services.journey import add_event, mutate_journey
from scripts.compact_action_receipts import compact_receipts


def test_receipt_storage_grows_linearly_with_event_history(db, started):
    journey = db.get(UserStoryState, started["journeyId"])

    def operation(current):
        add_event(current, "mode", "切换体验模式")
        return {"mode": "virtual"}

    for _ in range(80):
        mutate_journey(db, journey, journey.state_version, str(uuid4()), "mode", {}, operation)
    receipts = list(db.scalars(select(ActionReceipt).order_by(ActionReceipt.created_at)))
    sizes = [len(json.dumps(row.response)) for row in receipts]
    assert len(receipts) == 80
    assert sum(sizes[40:]) <= sum(sizes[:40]) * 1.1
    assert all("snapshot" not in row.response for row in receipts)


def test_legacy_receipt_replay_and_optional_compaction_preserve_result(client, started, db):
    body = {"journey_id": started["journeyId"], "state_version": started["stateVersion"],
            "request_id": str(uuid4()), "mode": "onsite"}
    first = client.post("/api/journeys/mode", json=body).json()
    receipt = db.get(ActionReceipt, (body["journey_id"], body["request_id"]))
    receipt.response = first  # Simulate an old release's full snapshot receipt.
    db.commit()
    latest = client.post("/api/journeys/mode", json=body | {
        "state_version": first["snapshot"]["stateVersion"], "request_id": str(uuid4()), "mode": "virtual",
    }).json()["snapshot"]
    assert client.post("/api/journeys/mode", json=body).json()["snapshot"] == latest

    plan = compact_receipts(db)
    assert not plan["applied"] and plan["candidates"] == 1
    assert "snapshot" in db.get(ActionReceipt, (body["journey_id"], body["request_id"])).response
    applied = compact_receipts(db, apply=True)
    assert applied["payload_bytes_after"] < applied["payload_bytes_before"]
    replay = client.post("/api/journeys/mode", json=body).json()
    assert replay["replayed"] and replay["snapshot"] == latest
    assert compact_receipts(db)["candidates"] == 0
