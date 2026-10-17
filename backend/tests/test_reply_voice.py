import json

import pytest

from app.ai.agents.npc import respond
from app.ai.llm.providers import ChatProvider, Generation
from app.ai.rag.retrieval import Evidence, retrieve
from app.ai.settings import AISettings

CONTENT = "《平江图》碑刻于南宋绍定二年（公元1229年），描绘了当时平江府城的街巷与河道布局，现存于苏州碑刻博物馆。"
CONTENT2 = "平江路历史街区延续了苏州古城水陆并行、河街相邻的双棋盘格局，是古城内保存较为完整的历史街区之一。"


def fixture(content=CONTENT, content_type="fact", title="《平江图》碑", suffix="0"):
    return Evidence(f"kn-pingjiangtu:{suffix}", "kn-pingjiangtu", "pingjiang", title, content,
                    content_type, "苏州碑刻博物馆公开介绍", "https://example.invalid/source",
                    "测试许可", "reviewed", 1)


def answer(question, records=None, history=(), npc_id="zhou-bo", role_id="apprentice"):
    records = records or [fixture()]
    hits = retrieve(question, records, {"pingjiang"}, 1)
    return respond(question, hits, {"id": npc_id, "name": "周伯"}, {"id": role_id, "name": "小满"},
                   {"state": "DIALOGUE", "spot": "pingjiang", "chapter": 1, "resolved_question": question},
                   list(history), ChatProvider(AISettings(provider="mock")))


def test_first_turn_is_addressed_and_no_longer_uses_the_fixed_template():
    result = answer("平江图碑是什么年代的？")
    assert result.reason is None and result.grounding_mode == "verified_excerpt"
    assert result.dialogue.startswith("小满，")
    assert "资料中这样记载" not in result.dialogue
    assert CONTENT in result.dialogue and "（史实）" in result.dialogue


def test_player_address_comes_from_the_role():
    scholar = answer("平江图碑是什么年代的？", role_id="scholar")
    wanderer = answer("平江图碑是什么年代的？", role_id="wanderer")
    assert scholar.dialogue.startswith("先生，")
    assert not wanderer.dialogue.startswith(("先生，", "小满，"))


def test_questions_get_different_frames():
    frames = {
        answer(question).dialogue.splitlines()[0]
        for question in (
            "平江图碑是什么年代的？",
            "平江图碑现在在哪里？",
            "平江图碑上画了什么？",
            "再讲讲平江图碑",
        )
    }
    assert len(frames) >= 2


def test_a_repeated_question_does_not_repeat_the_previous_frame():
    first = answer("平江图碑是什么年代的？")
    second = answer("平江图碑是什么年代的？", history=[{"user": "旧问题", "npc": first.dialogue}])
    assert second.dialogue.splitlines()[0] != first.dialogue.splitlines()[0]


def test_multiple_excerpts_are_both_quoted_and_labelled():
    result = answer("平江路和《平江图》碑有什么关系？", records=[fixture(), fixture(CONTENT2, title="双棋盘格局", suffix="1")])
    assert CONTENT in result.dialogue and CONTENT2 in result.dialogue
    assert result.dialogue.count("（史实）") == 2
    assert result.evidence_ids == ["kn-pingjiangtu"]


def test_clause_like_titles_are_not_echoed_as_a_name():
    record = fixture(CONTENT2, title="水陆并行、河街相邻")
    result = answer("双棋盘格局", records=[record])
    assert "水陆并行" not in result.dialogue.splitlines()[0]


@pytest.mark.parametrize(("content_type", "label"), [
    ("disputed", "争议观点"),
    ("legend", "民间传说"),
    ("fiction", "艺术化虚构"),
])
def test_every_content_type_keeps_its_visible_label(content_type, label):
    record = fixture(content="这是一条用于标签测试的合成资料。", content_type=content_type)
    result = answer("平江图碑", records=[record])
    assert f"（{label}）" in result.dialogue


def test_sentences_from_one_source_share_one_label_and_a_natural_transition(monkeypatch):
    yuxiang = Evidence("kn-yuxiang:0", "kn-yuxiang", "pingjiang", "《雨巷》与丁香巷",
                       "戴望舒《雨巷》的原型是否为苏州丁香巷，历来有多种说法，并无定论。"
                       "此说多为后人附会，宜作文学趣谈看待。",
                       "disputed", "现代文学研究公开讨论", "https://example.invalid/yuxiang",
                       "测试许可", "reviewed", 1)
    naming = Evidence("kn-dingxiang-ming:0", "kn-dingxiang-ming", "pingjiang", "丁香巷的得名",
                      "丁香巷西起平江路、东至仓街，因巷内有多棵丁香树而得名。",
                      "fact", "苏州市文化广电和旅游局平江古巷专题",
                      "https://example.invalid/dingxiang", "测试许可", "reviewed", 1)
    raw = {
        "dialogue": "戴望舒的《雨巷》写的可是丁香巷？",
        "intent": "culture",
        "evidence_ids": ["kn-yuxiang", "kn-dingxiang-ming"],
        "evidence_quotes": [
            {"evidence_id": "kn-yuxiang",
             "quote": "戴望舒《雨巷》的原型是否为苏州丁香巷，历来有多种说法，并无定论。"},
            {"evidence_id": "kn-yuxiang", "quote": "此说多为后人附会，宜作文学趣谈看待。"},
            {"evidence_id": "kn-dingxiang-ming",
             "quote": "丁香巷西起平江路、东至仓街，因巷内有多棵丁香树而得名。"},
        ],
    }
    monkeypatch.setattr(ChatProvider, "generate",
                        lambda *args: Generation(json.dumps(raw, ensure_ascii=False), "fixture", "fixture", True))
    question = "丁香巷的名字和《雨巷》有关系吗？"
    result = respond(question, retrieve(question, [yuxiang, naming], {"pingjiang"}, 1),
                     {"id": "zhou-bo", "name": "周伯"}, {"id": "apprentice", "name": "小满"},
                     {"state": "DIALOGUE", "spot": "pingjiang", "chapter": 1,
                      "resolved_question": question},
                     [], ChatProvider(AISettings(provider="mock")))
    assert "还有一条" not in result.dialogue
    assert result.dialogue.count("（争议观点）") == 1
    assert result.dialogue.count("（史实）") == 1
    assert "戴望舒《雨巷》的原型" in result.dialogue
    assert "宜作文学趣谈看待" in result.dialogue
    assert "因巷内有多棵丁香树而得名" in result.dialogue
    assert any(phrase in result.dialogue for phrase in
               ("争议归争议", "说法虽有分歧", "争议先放一边"))
