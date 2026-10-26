import hmac
import time
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.ai.llm.providers import EmbeddingProvider, ProviderError
from app.ai.rag.index import approved_records, has_human_review, rebuild_knowledge, reviewable_source
from app.ai.rag.retrieval import RETRIEVAL_CONFIG, clean_text, fingerprint, retrieve_knowledge
from app.ai.safety.policy import redact_log_text
from app.ai.settings import AISettings
from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.rate_limit import check_rate
from app.models import (
    Character,
    CulturalKnowledge,
    CulturalLocation,
    DialogueLog,
    KnowledgeChunk,
    SafetyLog,
    Story,
    StoryNode,
    Task,
    TestCase,
    UserStoryState,
    utcnow,
)
from app.services.knowledge import provenance

router = APIRouter(prefix="/api/admin", tags=["administration"])
COOKIE = "citystory_admin"


def require_admin_config() -> None:
    settings = get_settings()
    if (not settings.admin_password or len(settings.admin_jwt_secret) < 32
            or "change" in settings.admin_jwt_secret or settings.admin_jwt_secret.startswith("development-")):
        raise DomainError("ADMIN_NOT_CONFIGURED", "请在服务端配置管理员密码和私密JWT签名密钥。", 503)


def authenticated(request: Request) -> str:
    require_admin_config()
    token = request.cookies.get(COOKIE)
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[7:]
    try:
        claims = jwt.decode(token or "", get_settings().admin_jwt_secret, algorithms=["HS256"],
                            options={"require": ["exp", "sub", "role"]})
        if claims["role"] != "admin" or claims["sub"] != get_settings().admin_username:
            raise ValueError("invalid role")
        return claims["sub"]
    except (jwt.PyJWTError, ValueError):
        raise DomainError("ADMIN_UNAUTHORIZED", "需要管理员登录。", 401) from None


def audit(db: Session, actor: str, action: str, target: str) -> None:
    db.add(SafetyLog(id=str(uuid4()), risk_type="ADMIN_ACTION", reason=f"{actor}:{action}:{target}",
                     rule_version="admin-v1", result="recorded"))


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(StrictBody):
    username: str = Field(max_length=80)
    password: str = Field(max_length=256)


@router.post("/login")
def login(body: Login, request: Request, response: Response):
    check_rate("admin-login:" + (request.client.host if request.client else "unknown"), 10)
    settings = get_settings()
    require_admin_config()
    if not (hmac.compare_digest(body.username.encode("utf-8"), settings.admin_username.encode("utf-8"))
            and hmac.compare_digest(body.password.encode("utf-8"), settings.admin_password.encode("utf-8"))):
        raise DomainError("ADMIN_UNAUTHORIZED", "管理员账号或密码不正确。", 401)
    token = jwt.encode({"sub": body.username, "role": "admin", "iat": datetime.now(UTC),
                        "exp": datetime.now(UTC) + timedelta(hours=2)}, settings.admin_jwt_secret, algorithm="HS256")
    response.set_cookie(COOKIE, token, httponly=True, secure=settings.cookie_secure,
                        samesite="strict", max_age=7200, path="/api/admin")
    return {"username": body.username, "expiresIn": 7200}


@router.get("/me")
def me(actor: str = Depends(authenticated)):
    return {"username": actor}


@router.post("/logout")
def logout(response: Response, actor: str = Depends(authenticated)):
    response.delete_cookie(COOKIE, path="/api/admin")
    return {"loggedOut": True}


def knowledge_dto(k: CulturalKnowledge) -> dict:
    return {"id": k.id, "story_id": k.story_id, "location_id": k.location_id, "title": k.title,
            "content": k.content, "content_type": k.content_type, "source": k.source,
            "source_url": k.source_url, "license": k.license, "review_status": k.review_status,
            "reviewer": k.reviewer, "reviewed_at": k.reviewed_at.isoformat() if k.reviewed_at else None,
            "version": k.version, "is_demo": k.is_demo, "trust_level": k.trust_level,
            "tags": k.tags, "metadata": k.metadata_json, **provenance(k)}


