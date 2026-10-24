from sqlalchemy import select

from app.ai.rag.index import approved_records, rebuild_knowledge
from app.ai.settings import AISettings
from app.models import CulturalKnowledge, KnowledgeChunk
from app.services.seed import seed_database


def fixture_record():
    return CulturalKnowledge(
        id="synthetic-publication-fixture", story_id="suzhou-pingjiang", location_id="pingjiang",
        title="Synthetic engineering fixture", content="Synthetic fiction, not cultural evidence.",
        content_type="fiction", source="Self-authored test fixture",
        source_url="https://example.invalid/fixture", license="Self-authored synthetic fixture",
        review_status="rejected", trust_level="unverified", is_demo=False,
    )


def test_seed_never_republishes_withdrawn_records(db):
    item = fixture_record()
    db.add(item)
    db.commit()
    seed_database(db, auto_publish=True)
    db.refresh(item)
    assert item.review_status == "rejected"
    assert item.trust_level == "unverified"
    assert db.scalar(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == item.id)) is None


def test_default_seed_preserves_demo_and_pending_status(db):
    seed_database(db)
    rows = list(db.scalars(select(CulturalKnowledge)))
    assert rows
    assert all(row.is_demo and row.review_status == "pending" for row in rows)
    assert not list(db.scalars(select(KnowledgeChunk)))


def test_automatic_publication_is_not_human_review(db):
    item = fixture_record()
    item.review_status = "reviewed"
    item.trust_level = "auto_published"
    item.reviewer = "system-auto-publish"
    db.add(item)
    db.commit()
    rebuild_knowledge(db, item, AISettings.configured())
    db.commit()
    assert approved_records(db, "suzhou-pingjiang") == []
    item.trust_level = "human_reviewed"
    item.reviewer = "Synthetic fixture auditor, not cultural review"
    db.commit()
    assert approved_records(db, "suzhou-pingjiang")[0].trust_level == "human_reviewed"


def test_reviewed_status_and_a_reviewer_cannot_override_unverified_trust(db):
    item = fixture_record()
    item.review_status = "reviewed"
    item.reviewer = "Synthetic fixture auditor, not cultural review"
    db.add(item)
    db.commit()
    rebuild_knowledge(db, item, AISettings.configured())
    db.commit()
    assert approved_records(db, "suzhou-pingjiang") == []
    item.trust_level = "human_reviewed"
    item.reviewer = "  "
    db.commit()
    assert approved_records(db, "suzhou-pingjiang") == []
