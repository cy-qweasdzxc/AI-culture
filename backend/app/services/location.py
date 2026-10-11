import math
from typing import Any

from app.core.errors import DomainError
from app.models import CulturalLocation, UserStoryState


def wgs84_to_gcj02(lat: float, lng: float) -> tuple[float, float]:
    """Match the frontend transform; skip coordinates outside mainland China."""
    if lng < 72.004 or lng > 137.8347 or lat < 0.8293 or lat > 55.8271:
        return lat, lng
    x, y = lng - 105, lat - 35
    dlat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    dlat += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    dlat += (20 * math.sin(y * math.pi) + 40 * math.sin(y * math.pi / 3)) * 2 / 3
    dlat += (160 * math.sin(y * math.pi / 12) + 320 * math.sin(y * math.pi / 30)) * 2 / 3
    dlng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    dlng += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    dlng += (20 * math.sin(x * math.pi) + 40 * math.sin(x * math.pi / 3)) * 2 / 3
    dlng += (150 * math.sin(x * math.pi / 12) + 300 * math.sin(x * math.pi / 30)) * 2 / 3
    rad = lat / 180 * math.pi
    magic = 1 - 0.006693421622965943 * math.sin(rad) ** 2
    root = math.sqrt(magic)
    dlat = dlat * 180 / ((6378245 * (1 - 0.006693421622965943)) / (magic * root) * math.pi)
    dlng = dlng * 180 / (6378245 / root * math.cos(rad) * math.pi)
    return lat + dlat, lng + dlng


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    a, b = math.radians(lat1), math.radians(lat2)
    h = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1 - h)))


def check_location(journey: UserStoryState, location: CulturalLocation, payload: Any) -> dict[str, Any]:
    status = journey.state_data.get("spotStatus", {}).get(location.id, "undiscovered")
    available = status in {"discovered", "current", "completed"}
    if journey.mode == "virtual":
        return {"canTrigger": available, "distanceM": None, "accuracyM": None, "mode": "virtual", "proof": "virtual", "coordinateStatus": "verified" if location.coordinates_verified else "approximate_demo"}
    if payload.lat is None or payload.lng is None or payload.accuracy_m is None:
        raise DomainError("LOCATION_REQUIRED", "实地探索需要浏览器定位和精度信息。")
    lat, lng = payload.lat, payload.lng
    if payload.coordinate_system == "wgs84":
        lat, lng = wgs84_to_gcj02(lat, lng)
    distance = distance_m(lat, lng, location.lat, location.lng)
    precise = payload.accuracy_m <= min(location.trigger_radius_m, 100)
    return {"canTrigger": available and precise and distance <= location.trigger_radius_m, "distanceM": round(distance, 1), "accuracyM": payload.accuracy_m, "triggerRadiusM": location.trigger_radius_m, "mode": "onsite", "proof": "browser_coordinates_untrusted", "coordinateStatus": "verified" if location.coordinates_verified else "approximate_demo"}
