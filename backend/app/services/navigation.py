"""Tencent walking routes: GCJ-02 geometry, metres and minutes, never straight-line estimates.

Contract: https://github.com/TencentLBS/tencentmap-webservice-skill/blob/main/references/api-direction.md
"""
import math

import httpx


def decode_polyline(values: list) -> list[dict[str, float]]:
    if len(values) < 4 or len(values) % 2 or len(values) > 80000:
        raise ValueError("Invalid walking geometry")
    decoded = []
    for index, value in enumerate(values):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("Invalid coordinate")
        coordinate = float(value) if index < 2 else decoded[index - 2] + value / 1_000_000
        if abs(coordinate) > (90 if index % 2 == 0 else 180):
            raise ValueError("Coordinate outside bounds")
        decoded.append(coordinate)
    return [{"lat": decoded[i], "lng": decoded[i + 1]} for i in range(0, len(decoded), 2)]


def separation_m(a: dict, b: dict) -> float:
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    delta_lat = lat2 - lat1
    delta_lng = math.radians(b["lng"] - a["lng"])
    angle = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 12_742_000 * math.asin(min(1.0, math.sqrt(angle)))


def walking_route(points: list[dict], key: str, timeout: float = 3) -> dict:
    fallback = {"status": "schematic", "coordinate_system": "gcj02", "polyline": points,
                "distance_m": None, "duration_minutes": None, "steps": [],
                "message": "当前为示意连线，不是道路导航；步行距离与时间未知。"}
    if any(not all(isinstance(p.get(axis), (int, float)) and not isinstance(p.get(axis), bool)
                   and math.isfinite(p[axis]) and abs(p[axis]) <= bound
                   for axis, bound in (("lat", 90), ("lng", 180))) for p in points):
        return {**fallback, "polyline": [], "reason": "INVALID_COORDINATE"}
    if len(points) < 2:
        return {**fallback, "reason": "SINGLE_POINT" if points else "EMPTY_ROUTE"}
    if not key:
        return {**fallback, "reason": "MAP_KEY_MISSING"}
    geometry, steps = [], []
    distance = duration = 0.0
    try:
        for start, end in zip(points, points[1:], strict=False):
            response = httpx.get("https://apis.map.qq.com/ws/direction/v1/walking/", params={
                "from": f"{start['lat']},{start['lng']}", "to": f"{end['lat']},{end['lng']}", "key": key,
            }, timeout=min(max(timeout, 0.1), 5), follow_redirects=False, trust_env=False)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or type(payload.get("status")) is not int or payload["status"] != 0:
                raise ValueError("Walking provider rejected request")
            route = payload["result"]["routes"][0]
            if not isinstance(route, dict) or any(type(route.get(field)) not in {int, float}
                                                  for field in ("distance", "duration")):
                raise ValueError("Invalid walking metrics")
            leg_distance, leg_duration = float(route["distance"]), float(route["duration"])
            if not (math.isfinite(leg_distance) and math.isfinite(leg_duration) and 0 <= leg_distance <= 300000 and 0 <= leg_duration <= 1440):
                raise ValueError("Invalid walking metrics")
            leg = decode_polyline(route["polyline"])
            # Allow provider snapping around approximate anchors, but never show a
            # different city's geometry or connect disconnected legs as a real route.
            if separation_m(leg[0], start) > 500 or separation_m(leg[-1], end) > 500:
                raise ValueError("Walking geometry does not match requested endpoints")
            if geometry and separation_m(geometry[-1], leg[0]) > 100:
                raise ValueError("Disconnected walking legs")
            length = sum(separation_m(a, b) for a, b in zip(leg, leg[1:], strict=False))
            if length > leg_distance * 1.25 + 100:
                raise ValueError("Walking geometry does not match distance")
            geometry.extend(leg[1:] if geometry and geometry[-1] == leg[0] else leg)
            instructions = route.get("steps", [])
            if not isinstance(instructions, list) or any(not isinstance(step, dict)
                    or not isinstance(step.get("instruction", ""), str) for step in instructions):
                raise ValueError("Invalid walking instructions")
            steps.extend(step.get("instruction", "")[:500] for step in instructions[:100])
            distance += leg_distance
            duration += leg_duration
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError):
        return {**fallback, "reason": "MAP_PROVIDER_UNAVAILABLE"}
    return {"status": "walking", "coordinate_system": "gcj02", "polyline": geometry,
            "distance_m": distance, "duration_minutes": duration, "steps": steps,
            "provider": "tencent", "endpoint_accuracy": "approximate_demo",
            "message": "道路路线由腾讯地图提供；当前景点游客入口仍待现场核验。"}
