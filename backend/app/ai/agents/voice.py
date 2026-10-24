"""Conversational framing for verified NPC answers.

The factual body of every answer stays verbatim source text. Only the voice
around it is authored here: an in-character opener, an attribution line and an
optional closing. This keeps the display safe (no model prose is shown) while
giving each character a recognizable, non-repeating way of speaking.
"""

from __future__ import annotations

import hashlib

TYPE_LABELS = {"fact": "史实", "disputed": "争议观点", "legend": "民间传说", "fiction": "艺术化虚构"}

PLAYER_ADDRESS = {"scholar": "先生，", "apprentice": "小满，", "wanderer": ""}

VOICES = {
    "zhou-bo": {
        "openers": (
            "{addr}你问{title}啊？",
            "哦，{title}？这倒是个好题目。",
            "说起{title}，我倒想起些旧话。",
            "你算问着了。{title}这事，我晓得一些。",
            "来，坐下。{title}的事，慢慢说。",
            "{addr}你问得细。{title}嘛——",
            "{addr}坐下听，我慢慢讲。",
        ),
        "multi_openers": (
            "{addr}你问的这几样，都有讲究。",
            "这几条啊，得一条一条说。",
            "你问的这几件事，我倒都听过些。",
        ),
        "attributions": (
            "老资料上是这么记的：",
            "书上写得明白：",
            "我常听人念起这一段：",
            "资料里有一句，你记着：",
        ),
        "source_leads": (
            "老资料上记得明白。",
            "书上有这么一段。",
            "我常听人念起这一段。",
            "资料里有一句，你记着。",
        ),
        "closers": (
            "你还想听哪一段？",
            "要不要坐下再聊会儿？",
            "你慢慢逛，慢慢看。",
            "老苏州的事，说起来就没个完。",
        ),
    },
    "a-heng": {
        "openers": (
            "{addr}你问{title}。",
            "嗯，{title}。",
            "这个可以讲。",
            "{addr}这个我记得。",
            "{title}？坐下说。",
            "问得对。{title}是件正经事。",
        ),
        "multi_openers": (
            "几件事，一件件说。",
            "你问的这几条，我分开讲。",
            "好，一件一件来。",
        ),
        "attributions": (
            "资料上写着：",
            "旧籍里有一句：",
            "这一条，资料里写得清楚：",
        ),
        "source_leads": (
            "资料上写着一段。",
            "旧籍里有这么一句。",
            "这一条，资料里写得清楚。",
        ),
        "closers": (
            "还有哪处不明白？",
            "先这样。",
            "想细看什么，再问。",
            "园子里的门道，急不来。",
        ),
    },
    "xiao-shen": {
        "openers": (
            "{addr}问的是{title}，这个可以讲清楚。",
            "好，我先说{title}。",
            "这个问题，资料里有明确记载。",
            "{title}这条，我把出处一并给你。",
            "{addr}稍等……嗯，资料在这里。",
            "{addr}问得好，我照着资料说。",
        ),
        "multi_openers": (
            "这几个问题，我分开说。",
            "你问的几条，资料里都有出处。",
            "好，我一条一条讲清楚。",
        ),
        "attributions": (
            "公开记录是这么写的：",
            "原文如下：",
            "馆藏资料写得很清楚：",
        ),
        "source_leads": (
            "公开记录里有这么一段。",
            "原文是这样。",
            "馆藏资料写得很清楚。",
        ),
        "closers": (
            "还想核对哪一条？",
            "需要出处的话，我再给你找。",
            "这样解释，清楚吗？",
            "这条资料就到这里。",
        ),
    },
}

DEFAULT_VOICE = {
    "openers": (
        "{addr}你问{title}？",
        "这个嘛，资料里有记载。",
        "让我想想……嗯，找到了。",
    ),
    "multi_openers": (
        "你问的这几条，我一条条说。",
        "好，分几条讲。",
    ),
    "attributions": (
        "资料上写着：",
        "原文是：",
        "记录如下：",
    ),
    "source_leads": (
        "资料上是这么说的。",
        "原文是这样。",
        "记录里有这一条。",
    ),
    "closers": (
        "你还想细问哪一点？",
        "先这样。",
        "想起什么再问。",
    ),
}

