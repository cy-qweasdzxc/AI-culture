"""Server-owned audience, difficulty and task variants; no age or identity data."""
import copy
import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models import Task, UserStoryState, UserTaskState

AUDIENCES = {"child", "student", "adult"}
DIFFICULTIES = {"easy", "normal", "advanced"}


def profile(journey: UserStoryState) -> dict:
    saved = journey.state_data.get("profile", {})
    return {"audience_mode": saved.get("audience_mode", "adult"), "difficulty": saved.get("difficulty", "normal"), "route_id": journey.state_data.get("route_id")}


def validate_profile(audience: str, difficulty: str | None) -> dict:
    selected = difficulty or ("easy" if audience == "child" else "normal")
    if audience not in AUDIENCES or selected not in DIFFICULTIES:
        raise DomainError("PROFILE_INVALID", "人群或难度不受支持。", 422)
    return {"audience_mode": audience, "difficulty": selected}


def update_profile(db: Session, journey: UserStoryState, audience: str, difficulty: str | None) -> dict:
    previous = profile(journey)
    selected = validate_profile(audience, difficulty or previous["difficulty"])
    attempted = db.scalar(select(UserTaskState).where(UserTaskState.journey_id == journey.id, UserTaskState.attempts > 0).limit(1))
    optional_attempted = any(s.get("attempts", 0) > 0 for s in journey.state_data.get("activities", {}).values())
    if (attempted or optional_attempted) and previous["difficulty"] != selected["difficulty"]:
        raise DomainError("DIFFICULTY_LOCKED", "开始答题后难度固定，避免重复领取奖励；可在新旅程选择其他难度。", 409)
    data = copy.deepcopy(journey.state_data)
    data["profile"] = selected
    journey.state_data = data
    return {"ok": True}


def task_definition(task: Task, journey: UserStoryState) -> tuple[dict, dict]:
    selected = profile(journey)
    data, rule = copy.deepcopy(task.data), copy.deepcopy(task.validation)
    difficulty = selected["difficulty"]
    data.update(audienceMode=selected["audience_mode"], difficulty=difficulty,
                knowledgeScore=int(task.knowledge_score * {"easy": 0.75, "normal": 1, "advanced": 1.5}[difficulty]))
    if difficulty == "easy":
        data["briefing"] = data.get("briefing", "") + " 简单难度：先看点位介绍与线索，再作答。"
        options = data.get("options", [])
        if options and rule.get("answerKey"):
            correct = next((item for item in options if item["key"] == rule["answerKey"]), None)
            wrong = next((item for item in options if item["key"] != rule["answerKey"]), None)
            if correct and wrong:
                data["options"] = [item for item in options if item in (correct, wrong)]
    elif difficulty == "advanced":
        data["briefing"] = data.get("briefing", "") + " 深入难度：减少提示，结合已有资料自行回忆与推理。"
        if task.type in {"quiz", "observation", "combine"}:
            correct = next((item for item in data.get("options", []) if item["key"] == rule.get("answerKey")), None)
            if correct:
                data.update(type="password", answerMode="text", passwordHint="请输入正确选项的完整文字，不使用字母代号。")
                data.pop("options", None)
                rule["password"] = correct["text"]
        elif task.type == "sorting":
            size = len(data.get("sortingItems", []))
            data["sortingItems"] = list(reversed(data.get("sortingItems", [])))
            rule["sortingAnswer"] = [size - 1 - index for index in rule.get("sortingAnswer", [])]
        elif task.type == "password":
            data["passwordHint"] = "深入难度：请从已有线索中寻找答案。"
    return data, rule


def text_answer(value: str) -> str:
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", value)).casefold()


def agent_context(journey: UserStoryState) -> dict:
    selected = profile(journey)
    styles = {
        "child": "使用短句和常见词，给出一步一步的安全提示；不索取姓名、年龄或其他个人信息。",
        "student": "围绕来源和证据解释，给出适合研学的提问与简单推理。",
        "adult": "根据问题提供较完整背景，区分事实、争议与推测；允许轻松体验。",
    }
    return {**selected, "expression_instruction": styles[selected["audience_mode"]],
            "truthfulness_instruction": "所有人群保持同一证据约束，不因模式编造或弱化引用要求。"}
