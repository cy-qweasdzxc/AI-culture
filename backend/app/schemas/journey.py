from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class JourneyStart(StrictBody):
    story_id: str = "suzhou-pingjiang"
    role_id: str
    mode: Literal["virtual", "onsite"] = "virtual"
    audience_mode: Literal["child", "student", "adult"] = "adult"
    difficulty: Literal["easy", "normal", "advanced"] | None = None
    route_id: str | None = None


class JourneyAction(StrictBody):
    journey_id: str
    state_version: int = Field(ge=0)
    request_id: str | None = Field(default=None, max_length=80, min_length=1)


class ModeAction(JourneyAction):
    mode: Literal["virtual", "onsite"]


class ProfileAction(JourneyAction):
    audience_mode: Literal["child", "student", "adult"]
    difficulty: Literal["easy", "normal", "advanced"] | None = None


class TaskAnswer(JourneyAction):
    answer: Any


class FinaleAction(JourneyAction):
    choice_key: Literal["hang", "keep"]


class LocationCheck(StrictBody):
    journey_id: str
    spot_id: str
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100000)
    coordinate_system: Literal["wgs84", "gcj02"] = "wgs84"


class LocationTrigger(JourneyAction):
    spot_id: str
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100000)
    coordinate_system: Literal["wgs84", "gcj02"] = "wgs84"