_TRANSITIONS = {
    ("disputed", "fact"): (
        "争议归争议，{title}倒是有记载的：",
        "说法虽有分歧，{title}本身倒清楚：",
        "争议先放一边，{title}倒是有据可查的：",
    ),
    ("legend", "fact"): (
        "传说归传说，{title}本身倒是有记载的：",
        "撇开传闻，{title}倒是查得到的：",
        "故事归故事，{title}另有记载：",
    ),
    ("fact", "disputed"): (
        "不过说到{title}，还有一桩没有定论的：",
        "另外，{title}历来就有争议：",
        "至于{title}，说法就不那么一致了：",
    ),
    ("fact", "legend"): (
        "至于{title}，民间还另有一种讲法：",
        "另外，{title}还有一段传说：",
        "说到{title}，老辈人另有讲法：",
    ),
    ("disputed", "legend"): (
        "除了争议，民间还传着一种说法：",
        "争议之外，{title}还有一段传说：",
    ),
    ("legend", "disputed"): (
        "传说之外，{title}本身也有争议：",
        "另外，{title}也没有定论：",
    ),
    ("fact", "fact"): (
        "另外，{title}也值得记一笔：",
        "说到{title}，资料里还有一段：",
        "至于{title}，是另一条记载：",
    ),
    ("disputed", "disputed"): (
        "同一件事，资料里还记着另一种说法：",
        "关于{title}，说法不止一种：",
        "这桩事，历来还有别的讲法：",
    ),
    ("legend", "legend"): (
        "民间还传着另一种说法：",
        "关于{title}，老辈人还有别的讲法：",
        "另有一段传闻，你只当故事听：",
    ),
    ("fiction", "fiction"): (
        "故事里还补了一段：",
        "关于{title}，剧情里还有一层：",
    ),
}

_GENERIC_TRANSITIONS = {
    "fact": (
        "另外，{title}也值得记一笔：",
        "说到{title}，资料里还有一段：",
    ),
    "disputed": (
        "关于{title}，说法不止一种：",
        "这桩事，历来还有别的讲法：",
    ),
    "legend": (
        "民间还传着一种说法：",
        "关于{title}，老辈人另有讲法：",
    ),
    "fiction": (
        "故事里还补了一段：",
        "关于{title}，剧情里还有一层：",
    ),
}

_TRANSITION_FALLBACK = "另外，资料里还记着一段："

_TYPE_CLOSERS = {
    "fact": (
        "大概就是这些。",
        "资料上写得清楚，我也不多添了。",
        "这条有出处，你回头自己核也行。",
        "别的我也不多说了。",
    ),
    "disputed": (
        "这种事，听听就好，别急着下结论。",
        "我也说不出个准话。",
        "你要真感兴趣，回头再找人问问。",
        "当个谈资吧。",
    ),
    "legend": (
        "都是老辈人传下来的，当个故事听。",
        "这种话，信一半就够了。",
        "传说归传说，你别当真。",
        "老辈人怎么讲，我就怎么学。",
    ),
    "fiction": (
        "这是戏里的说法，跟真事分开看。",
        "剧情需要，别当成史料。",
        "故事里的安排，听听就好。",
    ),
}

_MIXED_CLOSERS = (
    "几样放在一起看，哪些是实、哪些是虚，就明白了。",
    "有实有虚，你自己掂量。",
    "话就说到这儿，你再琢磨琢磨。",
    "先这样，想起什么再问。",
)

_TOPIC_SUFFIXES = ("园", "碑", "馆", "楼", "堂", "亭", "塔", "巷", "桥", "山", "林",
                   "门", "寺", "庙", "宅", "轩", "斋", "廊", "墙", "井", "坊", "址", "匾")


def _topic_label(title: str) -> str:
    """Only echo titles that read like a name, not a whole clause or concept phrase."""
    title = title.strip()
    if not title or len(title) > 12 or title.startswith(("列入", "关于")):
        return "这个"
    if any(mark in title for mark in "、，。；：!?！？（）"):
        return "这个"
    return title if title.startswith("《") or title.endswith(_TOPIC_SUFFIXES) else "这个"


def _transition_topic(title: str) -> str:
    """Transitions can name a descriptive topic ("丁香巷的得名") more often than openers."""
    title = title.strip()
    if not title or len(title) > 16 or title.startswith(("列入", "关于")):
        return "这件事"
    if any(mark in title for mark in "、，。；：!?！？（）「」“”\""):
        return "这件事"
    return title


def _quote_groups(excerpts: list[dict[str, str]]) -> list[dict]:
    """Group consecutive sentences from one source under a single citation label."""
    groups: list[dict] = []
    for excerpt in excerpts:
        key = (excerpt.get("evidence_id", ""), excerpt.get("title", ""), excerpt.get("type", ""))
        if groups and groups[-1]["key"] == key:
            groups[-1]["quotes"].append(excerpt["quote"])
        else:
            groups.append({"key": key, "type": excerpt.get("type", ""),
                           "title": excerpt.get("title", ""), "quotes": [excerpt["quote"]]})
    return groups


