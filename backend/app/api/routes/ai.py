from dataclasses import asdict
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.agents.npc import PROMPT_VERSION, AgentReply, refuse, respond
from app.ai.llm.providers import ChatProvider, EmbeddingProvider, ProviderError
from app.ai.rag.conversation import ConversationTurn, resolve_query
from app.ai.rag.index import approved_records
from app.ai.rag.retrieval import is_eligible, retrieve
from app.ai.safety.policy import POLICY_VERSION, input_risk, redact_log_text
from app.ai.settings import AISettings
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.rate_limit import check_rate
from app.models import Character, CulturalLocation, DialogueLog, SafetyLog, User
from app.services.journey import assert_npc_access, grant_item, mutate_journey, owned_journey
from app.services.session import get_current_user

router = APIRouter(prefix="/api", tags=["AI NPC"])


class ChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journey_id: str
    state_version: int = Field(ge=0)
    request_id: str | None = Field(default=None, max_length=80)
    npc_id: str
    message: str = Field(min_length=1, max_length=1000, validation_alias=AliasChoices("message", "text"))


def history_turn(log: DialogueLog) -> ConversationTurn:
    """Legacy logs can establish location only through their recorded citations."""
    spot_id = log.response.get("context_spot_id")
    if spot_id is None:
        spots = {entry.get("spotId") for entry in log.response.get("evidence", [])}
        spot_id = next(iter(spots)) if len(spots) == 1 else None
    context = log.response.get("query_context", {})
    ids = context.get("knowledge_ids", []) if context.get("mode") == "clarification" else log.evidence_ids
    return ConversationTurn(log.user_input, tuple(ids), spot_id)


