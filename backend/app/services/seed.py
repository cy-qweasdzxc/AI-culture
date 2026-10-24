"""Idempotent demo seed. Review, licensing and withdrawal decisions are preserved."""
import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.rag.index import rebuild_knowledge
from app.ai.settings import AISettings
from app.core.config import PROJECT_ROOT
from app.models import (
    Character,
    CulturalKnowledge,
    CulturalLocation,
    Item,
    KnowledgeChunk,
    Story,
    StoryEdge,
    StoryNode,
    Task,
)
from app.models.entities import utcnow
from app.services.catalog import seed_catalog


def insert_missing(db: Session, model: Any, row_id: str, **values: Any) -> None:
    if db.get(model, row_id) is None:
        db.add(model(id=row_id, **values))


def _auto_publish_knowledge(db: Session, story_id: str, new_ids: set[str]) -> int:
    """Optional automatic initialization of new non-demo rows, never human review."""
    settings = AISettings.configured()
    chunks_created = 0
    # Seed may initialize new records; it must never overturn a later review decision.
    rows = list(db.scalars(select(CulturalKnowledge).where(
        CulturalKnowledge.story_id == story_id, CulturalKnowledge.id.in_(new_ids),
        CulturalKnowledge.is_demo.is_(False), CulturalKnowledge.review_status == "pending",
    ))) if new_ids else []
    for knowledge in rows:
        knowledge.review_status = "reviewed"
        knowledge.trust_level = "auto_published"
        knowledge.reviewer = knowledge.reviewer or "system-auto-publish"
        knowledge.reviewed_at = knowledge.reviewed_at or utcnow()
        if not knowledge.source.strip():
            knowledge.source = "演示资料（自动发布，未经人工核验）"
        elif "待正式审核" in knowledge.source:
            knowledge.source = knowledge.source.replace("待正式审核", "自动发布，未经人工核验")
        knowledge.metadata_json = {
            **(knowledge.metadata_json or {}),
            "publication_policy": "auto_publish",
            "human_review_required": False,
        }
    db.flush()
    expected_model = settings.embedding_model if settings.embedding_provider != "none" else ""
    expected_dimension = settings.embedding_dimension if settings.embedding_provider != "none" else 0
    for knowledge in rows:
        stored = list(db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == knowledge.id)))
        needs_index = (
            not stored
            or any(chunk.knowledge_version != knowledge.version for chunk in stored)
            or any(chunk.embedding_model != expected_model or chunk.embedding_dimension != expected_dimension
                   for chunk in stored)
        )
        if needs_index:
            chunks_created += rebuild_knowledge(db, knowledge, settings)
    return chunks_created


