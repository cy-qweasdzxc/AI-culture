from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    location_consent: Mapped[bool] = mapped_column(Boolean, default=False)


class Story(Base):
    __tablename__ = "stories"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    version: Mapped[str] = mapped_column(String(32), default="demo-v1")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Character(Base):
    __tablename__ = "characters"
    __table_args__ = (CheckConstraint("kind IN ('player', 'npc')", name="ck_character_kind"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(100))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class CulturalLocation(Base):
    __tablename__ = "cultural_locations"
    __table_args__ = (UniqueConstraint("story_id", "route_order"), CheckConstraint("trigger_radius_m > 0", name="ck_location_radius"))
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    route_order: Mapped[int] = mapped_column(Integer)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    trigger_radius_m: Mapped[float] = mapped_column(Float)
    dwell_seconds: Mapped[int] = mapped_column(Integer, default=0)
    coordinates_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class CulturalKnowledge(Base):
    __tablename__ = "cultural_knowledge"
    __table_args__ = (
        CheckConstraint("content_type IN ('fact', 'disputed', 'legend', 'fiction')", name="ck_knowledge_type"),
        CheckConstraint("review_status IN ('pending', 'reviewed', 'rejected')", name="ck_knowledge_review"),
        Index("ix_knowledge_review_location", "review_status", "location_id"),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    location_id: Mapped[str | None] = mapped_column(ForeignKey("cultural_locations.id"), nullable=True)
    content_type: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, default="【待补充】")
    source_url: Mapped[str] = mapped_column(Text, default="")
    license: Mapped[str] = mapped_column(Text, default="【待补充】")
    trust_level: Mapped[str] = mapped_column(String(32), default="unverified")
    review_status: Mapped[str] = mapped_column(String(16), default="pending")
    reviewer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (UniqueConstraint("knowledge_id", "chunk_index"),)
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    knowledge_id: Mapped[str] = mapped_column(ForeignKey("cultural_knowledge.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(JSON, default=list)
    embedding_model: Mapped[str] = mapped_column(String(120), default="")
    embedding_dimension: Mapped[int] = mapped_column(Integer, default=0)
    knowledge_version: Mapped[int] = mapped_column(Integer, default=1)
    vector_ref: Mapped[str | None] = mapped_column(String(160), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class StoryNode(Base):
    __tablename__ = "story_nodes"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    location_id: Mapped[str | None] = mapped_column(ForeignKey("cultural_locations.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(24))
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class StoryEdge(Base):
    __tablename__ = "story_edges"
    __table_args__ = (UniqueConstraint("from_node_id", "to_node_id", "choice_key"),)
    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    from_node_id: Mapped[str] = mapped_column(ForeignKey("story_nodes.id"), index=True)
    to_node_id: Mapped[str] = mapped_column(ForeignKey("story_nodes.id"))
    choice_key: Mapped[str] = mapped_column(String(32), default="")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    conditions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint("knowledge_score >= 0", name="ck_task_score"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    location_id: Mapped[str] = mapped_column(ForeignKey("cultural_locations.id"), index=True)
    node_id: Mapped[str] = mapped_column(ForeignKey("story_nodes.id"))
    type: Mapped[str] = mapped_column(String(24))
    title: Mapped[str] = mapped_column(String(200))
    knowledge_score: Mapped[int] = mapped_column(Integer)
    validation: Mapped[dict[str, Any]] = mapped_column(JSON)
    rewards: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Item(Base):
    __tablename__ = "items"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    knowledge_id: Mapped[str | None] = mapped_column(ForeignKey("cultural_knowledge.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(160))
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class UserStoryState(Base):
    __tablename__ = "user_story_state"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_journey_user"),
        CheckConstraint("state_version >= 0", name="ck_state_version"),
        CheckConstraint("mode IN ('virtual', 'onsite')", name="ck_journey_mode"),
        Index("ix_journey_user_started", "user_id", "started_at"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"))
    role_id: Mapped[str] = mapped_column(ForeignKey("characters.id"))
    mode: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(32), default="CREATED")
    current_node_id: Mapped[str | None] = mapped_column(ForeignKey("story_nodes.id"), nullable=True)
    current_location_id: Mapped[str | None] = mapped_column(ForeignKey("cultural_locations.id"), nullable=True)
    chapter: Mapped[int] = mapped_column(Integer, default=1)
    state_version: Mapped[int] = mapped_column(Integer, default=0)
    state_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ending_id: Mapped[str | None] = mapped_column(ForeignKey("story_nodes.id"), nullable=True)
    ending_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserTaskState(Base):
    __tablename__ = "user_task_state"
    __table_args__ = (CheckConstraint("attempts >= 0 AND score >= 0", name="ck_user_task_nonnegative"),)
    journey_id: Mapped[str] = mapped_column(ForeignKey("user_story_state.id", ondelete="CASCADE"), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String(24), default="locked")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    answer: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    score: Mapped[int] = mapped_column(Integer, default=0)


class UserInventory(Base):
    __tablename__ = "user_inventory"
    journey_id: Mapped[str] = mapped_column(ForeignKey("user_story_state.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("items.id"), primary_key=True)
    source: Mapped[str] = mapped_column(String(160))
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserCollection(Base):
    __tablename__ = "user_collections"
    journey_id: Mapped[str] = mapped_column(ForeignKey("user_story_state.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("items.id"), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[str] = mapped_column(String(160))
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DialogueLog(Base):
    __tablename__ = "dialogue_logs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    journey_id: Mapped[str] = mapped_column(ForeignKey("user_story_state.id", ondelete="CASCADE"), index=True)
    npc_id: Mapped[str] = mapped_column(ForeignKey("characters.id"))
    user_input: Mapped[str] = mapped_column(Text)
    response: Mapped[dict[str, Any]] = mapped_column(JSON)
    evidence_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    approved_actions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(32), default="mock")
    model: Mapped[str] = mapped_column(String(120), default="")
    prompt_version: Mapped[str] = mapped_column(String(32), default="v1")
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SafetyLog(Base):
    __tablename__ = "safety_logs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    journey_id: Mapped[str | None] = mapped_column(ForeignKey("user_story_state.id", ondelete="CASCADE"), nullable=True, index=True)
    risk_type: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(Text)
    rule_version: Mapped[str] = mapped_column(String(32), default="v1")
    result: Mapped[str] = mapped_column(String(32), default="blocked")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TestCase(Base):
    __tablename__ = "test_cases"
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    input: Mapped[dict[str, Any]] = mapped_column(JSON)
    expected: Mapped[dict[str, Any]] = mapped_column(JSON)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ActionReceipt(Base):
    __tablename__ = "action_receipts"
    journey_id: Mapped[str] = mapped_column(ForeignKey("user_story_state.id", ondelete="CASCADE"), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    action: Mapped[str] = mapped_column(String(160))
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