class KnowledgeBody(StrictBody):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,89}$")
    story_id: str = "suzhou-pingjiang"
    location_id: str
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=30000)
    content_type: Literal["fact", "disputed", "legend", "fiction"]
    source: str = Field(min_length=1, max_length=1000)
    source_url: str = Field(default="", max_length=2000)
    license: str = Field(min_length=1, max_length=1000)
    tags: list[str] = Field(default_factory=list, max_length=30)
    min_chapter: int = Field(default=1, ge=1, le=100)


class KnowledgeEdit(KnowledgeBody):
    version: int = Field(ge=1)


def validate_knowledge(body: KnowledgeBody, db: Session) -> None:
    spot = db.get(CulturalLocation, body.location_id)
    if db.get(Story, body.story_id) is None or spot is None or spot.story_id != body.story_id:
        raise DomainError("LOCATION_INVALID", "主题和文化点位不匹配。")
    digest = fingerprint(body.content)
    if any(k.id != body.id and fingerprint(k.content) == digest for k in db.scalars(select(CulturalKnowledge))):
        raise DomainError("KNOWLEDGE_DUPLICATE", "已有相同的文化正文，请编辑现有条目。", 409)


def assign_knowledge(k: CulturalKnowledge, body: KnowledgeBody) -> None:
    for field in ("story_id", "location_id", "title", "content_type", "source", "source_url", "license", "tags"):
        setattr(k, field, getattr(body, field))
    k.content = clean_text(body.content)
    k.metadata_json = {"min_chapter": body.min_chapter, "sha256": fingerprint(body.content)}