def _transition(prev_type: str, cur_type: str, title: str, seed: str, index: int,
                previous: str) -> str:
    templates = _TRANSITIONS.get((prev_type, cur_type)) or _GENERIC_TRANSITIONS.get(cur_type, ())
    if not templates:
        return _TRANSITION_FALLBACK
    fmt = {"title": _transition_topic(title)}
    options = tuple(template.format(**fmt) for template in templates)
    return _pick(options, seed, f"transition-{index}", previous, True)


def _closer(voice: dict, groups: list[dict], seed: str, previous: str) -> str:
    """End on the content type when there is one, otherwise on the character's own voice."""
    types = {group["type"] for group in groups}
    if len(types) > 1:
        pool = _MIXED_CLOSERS
    else:
        pool = _TYPE_CLOSERS.get(next(iter(types), ""), ())
    return _pick(tuple(pool) + tuple(voice["closers"]), seed, "closer", previous)


def player_address(role: dict) -> str:
    return PLAYER_ADDRESS.get(str(role.get("id", "")), "")


def voice_for(npc: dict) -> dict:
    return VOICES.get(str(npc.get("id", "")), DEFAULT_VOICE)


def _pick(options: tuple[str, ...], seed: str, salt: str, previous: str = "",
          at_start: bool = False) -> str:
    """Deterministically vary the frame; avoid repeating the previous turn in the same slot."""
    choices = list(dict.fromkeys(option for option in options if option))
    if not choices:
        return ""
    digest = hashlib.sha256(f"{seed}|{salt}".encode()).digest()
    start = int.from_bytes(digest[:4], "big") % len(choices)
    for offset in range(len(choices)):
        candidate = choices[(start + offset) % len(choices)]
        repeated = previous.startswith(candidate) if at_start else previous.rstrip().endswith(candidate)
        if not repeated:
            return candidate
    return choices[start]


def compose_reply(npc: dict, role: dict, question: str, context: dict,
                  history: list[dict[str, str]], excerpts: list[dict[str, str]],
                  emotion: str) -> str:
    """Wrap verbatim excerpts in a varied, in-character conversational frame."""
    if not excerpts:
        return ""
    voice = voice_for(npc)
    address = player_address(role)
    groups = _quote_groups(excerpts)
    if context.get("audience_mode") == "child":
        quotes = [f'“{quote}”（{TYPE_LABELS.get(group["type"], "资料")}）' for group in groups for quote in group["quotes"]]
        return "\n".join(["一起看看资料：", *quotes, "实地游览请跟随监护人，留意脚下与水边安全。"])
    topic = _topic_label(next((row.get("title") or "" for row in excerpts), ""))
    seed = "|".join((
        str(npc.get("id", "")), str(role.get("id", "")), question,
        str(context.get("resolved_question", "")), str(len(history)), emotion,
        ",".join(row.get("quote", "") for row in excerpts),
    ))
    previous = str(history[-1].get("npc", "")) if history else ""
    fmt = {"addr": address, "title": topic}
    openers = voice["multi_openers"] if len(groups) > 1 else voice["openers"]
    if address:
        # Greet by name on the first turn, but do not repeat the name in every reply.
        if not history:
            openers = tuple(template for template in openers if "{addr}" in template) or openers
        else:
            openers = tuple(template for template in openers if "{addr}" not in template) or openers
    opener = _pick(tuple(template.format(**fmt) for template in openers), seed, "opener", previous, True)
    attributions = voice["attributions"]
    if len(groups[0]["quotes"]) > 1:
        # "资料里有一句" is wrong when the source contributes more than one sentence.
        attributions = tuple(template for template in attributions if "一句" not in template) or attributions
    attribution = _pick(tuple(template.format(**fmt) for template in attributions), seed, "attribution")
    closer = _closer(voice, groups, seed, previous)

    layouts = ("frame", "source_first", "quote_only") if history else ("frame",)
    layout = layouts[int.from_bytes(hashlib.sha256(f"{seed}|layout".encode()).digest()[:4], "big") % len(layouts)]
    if layout == "source_first":
        # Put the citation first, then turn to the player.
        source_lead = _pick(voice["source_leads"], seed, "source-lead")
        lines = [source_lead, opener]
    elif layout == "quote_only":
        # Not every turn needs an explicit "the records say"; the quote label still marks the source.
        lines = [opener]
    else:
        lines = [opener, attribution]
    previous_transition = ""
    for index, group in enumerate(groups):
        if index:
            previous_transition = _transition(
                groups[index - 1]["type"], group["type"], group["title"], seed, index,
                previous_transition,
            )
            lines.append(previous_transition)
        label = TYPE_LABELS.get(group["type"], "")
        for position, quote in enumerate(group["quotes"]):
            suffix = f"（{label}）" if label and position == len(group["quotes"]) - 1 else ""
            lines.append(f"“{quote}”{suffix}")
    if closer:
        lines.append(closer)
    return "\n".join(line for line in lines if line)
