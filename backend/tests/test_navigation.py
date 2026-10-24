import json

import httpx
import pytest

from app.services.navigation import decode_polyline, walking_route

POINTS = [{"lat": 31.0, "lng": 120.0}, {"lat": 31.001, "lng": 120.002}]


@pytest.mark.parametrize("points", [[], POINTS[:1], [{"lat": float("nan"), "lng": 120.0}]])
def test_unusable_route_never_calls_provider(points, monkeypatch):
    monkeypatch.setattr("app.services.navigation.httpx.get", lambda *a, **kw: pytest.fail("No provider call allowed"))
    result = walking_route(points, "synthetic-key")
    assert result["status"] == "schematic"
    assert result["distance_m"] is None and result["duration_minutes"] is None


def test_no_key_does_not_invent_walking_metrics():
    result = walking_route(POINTS, "")
    assert result["reason"] == "MAP_KEY_MISSING"
    assert result["distance_m"] is None


def test_real_contract_uses_gcj02_metres_and_minutes(monkeypatch):
    def provider(url, **kwargs):
        assert url == "https://apis.map.qq.com/ws/direction/v1/walking/"
        assert kwargs["params"]["from"] == "31.0,120.0"
        return httpx.Response(200, request=httpx.Request("GET", url), json={"status": 0, "result": {"routes": [{"distance": 250, "duration": 4, "polyline": [31.0, 120.0, 1000, 2000], "steps": [{"instruction": "Synthetic route instruction"}]}]}})
    monkeypatch.setattr("app.services.navigation.httpx.get", provider)
    result = walking_route(POINTS, "synthetic-key")
    assert result["status"] == "walking"
    assert result["distance_m"] == 250 and result["duration_minutes"] == 4
    assert result["polyline"] == POINTS
    assert result["coordinate_system"] == "gcj02"


def test_provider_failure_does_not_leak_key_or_partial_metrics(monkeypatch):
    def provider(*args, **kwargs):
        raise httpx.ConnectError("synthetic-private-key must not be returned")
    monkeypatch.setattr("app.services.navigation.httpx.get", provider)
    result = walking_route(POINTS, "synthetic-private-key")
    assert result["distance_m"] is None
    assert "synthetic-private-key" not in json.dumps(result)


@pytest.mark.parametrize("values", [[31, 120, 1], [31, 120, True, 0], [31, 120, float("inf"), 0], [91, 120, 1, 2]])
def test_invalid_provider_geometry_is_rejected(values):
    with pytest.raises(ValueError):
        decode_polyline(values)


def test_planning_cannot_reorder_or_invent_stops(client, started):
    before = started["stateVersion"]
    body = {"journey_id": started["journeyId"], "stop_ids": ["ouyuan", "pingjiang"]}
    assert client.post("/api/navigation/walking", json=body).status_code == 422
    body["stop_ids"] = ["not-a-place"]
    assert client.post("/api/navigation/walking", json=body).status_code == 422
    assert client.get("/api/journeys/current").json()["snapshot"]["stateVersion"] == before
