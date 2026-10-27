from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.journey import LocationTrigger


def action(state, **extra):
    return {
        "journey_id": state["journeyId"],
        "state_version": state["stateVersion"],
        "request_id": str(uuid4()),
        **extra,
    }


def trigger_body(**extra):
    return {
        "journey_id": "journey",
        "state_version": 1,
        "spot_id": "pingjiang",
        "lat": 31.3169,
        "lng": 120.6343,
        "coordinate_system": "gcj02",
        **extra,
    }


def test_coarse_finite_accuracy_returns_domain_error_not_422(client):
    assert client.post("/api/session").status_code == 200
    state = client.post(
        "/api/journeys/start", json={"role_id": "scholar", "mode": "onsite"},
    ).json()["snapshot"]
    response = client.post(
        "/api/location/trigger",
        json=action(state, spot_id="pingjiang", lat=31.3169, lng=120.6343, accuracy_m=806391.7, coordinate_system="gcj02"),
    )
    assert response.status_code == 409, response.text
    error = response.json()["error"]
    assert error["code"] == "LOCATION_INACCURATE"
    assert error["message"] == "定位精度不足，请重试或切换虚拟模式。"


def test_location_trigger_schema_accepts_coarse_finite_accuracy():
    assert LocationTrigger.model_validate(trigger_body(accuracy_m=806391.7)).accuracy_m == 806391.7


@pytest.mark.parametrize("accuracy", [float("nan"), float("inf"), float("-inf")])
def test_location_trigger_schema_rejects_non_finite_accuracy(accuracy):
    with pytest.raises(ValidationError):
        LocationTrigger.model_validate(trigger_body(accuracy_m=accuracy))
