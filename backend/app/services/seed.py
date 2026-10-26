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


def _seed_city_stories(db: Session) -> None:
    """Seed fully playable, virtual-only city story packs with pending knowledge review."""
    packs = [PROJECT_ROOT / "data/demo/stories/hangzhou-xihu.json", PROJECT_ROOT / "data/demo/stories/nanjing-zhongshan.json"]
    loaded = [json.loads(path.read_text(encoding="utf-8")) for path in packs if path.exists()]
    for raw in loaded:
        theme = raw["theme"]
        story_id = theme["id"]
        insert_missing(db, Story, story_id, name=theme["name"], status="published", version=raw["seedVersion"], data={**theme, "isDemo": True})
        for spot in raw["spots"]:
            insert_missing(db, CulturalLocation, spot["id"], story_id=story_id, name=spot["name"], route_order=spot["order"], lat=spot["lat"], lng=spot["lng"], trigger_radius_m=80, dwell_seconds=0, coordinates_verified=False, data=spot)
        for kind, records in (("player", raw["roles"]), ("npc", raw["npcs"])):
            for card in records:
                insert_missing(db, Character, card["id"], story_id=story_id, kind=kind, name=card["name"], data=card)
        for record in raw["knowledge"]:
            insert_missing(db, CulturalKnowledge, record["id"], story_id=story_id, location_id=record["spotId"], content_type=record["type"], title=record["title"], content=record["content"], source=record["source"], source_url=record.get("sourceUrl", ""), license=record.get("license", "【待正式审核】"), trust_level="unverified", review_status="pending", is_demo=True, tags=[], metadata_json={"seedVersion": raw["seedVersion"], "human_review_required": True})
        insert_missing(db, StoryNode, theme["start_node_id"], story_id=story_id, kind="start", data={})
        for spot in raw["spots"]:
            insert_missing(db, StoryNode, f"spot-{spot['id']}", story_id=story_id, location_id=spot["id"], kind="spot", data={})
        for task in raw["tasks"]:
            insert_missing(db, StoryNode, task["id"], story_id=story_id, location_id=task["spotId"], kind="task", data={})
            validation = {key: task[key] for key in ("answerKey", "answerKeys", "matchingAnswer", "password", "sortingAnswer", "requiredClues") if key in task}
            public = {key: value for key, value in task.items() if key not in {"answerKey", "answerKeys", "matchingAnswer", "password", "sortingAnswer", "explanation", "sourceUrl"}}
            public["explanation"] = task["explanation"]
            insert_missing(db, Task, task["id"], story_id=story_id, location_id=task["spotId"], node_id=task["id"], type=task["type"], title=task["title"], knowledge_score=task["knowledgeScore"], validation=validation, rewards={}, data=public)
        db.flush()
        for clue in raw["clues"]:
            insert_missing(db, Item, clue["id"], story_id=story_id, kind=clue["kind"], name=clue["name"], data={**clue, "isDemo": True})
        for codex in raw["codex"]:
            knowledge_id = "kn-" + codex["id"].removeprefix("codex-")
            insert_missing(db, Item, codex["id"], story_id=story_id, knowledge_id=knowledge_id, kind="codex", name=codex["title"], data=codex)
        finale_id = theme["finale_node_id"]
        insert_missing(db, StoryNode, finale_id, story_id=story_id, location_id=theme["finale_location_id"], kind="choice", data={"choices": [choice["key"] for choice in theme["finale_choices"]]})
        for ending in raw["endings"]:
            insert_missing(db, StoryNode, ending["id"], story_id=story_id, kind="ending", data={**ending, "isDemo": True, "isFictional": True})
    # Create route rows/stops after the location records exist.
    seed_catalog(db)
    routes = json.loads((PROJECT_ROOT / "data/demo/catalog.json").read_text(encoding="utf-8"))["routes"]
    for raw in loaded:
        theme = raw["theme"]
        route = next((row for row in routes if row.get("story_id") == theme["id"]), None)
        if not route:
            continue
        chain = route["stop_ids"]
        edges = [(theme["start_node_id"], f"spot-{chain[0]}", {})]
        tasks_by_spot = {spot["id"]: spot["taskIds"] for spot in raw["spots"]}
        required_by_spot = {spot["id"]: [task_id for task_id in spot["taskIds"] if not next(task for task in raw["tasks"] if task["id"] == task_id).get("optional", False)] for spot in raw["spots"]}
        for index, location_id in enumerate(chain):
            for task_id in tasks_by_spot[location_id]:
                edges.extend([(f"spot-{location_id}", task_id, {"location_id": location_id}), (task_id, f"spot-{location_id}", {})])
            if index + 1 < len(chain):
                edges.append((f"spot-{location_id}", f"spot-{chain[index + 1]}", {"completed_tasks": required_by_spot[location_id]}))
        edges.append((f"spot-{theme['finale_location_id']}", theme["finale_node_id"], {}))
        for source, destination, conditions in edges:
            edge_id = f"{source}--{destination}"
            insert_missing(db, StoryEdge, edge_id, story_id=theme["id"], from_node_id=source, to_node_id=destination, conditions=conditions)
        for choice in theme["finale_choices"]:
            for ending in raw["endings"]:
                matches = (choice["key"] == "hang" and ending["id"].endswith("-hang")) or (choice["key"] == "keep" and ending["id"].endswith("-keep"))
                if matches:
                    insert_missing(db, StoryEdge, f"{theme['finale_node_id']}--{ending['id']}--{choice['key']}", story_id=theme["id"], from_node_id=theme["finale_node_id"], to_node_id=ending["id"], choice_key=choice["key"], priority=20, conditions={"all_tasks_complete": True})
    # The Suzhou garden branch reuses reviewed-in-demo task mechanics but has its own
    # start node and endings; no branch can accidentally enter the classic finale.
    garden = next((row for row in routes if row["id"] == "suzhou-garden-stones"), None)
    if garden and garden["status"] == "open":
        start_id, finale_id = garden["start_node_id"], garden["finale_node_id"]
        insert_missing(db, StoryNode, start_id, story_id="suzhou-pingjiang", kind="start", data={})
        insert_missing(db, StoryNode, finale_id, story_id="suzhou-pingjiang", location_id="zhuozhengyuan", kind="choice", data={"choices": [c["key"] for c in garden["finale_choices"]]})
        garden_edges = [(start_id, "spot-ouyuan", {}), ("spot-zhuozhengyuan", finale_id, {})]
        for source, destination, conditions in garden_edges:
            insert_missing(db, StoryEdge, f"{source}--{destination}", story_id="suzhou-pingjiang", from_node_id=source, to_node_id=destination, conditions=conditions)
        for choice in garden["finale_choices"]:
            ending_id = f"ending-suzhou-garden-{choice['key']}"
            ending_data = {"id": ending_id, "name": "园林留影" if choice["key"] == "hang" else "石影未尽", "category": "完整支线", "narrative": "你走完耦园、狮子林与拙政园的虚构寻石支线，把观察留在手札里。", "conditionText": choice["label"]}
            insert_missing(db, StoryNode, ending_id, story_id="suzhou-pingjiang", kind="ending", data={**ending_data, "isDemo": True, "isFictional": True})
            edge_id = f"{finale_id}--{ending_id}--{choice['key']}"
            insert_missing(db, StoryEdge, edge_id, story_id="suzhou-pingjiang", from_node_id=finale_id, to_node_id=ending_id, choice_key=choice["key"], priority=20, conditions={"all_tasks_complete": True})
    db.flush()


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
        validation = {key: task[key] for key in ("answerKey", "answerKeys", "matchingAnswer", "password", "sortingAnswer", "requiredClues") if key in task}
        rewards = {key: task[key] for key in ("rewardClueId", "rewardCodexIds") if key in task}
        public = {key: value for key, value in task.items() if key not in {"answerKey", "answerKeys", "matchingAnswer", "password", "sortingAnswer", "explanation", "rewardClueId", "rewardCodexIds"}}
        public["explanation"] = task["explanation"]
        insert_missing(db, Task, task["id"], story_id=story_id, location_id=task["spotId"], node_id=task["id"], type=task["type"], title=task["title"], knowledge_score=task["knowledgeScore"], validation=validation, rewards=rewards, data=public)
    db.flush()
    edges = [("journey-start", "spot-pingjiang", {})]
    for index, spot in enumerate(raw["spots"]):
        for task_id in spot["taskIds"]:
            edges.append((f"spot-{spot['id']}", task_id, {"location_id": spot["id"]}))
            edges.append((task_id, f"spot-{spot['id']}", {}))
        if index + 1 < len(raw["spots"]):
            required_ids = [task_id for task_id in spot["taskIds"] if not next(task for task in raw["tasks"] if task["id"] == task_id).get("optional", False)]
            edges.append((f"spot-{spot['id']}", f"spot-{raw['spots'][index + 1]['id']}", {"completed_tasks": required_ids}))
    edges.append(("spot-subo", "finale", {}))
    for source, destination, conditions in edges:
        insert_missing(db, StoryEdge, f"{source}--{destination}", story_id=story_id, from_node_id=source, to_node_id=destination, conditions=conditions)
    for destination, choice, priority, complete in (("cheng-huai", "hang", 20, True), ("qu-jing", "keep", 20, True), ("wei-jin", "hang", 10, False), ("wei-jin", "keep", 10, False)):
        insert_missing(db, StoryEdge, f"finale--{destination}--{choice}", story_id=story_id, from_node_id="finale", to_node_id=destination, choice_key=choice, priority=priority, conditions={"all_tasks_complete": complete})
    seed_catalog(db)
    _seed_city_stories(db)
    chunks = _auto_publish_knowledge(db, story_id, new_knowledge_ids) if auto_publish else 0
    db.commit()
    return {"spots": len(raw["spots"]), "tasks": len(raw["tasks"]), "knowledge": len(raw["knowledge"]), "chunks": chunks}