@router.post("/chat/message")
def chat(body: ChatBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    journey = owned_journey(db, user, body.journey_id)
    question = body.message.strip()
    if not question:
        raise DomainError("INPUT_INVALID", "请输入问题。")
    check_rate("chat:" + user.id, 30)
    settings = AISettings.configured()

    def operation(j):
        npc = assert_npc_access(db, j, body.npc_id)
        records = approved_records(db, j.story_id)
        recent = list(reversed(db.scalars(select(DialogueLog).where(
            DialogueLog.journey_id == j.id, DialogueLog.npc_id == npc.id
        ).order_by(DialogueLog.created_at.desc(), DialogueLog.id.desc()).limit(3)).all()))
        turns = [history_turn(log) for log in recent]
        other_locations = tuple(db.scalars(select(CulturalLocation.name).where(
            CulturalLocation.story_id == j.story_id, CulturalLocation.id != j.current_location_id,
        )))
        query = resolve_query(question, records, turns, j.current_location_id, j.chapter, other_locations)
        retrieval_records = records
        if query.mode == "history":
            retrieval_records = [record for record in records if record.knowledge_id in query.knowledge_ids]
        # Never embed injection text or send it to a model.
        vector = None
        retrieval_reason = None
        can_retrieve = query.mode not in {"clarification", "unavailable"} and not input_risk(question)
        if can_retrieve and settings.embedding_provider != "none" and retrieval_records:
            try:
                vector = EmbeddingProvider(settings).embed([query.query])[0]
            except ProviderError as error:
                retrieval_reason = str(error)
        hits = []
        if can_retrieve:
            hits = retrieve(query.query, retrieval_records, {j.current_location_id}, j.chapter, vector, settings.embedding_model)
        role = db.get(Character, j.role_id)
        eligible_ids = {record.knowledge_id for record in records if is_eligible(record, {j.current_location_id}, j.chapter)}
        history = [{"user": log.user_input, "npc": log.response.get("dialogue", "")}
                   for log, turn in zip(recent, turns, strict=True)
                   if turn.spot_id == j.current_location_id and turn.knowledge_ids
                   and set(turn.knowledge_ids).issubset(eligible_ids) and not input_risk(turn.question)]
        if query.clarification:
            reply = AgentReply(query.clarification, "clarification", "calm", [], "none", "none", False,
                               "CONTEXT_AMBIGUOUS" if query.knowledge_ids else "CONTEXT_REQUIRED", [])
        elif query.mode == "unavailable":
            reply = refuse("CONTEXT_UNAVAILABLE")
        else:
            reply = respond(question, hits, npc.data | {"name": npc.name}, role.data,
                            {"state": j.state, "spot": j.current_location_id, "chapter": j.chapter,
                             "resolved_question": query.query}, history, ChatProvider(settings))
        approved = []
        # These fictional puzzle cues are authored business rules, independent of LLM facts/actions.
        clue_id = None
        if not input_risk(question):
            if npc.id == "zhou-bo" and j.current_location_id == "pingjiang" and "平江图" in question:
                clue_id = "clue-shaoding"
            if npc.id == "xiao-shen" and j.current_location_id == "subo" and any(word in question for word in ["片石", "白墙", "以壁为纸"]):
                clue_id = "clue-baibi"
        if clue_id and grant_item(db, j, clue_id, "authored-puzzle:" + npc.id):
            approved.append({"type": "grant_clue", "id": clue_id, "origin": "authored_rule"})
        # No model-proposed state actions are enabled in v1; task rewards remain in the task service.
        if reply.proposed_actions:
            db.add(SafetyLog(id=str(uuid4()), journey_id=j.id, risk_type="ACTION_REJECTED",
                             reason="模型建议不在当前动作白名单中", rule_version=POLICY_VERSION, result="blocked"))
        message_id = str(uuid4())
        evidence = [{"id": h.evidence.knowledge_id, "spotId": h.evidence.spot_id,
                     "type": h.evidence.content_type, "title": h.evidence.title, "content": h.evidence.content,
                     "source": h.evidence.source, "source_url": h.evidence.source_url,
                     "review_status": h.evidence.review_status} for h in hits if h.evidence.knowledge_id in reply.evidence_ids]
        dialogue = reply.dialogue
        if approved:
            dialogue += "\n（已发放演示剧情线索；该道具不代表文化资料已通过审核。）"
        result = asdict(reply)
        result.pop("proposed_actions")
        result.update(dialogue=dialogue, approved_actions=approved, evidence=evidence,
                      data_scope="reviewed_only", message_id=message_id + "-npc",
                      retrieval_mode="hybrid" if vector else "keyword", retrieval_reason=retrieval_reason,
                      context_spot_id=j.current_location_id,
                      query_context={"mode": query.mode, "knowledge_ids": list(query.knowledge_ids)})
        db.add(DialogueLog(id=message_id, journey_id=j.id, npc_id=npc.id, user_input=redact_log_text(question),
                           response=result, evidence_ids=reply.evidence_ids, approved_actions=approved,
                           provider=reply.provider, model=reply.model, prompt_version=PROMPT_VERSION))
        if reply.reason and reply.reason != "API_KEY_MISSING" and reply.intent != "clarification":
            db.add(SafetyLog(id=str(uuid4()), journey_id=j.id, risk_type=reply.reason,
                             reason="输入、证据或输出校验拒答", rule_version=POLICY_VERSION, result="refused"))
        if j.state in {"AT_SPOT", "DIALOGUE", "TASK_ACTIVE"}:
            j.state = "DIALOGUE"
        db.flush()
        return result

    return mutate_journey(db, journey, body.state_version, body.request_id,
                          "chat:" + body.npc_id, body.model_dump(), operation)


class FeedbackBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    journey_id: str
    npc_id: str
    message_id: str
    reason: str = Field(min_length=4, max_length=1000)


@router.post("/chat/feedback")
def feedback(body: FeedbackBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    journey = owned_journey(db, user, body.journey_id)
    log_id = body.message_id.removesuffix("-npc")
    log = db.get(DialogueLog, log_id)
    if log is None or log.journey_id != journey.id or log.npc_id != body.npc_id:
        raise DomainError("MESSAGE_NOT_FOUND", "消息不存在或不属于当前会话。", 404)
    log.feedback = redact_log_text(body.reason.strip())
    db.commit()
    return {"recorded": True}
