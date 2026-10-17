"""Bounded, local query rewriting using currently eligible cited subjects.

History supplies subject names, never facts or cached evidence text. No extra model call
is needed, and uncertain references are clarified instead of silently guessed.
"""

import re
from dataclasses import dataclass
from typing import Literal

from app.ai.rag.retrieval import Evidence, clean_text, is_eligible
from app.ai.safety.policy import input_risk

_FOLLOWUP = re.compile(
    r"它|其(?:中|实物|历史|来历)|[这那](?:里|儿|边|个|座|幅|块|处|些)|两者|二者|刚才|上面|前面|前者|后者|"
    r"第[一二三四1234](?:个|条|项)|"
    r"^(?:那|所以)?(?:现在|后来|然后|什么时候|何时|继续|再讲|再说|还有呢|"
    r"能再|可以再|详细一点|详细讲|多讲|为什么[？?呢。]*$)|"
    r"\b(?:it|its|they|their|there|that|those|former|latter)\b|"
    r"^tell me more",
    re.IGNORECASE,
)
_PLURAL = re.compile(r"它们|这些|那些|两者|二者|都|\b(?:they|their|those|both)\b", re.IGNORECASE)
_ORDINAL = re.compile(r"第([一二三四1234])(?:个|条|项)|前者|后者|\b(?:former|latter)\b", re.IGNORECASE)


@dataclass(frozen=True)
class ConversationTurn:
    question: str
    knowledge_ids: tuple[str, ...]
    spot_id: str | None


@dataclass(frozen=True)
class QueryContext:
    query: str
    mode: Literal["standalone", "history", "clarification", "unavailable"] = "standalone"
    knowledge_ids: tuple[str, ...] = ()
    clarification: str | None = None


def _mentions_title(question: str, title: str) -> bool:
    # Quoted book names also match when a title adds a suffix such as “碑”.
    names = [title, *re.findall(r"《([^》]+)》", title)]
    return any(len(name) >= 2 and name.casefold() in question.casefold() for name in names)


def resolve_query(question: str, records: list[Evidence], history: list[ConversationTurn],
                  spot_id: str, chapter: int, other_location_names: tuple[str, ...] = ()) -> QueryContext:
    """Only bind follow-ups to the most recent turn, within the current access scope."""
    original = QueryContext(question)
    if input_risk(question) or not _FOLLOWUP.search(question):
        return original
    eligible = {record.knowledge_id: record for record in records if is_eligible(record, {spot_id}, chapter)}
    # An explicitly named topic takes precedence over anaphora. Unknown quoted topics
    # must also remain standalone, rather than inherit the previous subject.
    if (re.search(r"《[^》]+》", question)
            or any(name in question for name in other_location_names)
            or any(_mentions_title(question, e.title) for e in eligible.values())):
        return original
    previous = history[-1] if history else None
    if previous is None or previous.spot_id != spot_id or input_risk(previous.question):
        return QueryContext(question, "clarification", clarification="你想了解哪一处或哪件事？可以告诉我它的名字吗？")
    candidates = tuple(dict.fromkeys(previous.knowledge_ids))[:4]
    # Do not silently reinterpret an ordinal after an old option was withdrawn.
    if not candidates or any(key not in eligible or input_risk(eligible[key].title) for key in candidates):
        return QueryContext(question, "unavailable")

    selected = candidates
    ordinal = _ORDINAL.search(question)
    if ordinal:
        marker = ordinal.group(0).lower()
        number = ordinal.group(1)
        if number:
            index = int(number) - 1 if number.isdigit() else "一二三四".index(number)
        else:
            index = len(candidates) - 1 if marker in {"后者", "latter"} else 0
        if 0 <= index < len(candidates):
            selected = (candidates[index],)
        else:
            selected = ()
    if not selected or (len(selected) > 1 and not _PLURAL.search(question)):
        options = "；".join(f"{i + 1}. {eligible[key].title}" for i, key in enumerate(candidates))
        return QueryContext(question, "clarification", candidates, f"你指的是哪一项：{options}？告诉我名字或序号，我再接着讲。")
    titles = "、".join(eligible[key].title for key in selected)
    # Preserve the complete original question (including dates and qualifiers).
    return QueryContext(clean_text(f"{titles}：{question}"), "history", selected)
