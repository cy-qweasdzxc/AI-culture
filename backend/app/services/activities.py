"""Optional authored exploration. No cultural approvals, model rewards or mainline edges."""
import copy
import json
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.core.errors import DomainError
from app.models import Item, UserStoryState
from app.services.experience import profile


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    label: str


class Variant(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[Card] = Field(default_factory=list)
    targets: list[Card] = Field(default_factory=list)
    evidence: list[Card] = Field(default_factory=list)
    statements: list[Card] = Field(default_factory=list)
    answer: list[str] | dict[str, str]
    supports: dict[str, str] = Field(default_factory=dict)
    hint: str
    feedback: str


class Activity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    spotId: Literal["pingjiang", "ouyuan", "shizilin", "zhuozhengyuan", "subo"]
    title: str
    mechanism: Literal["ordering", "matching", "evidence"]
    contentKind: Literal["fiction", "synthetic", "image_observation", "cultural_fact"]
    publication: Literal["demo", "pending", "verified"]
    version: int = Field(ge=1)
    baseScore: int = Field(ge=0, le=20)
    briefing: str
    variants: dict[str, Variant]
    explanation: str
    rewardCodexIds: list[str]
    sourceLabel: str
    photo: bool = False
    recap: bool = False
    npcId: str | None = None
    hintQuestion: str | None = None
    npcHint: str | None = None
    requiredHintOnAdvanced: bool = False

    @model_validator(mode="after")
    def valid_variants(self):
        if set(self.variants) != {"easy", "normal", "advanced"}:
            raise ValueError("Every activity needs all three difficulty variants")
        for v in self.variants.values():
            for cards in (v.items, v.targets, v.evidence, v.statements):
                if len({c.id for c in cards}) != len(cards):
                    raise ValueError("Duplicate card ID")
            items, targets = {c.id for c in v.items}, {c.id for c in v.targets}
            if self.mechanism == "ordering":
                if not isinstance(v.answer, list) or set(v.answer) != items or len(v.answer) != len(items):
                    raise ValueError("Ordering answer must be a full permutation")
            elif self.mechanism == "matching":
                if (not isinstance(v.answer, dict) or set(v.answer) != items
                        or set(v.answer.values()) != targets or len(items) != len(targets)):
                    raise ValueError("Matching answer must be a bijection")
            elif (not isinstance(v.answer, list) or len(v.answer) != len(set(v.answer))
                  or not set(v.answer) <= {c.id for c in v.statements}
                  or set(v.supports) != set(v.answer)
                  or not set(v.supports.values()) <= {c.id for c in v.evidence}):
                raise ValueError("Evidence answers must link to provided evidence")
        if self.requiredHintOnAdvanced and not all((self.npcId, self.hintQuestion, self.npcHint)):
            raise ValueError("NPC-gated activity needs an authored hint")
        return self


@lru_cache(maxsize=1)
def definitions() -> tuple[Activity, ...]:
    raw = json.loads((PROJECT_ROOT / "data/demo/activities.json").read_text(encoding="utf-8"))
    if raw["schemaVersion"] != 1 or raw["storyId"] != "suzhou-pingjiang":
        raise ValueError("Unsupported activity catalog")
    rows = tuple(Activity.model_validate(row) for row in raw["activities"])
    if len({row.id for row in rows}) != len(rows):
        raise ValueError("Duplicate activity ID")
    return rows


def published() -> tuple[Activity, ...]:
    # A file's claim of verified/reviewed never grants cultural publishing rights.
    return tuple(a for a in definitions() if a.publication == "demo" and a.contentKind != "cultural_fact")


def seed_items(db: Session, story_id: str) -> None:
    if story_id != "suzhou-pingjiang":
        return
    for a in published():
        entries = [("activity-note-" + a.id, "探索札记：" + a.title, a.explanation)]
        if a.npcId:
            entries.append(("activity-hint-" + a.id, "剧情线索：" + a.title, a.npcHint))
        for item_id, name, text in entries:
            if db.get(Item, item_id) is None:
                db.add(Item(id=item_id, story_id=story_id, kind="clue", name=name,
                            data={"id": item_id, "name": name, "kind": "clue", "fromSpotId": a.spotId,
                                  "description": "可选探索演示材料（非已核验史实）：" + text,
                                  "isDemo": True, "isFictional": a.contentKind == "fiction"}))
    db.flush()


def public_activity(a: Activity, journey: UserStoryState) -> dict:
    selected = profile(journey)
    v = a.variants[selected["difficulty"]]
    saved = journey.state_data.get("activities", {}).get(a.id, {})
    result = a.model_dump(exclude={"variants", "explanation", "npcHint", "rewardCodexIds", "baseScore"})
    result.update(v.model_dump(exclude={"answer", "supports", "feedback"}))
    result.update(optional=True, cultureFactReviewed=False, difficulty=selected["difficulty"],
                  audienceMode=selected["audience_mode"], score=a.baseScore,
                  needsEvidenceLinks=a.mechanism == "evidence" and selected["difficulty"] == "advanced",
                  needsNpcHint=a.requiredHintOnAdvanced and selected["difficulty"] == "advanced",
                  npcHintObtained=("activity-hint-" + a.id) in journey.state_data.get("activityHints", []),
                  progress=copy.deepcopy(saved) or {"status": "available", "attempts": 0, "score": 0})
    if saved.get("status") == "completed":
        result["explanation"] = a.explanation
    result["readingGuide"] = {
        "child": "一次看一张卡片。不确定时可以展开提示，也可以请眼前的角色帮忙。",
        "student": "先读材料，再找支持判断的证据；注意区分画面、推断和剧情。",
        "adult": "按给定材料完成观察或推理；本互动不作为正式历史事实审核结果。",
    }[selected["audience_mode"]]
    return result


def available_activities(journey: UserStoryState) -> list[dict]:
    if journey.story_id != "suzhou-pingjiang":
        return []
    visited = journey.state_data.get("spotStatus", {})
    return [public_activity(a, journey) for a in published()
            if visited.get(a.spotId) in {"current", "completed"}]


def hint_text(npc_id: str, spot_id: str, question: str) -> str:
    a = next((a for a in published() if a.npcId == npc_id and a.spotId == spot_id and question.strip() == a.hintQuestion), None)
    return "可选探索剧情提示（非历史事实）：" + a.npcHint if a else ""


def authored_hint(db: Session, journey: UserStoryState, npc_id: str, question: str) -> tuple[str, list[dict]]:
    from app.services.journey import grant_item
    for a in published():
        if a.npcId != npc_id or a.spotId != journey.current_location_id or question.strip() != a.hintQuestion:
            continue
        item_id = "activity-hint-" + a.id
        data = copy.deepcopy(journey.state_data)
        data["activityHints"] = list(dict.fromkeys([*data.get("activityHints", []), item_id]))
        journey.state_data = data
        granted = grant_item(db, journey, item_id, "authored-activity:" + a.id)
        return "可选探索剧情提示（非历史事实）：" + a.npcHint, ([{"type": "grant_clue", "id": item_id, "origin": "authored_rule"}] if granted else [])
    return "", []


def verify_activity(db: Session, journey: UserStoryState, activity_id: str, answer: object) -> dict:
    from app.services.journey import add_event, grant_item, unlock_codex
    a = next((a for a in published() if a.id == activity_id), None)
    if a is None or journey.story_id != "suzhou-pingjiang":
        raise DomainError("ACTIVITY_NOT_FOUND", "可选探索不存在或尚未发布。", 404)
    if journey.current_location_id != a.spotId or journey.state_data.get("spotStatus", {}).get(a.spotId) not in {"current", "completed"}:
        raise DomainError("ACTIVITY_UNAVAILABLE", "请先到达这个探索所在的景点。", 409)
    data = copy.deepcopy(journey.state_data)
    states = data.setdefault("activities", {})
    previous = states.get(a.id, {})
    if previous.get("status") == "completed":
        raise DomainError("ACTIVITY_COMPLETED", "探索已完成，奖励不会重复发放。", 409)
    selected = profile(journey)["difficulty"]
    v = a.variants[selected]
    if a.requiredHintOnAdvanced and selected == "advanced" and "activity-hint-" + a.id not in data.get("activityHints", []):
        return {"ok": False, "feedback": "深入难度需要先向阿蘅主动询问两室手札的剧情线索；文化拒答不会影响这条虚构线索。"}
    if a.mechanism == "ordering":
        ids = {c.id for c in v.items}
        valid = isinstance(answer, list) and all(type(i) is str for i in answer) and len(answer) == len(ids) and set(answer) == ids
        correct = valid and answer == v.answer
    elif a.mechanism == "matching":
        valid = (isinstance(answer, dict) and all(type(k) is str and type(x) is str for k, x in answer.items())
                 and set(answer) == {c.id for c in v.items} and set(answer.values()) == {c.id for c in v.targets}
                 and len(answer.values()) == len(set(answer.values())))
        correct = valid and answer == v.answer
    else:
        valid = isinstance(answer, dict) and set(answer) == {"selected", "supports"}
        choices = answer.get("selected", []) if valid else []
        links = answer.get("supports", {}) if valid else {}
        valid = (valid and isinstance(choices, list) and all(type(i) is str for i in choices)
                 and len(choices) == len(set(choices)) and set(choices) <= {c.id for c in v.statements}
                 and isinstance(links, dict) and all(type(k) is str and type(x) is str for k, x in links.items())
                 and set(links) <= set(choices) and set(links.values()) <= {c.id for c in v.evidence})
        correct = valid and set(choices) == set(v.answer) and (selected != "advanced" or links == v.supports)
    if not valid:
        raise DomainError("ACTIVITY_ANSWER_INVALID", "答案格式不完整，请按页面提供的卡片作答。", 422)
    score = a.baseScore if correct else 0
    states[a.id] = {"status": "completed" if correct else "available", "attempts": previous.get("attempts", 0) + 1,
                    "score": score, "answer": answer, "version": a.version, "difficulty": selected}
    journey.state_data = data
    awarded, unlocked = [], []
    if correct:
        note = "activity-note-" + a.id
        if grant_item(db, journey, note, "activity:" + a.id):
            awarded.append(note)
        for codex_id in a.rewardCodexIds:
            if unlock_codex(db, journey, codex_id, "activity:" + a.id):
                unlocked.append(codex_id)
    add_event(journey, "task", ("完成可选探索：" if correct else "可选探索待修正：") + a.title + (f"（探索积分 +{score}）" if correct else ""))
    return {"ok": bool(correct), "feedback": a.explanation if correct else v.feedback,
            "awardedScore": score, "awardedClues": awarded, "unlockedCodex": unlocked}


def activity_report(journey: UserStoryState) -> dict:
    states = journey.state_data.get("activities", {})
    active = [a for a in published() if journey.story_id == "suzhou-pingjiang"]
    return {"optionalScore": sum(s.get("score", 0) for s in states.values()),
            "optionalMaxScore": sum(a.baseScore for a in active),
            "optionalCompletedCount": sum(s.get("status") == "completed" for s in states.values()),
            "optionalTotalCount": len(active),
            "optionalBySpot": [{"spotId": spot, "completed": sum(states.get(a.id, {}).get("status") == "completed" for a in active if a.spotId == spot),
                                "total": sum(a.spotId == spot for a in active)}
                               for spot in ("pingjiang", "ouyuan", "shizilin", "zhuozhengyuan", "subo")]}
