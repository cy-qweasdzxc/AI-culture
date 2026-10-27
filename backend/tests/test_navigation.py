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


@pytest.mark.parametrize("payload", [
    [], None, {"status": 0, "result": None},
    {"status": 0, "result": {"routes": ["malformed"]}},
    {"status": 0, "result": {"routes": [{"distance": True, "duration": 4,
        "polyline": [31.0, 120.0, 1000, 2000]}]}},
    {"status": 0, "result": {"routes": [{"distance": 250, "duration": 4,
        "polyline": [31.0, 120.0, 1000, 2000], "steps": [None]}]}},
])
def test_malformed_provider_payload_always_degrades_without_corrupt_metrics(payload, monkeypatch):
    monkeypatch.setattr("app.services.navigation.httpx.get", lambda url, **kw:
        httpx.Response(200, request=httpx.Request("GET", url), json=payload))
    result = walking_route(POINTS, "synthetic-private-key")
    assert result["status"] == "schematic"
    assert result["reason"] == "MAP_PROVIDER_UNAVAILABLE"
    assert result["distance_m"] is None and result["duration_minutes"] is None
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


def test_walking_defaults_to_disclosed_stops(client, started, monkeypatch):
    observed = []
    def planner(points, *args):
        observed.extend(points)
        return {"status": "schematic", "polyline": points, "distance_m": None, "duration_minutes": None}
    monkeypatch.setattr("app.api.routes.catalog.walking_route", planner)
    response = client.post("/api/navigation/walking", json={"journey_id": started["journeyId"]})
    assert response.status_code == 200
    assert response.json()["stop_ids"] == ["pingjiang"]
    assert len(observed) == 1
    assert client.get("/api/journeys/current").json()["snapshot"]["stateVersion"] == started["stateVersion"]


def test_walking_cannot_plan_locked_stops(client, started, monkeypatch):
    monkeypatch.setattr("app.api.routes.catalog.walking_route", lambda *args: pytest.fail("Locked stops must not reach the provider"))
    response = client.post("/api/navigation/walking", json={"journey_id": started["journeyId"], "stop_ids": ["pingjiang", "ouyuan"]})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ROUTE_STOP_LOCKED"


def test_geographically_unrelated_provider_geometry_is_not_walking(monkeypatch):
    monkeypatch.setattr("app.services.navigation.httpx.get", lambda url, **kw:
        httpx.Response(200, request=httpx.Request("GET", url), json={"status": 0, "result": {"routes": [{
            "distance": 250, "duration": 4, "polyline": [40.0, 116.0, 1000, 2000],
        }]}}))
    result = walking_route(POINTS, "synthetic-private-key")
    assert result["status"] == "schematic"
    assert result["distance_m"] is None and result["duration_minutes"] is None


@pytest.mark.parametrize("status", [403, 429, 500])
def test_provider_http_denial_keeps_schematic_metrics(status, monkeypatch):
    monkeypatch.setattr("app.services.navigation.httpx.get", lambda url, **kw:
        httpx.Response(status, request=httpx.Request("GET", url)))
    result = walking_route(POINTS, "synthetic-private-key")
    assert result["status"] == "schematic"
    assert result["distance_m"] is None and result["duration_minutes"] is None


def test_multiple_legs_accumulate_provider_metres_and_minutes(monkeypatch):
    points = [*POINTS, {"lat": 31.002, "lng": 120.003}]
    calls = []
    def provider(url, **kwargs):
        index = len(calls)
        calls.append(kwargs)
        a, b = points[index:index + 2]
        return httpx.Response(200, request=httpx.Request("GET", url), json={"status": 0, "result": {"routes": [{
            "distance": 250, "duration": 4, "polyline": [a["lat"], a["lng"],
                round((b["lat"] - a["lat"]) * 1_000_000), round((b["lng"] - a["lng"]) * 1_000_000)],
        }]}})
    monkeypatch.setattr("app.services.navigation.httpx.get", provider)
    result = walking_route(points, "synthetic-private-key")
    assert result["status"] == "walking"
    assert result["distance_m"] == 500 and result["duration_minutes"] == 8
    assert len(calls) == 2
    assert result["polyline"][-1]["lat"] == pytest.approx(points[-1]["lat"])


def test_geometry_with_a_large_internal_jump_is_rejected(monkeypatch):
    monkeypatch.setattr("app.services.navigation.httpx.get", lambda url, **kw:
        httpx.Response(200, request=httpx.Request("GET", url), json={"status": 0, "result": {"routes": [{
            "distance": 250, "duration": 4,
            "polyline": [31.0, 120.0, 9_000_000, -4_000_000, -8_999_000, 4_002_000],
        }]}}))
    result = walking_route(POINTS, "synthetic-private-key")
    assert result["status"] == "schematic" and result["distance_m"] is None
