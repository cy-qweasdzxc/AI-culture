"""Conservative guards supplement, but do not replace, evidence/action validation."""

import re

REFUSAL = "现有资料无法确认这一内容。你可以继续探索相关点位，或查看已经审核的文化图鉴。"
POLICY_VERSION = "evidence-actions-v1"
_INJECTION = re.compile(
    r"ignore.{0,30}(instructions|prompt|rules)|system\s*prompt|jailbreak|"
    r"忽略.{0,20}(指令|规则|提示|设定)|系统提示词|开发者模式|直接.{0,10}(解锁|发放|改写)|"
    r"(?:^|[\r\n])\s*system\s*:.{0,50}(unrestricted|no restrictions|ignore rules)|"
    r"你不再受(?:任何)?限制.{0,20}(回答|服从|执行)|"
    r"(?:我是|我就是)管理员.{0,30}(跳过任务|直接解锁|发放全部)|"
    r"提前.{0,5}(给|告诉|输出|显示).{0,8}(最终)?结局|"
    r"伪造.{0,10}(证据|引用)|api[_ -]?key|<\|im_start\|>", re.IGNORECASE
)
_SENSITIVE = re.compile(
    r"\bsk-[A-Za-z0-9_-]{12,}\b|\bBearer\s+[A-Za-z0-9._-]{12,}|"
    r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|(?<!\d)1[3-9]\d{9}(?!\d)",
    re.IGNORECASE,
)


def redact_log_text(text: str) -> str:
    return _SENSITIVE.sub("[隐私内容已隐藏]", text)


def input_risk(text: str) -> str | None:
    if _INJECTION.search(text):
        return "PROMPT_INJECTION"
    if _SENSITIVE.search(text):
        return "PRIVACY_SENSITIVE"
    return None
