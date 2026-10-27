from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Character, CulturalLocation, Story, Task
from app.services.catalog import publication_scope


def published_stories(db: Session) -> list[Story]:
    return list(db.scalars(select(Story).where(Story.status == "published", Story.id.in_(publication_scope()["stories"])).order_by(Story.id)))


def locations(db: Session, story_id: str) -> list[CulturalLocation]:
    return list(db.scalars(select(CulturalLocation).where(CulturalLocation.story_id == story_id).order_by(CulturalLocation.route_order)))


def characters(db: Session, story_id: str, kind: str) -> list[Character]:
    return list(db.scalars(select(Character).where(Character.story_id == story_id, Character.kind == kind).order_by(Character.id)))


def tasks(db: Session, story_id: str) -> list[Task]:
    return list(db.scalars(select(Task).where(Task.story_id == story_id).order_by(Task.id)))
