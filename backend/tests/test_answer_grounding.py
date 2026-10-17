import json

import pytest

from app.ai.agents.npc import respond
from app.ai.llm.providers import ChatProvider, Generation
from app.ai.rag.retrieval import Evidence, retrieve
from app.ai.settings import AISettings

SOURCE = "合成碑刻于1229年，现存于合成旧馆。这是自有虚构测试资料。"


def answer(monkeypatch, **reply):
    evidence = Evidence("fixture:0", "fixture", "pingjiang", "合成碑", SOURCE, "fiction",
                        "合成来源", "https://example.invalid/source", "测试许可", "reviewed", 1)
    raw = {"dialogue": "刻于1888年，收藏在大英博物馆。", "intent": "culture", "evidence_ids": ["fixture"]} | reply
    monkeypatch.setattr(ChatProvider, "generate", lambda *args: Generation(json.dumps(raw), "mock", "fixture", True))
    return respond("合成碑", retrieve("合成碑", [evidence], {"pingjiang"}, 1), {}, {}, {}, [], ChatProvider(AISettings()))


def test_valid_id_cannot_display_fabricated_date_or_museum(monkeypatch):
    result = answer(monkeypatch)
    assert "1888" not in result.dialogue and "大英博物馆" not in result.dialogue
    assert SOURCE in result.dialogue and result.grounding_mode == "source_fallback"


def test_valid_complete_sentence_is_displayed_without_unverified_prose(monkeypatch):
    quote = "合成碑刻于1229年，现存于合成旧馆。"
    result = answer(monkeypatch, evidence_quotes=[{"evidence_id": "fixture", "quote": quote}])
    assert result.reason is None and result.grounding_mode == "verified_excerpt"
    assert quote in result.dialogue and "大英博物馆" not in result.dialogue
    assert "自有虚构测试资料" not in result.dialogue


@pytest.mark.parametrize("quote,key", [
    ("合成碑刻于1888年，现存于大英博物馆。", "fixture"),
    ("1229年，现存于合成旧馆。", "fixture"),
    ("合成碑刻于1229年，现存于合成旧馆。", "uncited"),
])
def test_fabricated_partial_or_uncited_excerpts_are_refused(monkeypatch, quote, key):
    result = answer(monkeypatch, evidence_quotes=[{"evidence_id": key, "quote": quote}])
    assert result.reason == "EVIDENCE_TEXT_INVALID" and result.evidence_ids == []


def test_a_negation_cannot_be_removed_by_quoting_a_sentence_fragment():
    from app.ai.rag.grounding import verified_sentence_excerpt

    assert not verified_sentence_excerpt("碑刻于1888年。", "这不代表碑刻于1888年。")
    assert verified_sentence_excerpt("这不代表碑刻于1888年。", "这不代表碑刻于1888年。")