def claim_content_version(db: Session, k: CulturalKnowledge, version: int) -> None:
    claimed = db.execute(update(CulturalKnowledge).where(
        CulturalKnowledge.id == k.id, CulturalKnowledge.version == version
    ).values(version=version + 1).execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        db.rollback()
        raise DomainError("CONTENT_CONFLICT", "资料版本已更新，请刷新后重试。", 409)
    set_committed_value(k, "version", version + 1)


@router.get("/knowledge")
def list_knowledge(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    return {"items": [knowledge_dto(k) for k in db.scalars(select(CulturalKnowledge).order_by(CulturalKnowledge.id))]}


@router.post("/knowledge", status_code=201)
def create_knowledge(body: KnowledgeBody, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    if db.get(CulturalKnowledge, body.id):
        raise DomainError("KNOWLEDGE_EXISTS", "条目ID已经存在。", 409)
    validate_knowledge(body, db)
    k = CulturalKnowledge(id=body.id, review_status="pending", is_demo=False, version=1)
    assign_knowledge(k, body)
    db.add(k)
    audit(db, actor, "create", k.id)
    db.commit()
    return knowledge_dto(k)


@router.put("/knowledge/{knowledge_id}")
def edit_knowledge(knowledge_id: str, body: KnowledgeEdit, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    k = db.scalar(select(CulturalKnowledge).where(CulturalKnowledge.id == knowledge_id).with_for_update())
    if k is None:
        raise DomainError("KNOWLEDGE_NOT_FOUND", "资料不存在。", 404)
    if body.id != knowledge_id or k.version != body.version:
        raise DomainError("CONTENT_CONFLICT", "资料版本已更新，请刷新后重试。", 409)
    validate_knowledge(body, db)
    claim_content_version(db, k, body.version)
    assign_knowledge(k, body)
    k.review_status, k.reviewer, k.reviewed_at, k.trust_level = "pending", None, None, "unverified"
    # Retrieval always joins current reviewed version, so revoked chunks cannot be used.
    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == k.id))
    audit(db, actor, "edit-reset-review", k.id)
    db.commit()
    return knowledge_dto(k)


class ReviewBody(StrictBody):
    version: int = Field(ge=1)
    status: Literal["reviewed", "rejected", "pending"]
    reviewer: str = Field(min_length=2, max_length=120)
    confirm_sources: bool = False

    @field_validator("reviewer")
    @classmethod
    def named_reviewer(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2 or value == "system-auto-publish" or any(marker in value for marker in ("待确认", "待补充")):
            raise ValueError("REVIEWER_REQUIRED")
        return value


@router.post("/knowledge/{knowledge_id}/review")
def review_knowledge(knowledge_id: str, body: ReviewBody, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    k = db.scalar(select(CulturalKnowledge).where(CulturalKnowledge.id == knowledge_id).with_for_update())
    if k is None:
        raise DomainError("KNOWLEDGE_NOT_FOUND", "资料不存在。", 404)
    if k.version != body.version:
        raise DomainError("CONTENT_CONFLICT", "资料版本已更新。", 409)
    if body.status == "reviewed":
        if not body.confirm_sources or not reviewable_source(k):
            raise DomainError("SOURCE_REVIEW_REQUIRED", "审核人员须核对来源URL和授权说明，并明确确认。", 409)
    claim_content_version(db, k, body.version)
    if body.status == "reviewed":
        k.is_demo = False
        k.trust_level = "human_reviewed"
    else:
        k.trust_level = "unverified"
    k.review_status = body.status
    k.reviewer, k.reviewed_at = body.reviewer, utcnow()
    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == k.id))
    audit(db, actor, "review:" + body.status, k.id)
    db.commit()
    return knowledge_dto(k)


@router.post("/knowledge/{knowledge_id}/publish")
def publish_knowledge(knowledge_id: str, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    k = db.scalar(select(CulturalKnowledge).where(CulturalKnowledge.id == knowledge_id).with_for_update())
    if k is None:
        raise DomainError("KNOWLEDGE_NOT_FOUND", "资料不存在。", 404)
    if not has_human_review(k):
        raise DomainError("KNOWLEDGE_UNREVIEWED", "资料须经人工审核并记录有效审核人后才能发布正式检索索引。", 409)
    # A conditional write acquires the writer lock on SQLite too. Concurrent edit/
    # revoke cannot race publication; the approval/version predicates must still hold.
    claimed = db.execute(update(CulturalKnowledge).where(
        CulturalKnowledge.id == k.id, CulturalKnowledge.version == k.version,
        CulturalKnowledge.review_status == "reviewed", CulturalKnowledge.is_demo.is_(False),
        CulturalKnowledge.trust_level == "human_reviewed",
    ).values(version=CulturalKnowledge.version).execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        db.rollback()
        raise DomainError("CONTENT_CONFLICT", "资料版本或审核状态已更新，请刷新后重试。", 409)
    try:
        count = rebuild_knowledge(db, k, AISettings.configured())
    except ProviderError:
        raise DomainError("EMBEDDING_UNAVAILABLE", "向量模型未配置或调用失败，索引未发布。", 503) from None
    audit(db, actor, "publish", k.id)
    db.commit()
    return {"id": k.id, "chunks": count, "embeddingProvider": get_settings().embedding_provider}


class RetrievalBody(StrictBody):
    query: str = Field(min_length=1, max_length=1000)
    story_id: str = "suzhou-pingjiang"
    location_id: str
    chapter: int = Field(default=1, ge=1)
    # Experiment arm. keyword needs no provider; vector/hybrid embed the query when one is configured.
    mode: Literal["keyword", "vector", "hybrid"] = "keyword"
    limit: int = Field(default=RETRIEVAL_CONFIG["default_limit"], ge=1, le=20)


@router.post("/retrieval/test")
def retrieval_test(body: RetrievalBody, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    settings = AISettings.configured()
    records = approved_records(db, body.story_id)
    vector = None
    embedding_error = None
    if body.mode in {"vector", "hybrid"} and settings.embedding_provider != "none":
        try:
            vector = EmbeddingProvider(settings).embed([body.query])[0]
        except ProviderError as error:
            # A provider outage degrades loudly: never report a vector arm that did not run.
            embedding_error = str(error)
    if body.mode == "vector" and vector is None:
        raise DomainError("EMBEDDING_UNAVAILABLE",
                          "向量检索需要可用的 Embedding 提供方；本次未取得查询向量。", 503)
    started = time.perf_counter()
    hits = retrieve_knowledge(body.query, records, {body.location_id}, body.chapter, vector,
                    settings.embedding_model, body.limit, body.mode)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    if body.mode == "keyword" or vector is None:
        effective_mode = "keyword"
    else:
        effective_mode = body.mode
    return {
        "items": [{"id": h.evidence.knowledge_id, "chunkId": h.evidence.id,
                   "score": round(h.score, 6), "lexicalScore": round(h.lexical_score, 6),
                   "vectorScore": round(h.vector_score, 6), "type": h.evidence.content_type,
                   "title": h.evidence.title, "source": h.evidence.source,
                   "source_url": h.evidence.source_url} for h in hits],
        "mode": effective_mode,
        "requestedMode": body.mode,
        "limit": body.limit,
        "elapsedMs": elapsed_ms,
        "corpusCount": len(records),
        "embeddingModel": settings.embedding_model if vector else "",
        "embeddingError": embedding_error,
        "retrievalConfig": RETRIEVAL_CONFIG,
    }


@router.get("/characters")
def characters(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    return {"items": [{"id": c.id, "kind": c.kind, "name": c.name, "data": c.data} for c in db.scalars(select(Character))]}


class CharacterPatch(StrictBody):
    name: str = Field(min_length=1, max_length=100)
    greeting: str = Field(min_length=1, max_length=2000)
    knowledge_scope: str = Field(min_length=1, max_length=1000)
    personality: list[str] = Field(max_length=10)


@router.patch("/characters/{character_id}")
def edit_character(character_id: str, body: CharacterPatch, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    c = db.get(Character, character_id)
    if c is None or c.kind != "npc":
        raise DomainError("NPC_INVALID", "NPC不存在。", 404)
    c.name = body.name
    c.data = c.data | {"name": body.name, "greeting": body.greeting, "knowledgeScope": body.knowledge_scope, "personality": body.personality}
    audit(db, actor, "edit-npc", c.id)
    db.commit()
    return {"id": c.id, "data": c.data}


@router.get("/story")
def story_config(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    return {"nodes": [{"id": n.id, "kind": n.kind, "data": n.data} for n in db.scalars(select(StoryNode))],
            "tasks": [{"id": t.id, "title": t.title, "type": t.type, "knowledge_score": t.knowledge_score,
                       "data": t.data, "validation": t.validation, "rewards": t.rewards} for t in db.scalars(select(Task))],
            "locations": [{"id": location.id, "data": location.data, "verified": location.coordinates_verified} for location in db.scalars(select(CulturalLocation))]}


class TaskPatch(StrictBody):
    title: str = Field(min_length=1, max_length=200)
    briefing: str = Field(min_length=1, max_length=3000)


@router.patch("/tasks/{task_id}")
def edit_task(task_id: str, body: TaskPatch, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    task = db.get(Task, task_id)
    if task is None:
        raise DomainError("TASK_NOT_FOUND", "任务不存在。", 404)
    task.title = body.title
    task.data = task.data | {"title": body.title, "briefing": body.briefing}
    audit(db, actor, "edit-task-text", task_id)
    db.commit()
    return {"id": task_id, "data": task.data}


@router.get("/dialogues")
def dialogues(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    return {"items": [{"id": log.id, "npc_id": log.npc_id, "user_input": log.user_input,
                       "response": log.response, "feedback": log.feedback} for log in db.scalars(
                           select(DialogueLog).order_by(DialogueLog.created_at.desc()).limit(100))]}


class FeedbackReview(StrictBody):
    resolution: str = Field(min_length=4, max_length=1000)


@router.post("/dialogues/{dialogue_id}/resolve")
def resolve_feedback(dialogue_id: str, body: FeedbackReview, db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    log = db.get(DialogueLog, dialogue_id)
    if log is None or not log.feedback:
        raise DomainError("FEEDBACK_NOT_FOUND", "纠错记录不存在。", 404)
    log.response = log.response | {"feedback_resolution": redact_log_text(body.resolution), "feedback_reviewer": actor}
    audit(db, actor, "resolve-feedback", log.id)
    db.commit()
    return {"resolved": True}


@router.get("/tests")
def tests(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    return {"items": [{"id": case.id, "category": case.category, "result": case.result,
                       "executed_at": case.executed_at.isoformat() if case.executed_at else None} for case in db.scalars(select(TestCase))]}


@router.get("/metrics")
def metrics(db: Session = Depends(get_db), actor: str = Depends(authenticated)):
    def count(model):
        return db.scalar(select(func.count()).select_from(model)) or 0
    return {"knowledge": count(CulturalKnowledge), "reviewedKnowledge": db.scalar(select(func.count()).select_from(CulturalKnowledge).where(CulturalKnowledge.review_status == "reviewed")) or 0,
            "chunks": count(KnowledgeChunk), "characters": count(Character), "locations": count(CulturalLocation),
            "tasks": count(Task), "journeys": count(UserStoryState), "dialogues": count(DialogueLog),
            "safetyEvents": count(SafetyLog), "testCases": count(TestCase), "source": "database_counts",
            "performance": None}