def seed_database(db: Session, path: Path | None = None, *, auto_publish: bool = False) -> dict[str, int]:
    raw = json.loads((path or PROJECT_ROOT / "data/demo/seed.json").read_text(encoding="utf-8"))
    theme = raw["theme"]
    story_id = theme["id"]
    insert_missing(db, Story, story_id, name=theme["name"], status="published", version=raw["seedVersion"], data={**theme, "isDemo": True})
    db.flush()
    for spot in raw["spots"]:
        insert_missing(db, CulturalLocation, spot["id"], story_id=story_id, name=spot["name"], route_order=spot["order"], lat=spot["lat"], lng=spot["lng"], trigger_radius_m=spot["triggerRadiusM"], dwell_seconds=0, coordinates_verified=False, data=spot)
    for kind, records in (("player", raw["roles"]), ("npc", raw["npcs"])):
        for card in records:
            data = dict(card)
            if kind == "npc":
                data["locationIds"] = [s["id"] for s in raw["spots"] if s.get("npcId") == card["id"]]
            insert_missing(db, Character, card["id"], story_id=story_id, kind=kind, name=card["name"], data=data)
    db.flush()
    new_knowledge_ids = {record["id"] for record in raw["knowledge"] if db.get(CulturalKnowledge, record["id"]) is None}
    for record in raw["knowledge"]:
        insert_missing(db, CulturalKnowledge, record["id"], story_id=story_id, location_id=record["spotId"], content_type=record["type"], title=record["title"], content=record["content"], source=record["source"], source_url="", license="【待补充】", trust_level="unverified", review_status="pending", is_demo=True, tags=[], metadata_json={"seedVersion": raw["seedVersion"]})
    for spot in raw["spots"]:
        insert_missing(db, StoryNode, f"spot-{spot['id']}", story_id=story_id, location_id=spot["id"], kind="spot", data={})
    insert_missing(db, StoryNode, "journey-start", story_id=story_id, kind="start", data={})
    insert_missing(db, StoryNode, "finale", story_id=story_id, location_id="subo", kind="choice", data={"choices": ["hang", "keep"]})
    for ending in raw["endings"]:
        insert_missing(db, StoryNode, ending["id"], story_id=story_id, kind="ending", data={**ending, "isDemo": True, "isFictional": True})
    for task in raw["tasks"]:
        insert_missing(db, StoryNode, task["id"], story_id=story_id, location_id=task["spotId"], kind="task", data={})
    db.flush()
    for clue in raw["clues"]:
        insert_missing(db, Item, clue["id"], story_id=story_id, kind=clue["kind"], name=clue["name"], data={**clue, "isDemo": True})
    for codex in raw["codex"]:
        knowledge_id = codex["id"].replace("codex-", "kn-", 1)
        insert_missing(db, Item, codex["id"], story_id=story_id, knowledge_id=knowledge_id, kind="codex", name=codex["title"], data=codex)
    for task in raw["tasks"]:
        validation = {key: task[key] for key in ("answerKey", "password", "sortingAnswer", "requiredClues") if key in task}
        rewards = {key: task[key] for key in ("rewardClueId", "rewardCodexIds") if key in task}
        public = {key: value for key, value in task.items() if key not in {"answerKey", "password", "sortingAnswer", "explanation", "rewardClueId", "rewardCodexIds"}}
        public["explanation"] = task["explanation"]
        insert_missing(db, Task, task["id"], story_id=story_id, location_id=task["spotId"], node_id=task["id"], type=task["type"], title=task["title"], knowledge_score=task["knowledgeScore"], validation=validation, rewards=rewards, data=public)
    db.flush()
    edges = [("journey-start", "spot-pingjiang", {})]
    for index, spot in enumerate(raw["spots"]):
        for task_id in spot["taskIds"]:
            edges.append((f"spot-{spot['id']}", task_id, {"location_id": spot["id"]}))
            edges.append((task_id, f"spot-{spot['id']}", {}))
        if index + 1 < len(raw["spots"]):
            edges.append((f"spot-{spot['id']}", f"spot-{raw['spots'][index + 1]['id']}", {"completed_tasks": spot["taskIds"]}))
    edges.append(("spot-subo", "finale", {}))
    for source, destination, conditions in edges:
        insert_missing(db, StoryEdge, f"{source}--{destination}", story_id=story_id, from_node_id=source, to_node_id=destination, conditions=conditions)
    for destination, choice, priority, complete in (("cheng-huai", "hang", 20, True), ("qu-jing", "keep", 20, True), ("wei-jin", "hang", 10, False), ("wei-jin", "keep", 10, False)):
        insert_missing(db, StoryEdge, f"finale--{destination}--{choice}", story_id=story_id, from_node_id="finale", to_node_id=destination, choice_key=choice, priority=priority, conditions={"all_tasks_complete": complete})
    seed_catalog(db)
    chunks = _auto_publish_knowledge(db, story_id, new_knowledge_ids) if auto_publish else 0
    db.commit()
    return {"spots": len(raw["spots"]), "tasks": len(raw["tasks"]), "knowledge": len(raw["knowledge"]), "chunks": chunks}
