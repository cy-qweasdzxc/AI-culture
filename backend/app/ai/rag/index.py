"""Versioned SQL chunks; optional pgvector exact storage, no unreviewed publication."""

import json

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.ai.llm.providers import EmbeddingProvider
from app.ai.rag.retrieval import Evidence, fingerprint, split_text
from app.ai.settings import AISettings
from app.core.errors import DomainError
from app.models import CulturalKnowledge, KnowledgeChunk


def has_human_review(knowledge: CulturalKnowledge) -> bool:
    reviewer = (knowledge.reviewer or "").strip()
    return (knowledge.review_status == "reviewed" and not knowledge.is_demo
            and knowledge.trust_level == "human_reviewed" and len(reviewer) >= 2
            and reviewer != "system-auto-publish")


def rebuild_knowledge(db: Session, knowledge: CulturalKnowledge, settings: AISettings) -> int:
    if knowledge.review_status != "reviewed" or knowledge.is_demo:
        raise DomainError("KNOWLEDGE_UNREVIEWED", "只有状态为 reviewed 且非 demo 的资料可发布索引；自动发布不代表人工事实核验。", 409)
    segments = split_text(knowledge.content)
    vectors = EmbeddingProvider(settings).embed(segments) if settings.embedding_provider != "none" else [[] for _ in segments]
    if db.bind.dialect.name == "postgresql":
        db.execute(text("DELETE FROM knowledge_vectors WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE knowledge_id=:id)"), {"id": knowledge.id})
    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == knowledge.id))
    for i, (segment, vector) in enumerate(zip(segments, vectors, strict=True)):
        chunk_id = f"{knowledge.id}:{i}"
        db.add(KnowledgeChunk(
            id=chunk_id, knowledge_id=knowledge.id, chunk_index=i, content=segment,
            embedding=vector, embedding_model=settings.embedding_model if vector else "",
            embedding_dimension=len(vector), knowledge_version=knowledge.version,
            vector_ref=chunk_id if vector else None,
            metadata_json={"sha256": fingerprint(segment), "distance": "cosine", "index": "exact",
                           "embedding_provider": settings.embedding_provider if vector else "none"},
        ))
        db.flush()
        if vector and db.bind.dialect.name == "postgresql":
            db.execute(text("INSERT INTO knowledge_vectors (chunk_id,embedding,model,dimension) VALUES (:id,CAST(:embedding AS vector),:model,:dimension)"),
                       {"id": chunk_id, "embedding": json.dumps(vector), "model": settings.embedding_model, "dimension": len(vector)})
    return len(segments)


def approved_records(db: Session, story_id: str) -> list[Evidence]:
    rows = db.execute(select(KnowledgeChunk, CulturalKnowledge).join(CulturalKnowledge).where(
        CulturalKnowledge.story_id == story_id,
        CulturalKnowledge.review_status == "reviewed", CulturalKnowledge.is_demo.is_(False),
        CulturalKnowledge.trust_level == "human_reviewed",
        CulturalKnowledge.reviewer.is_not(None), CulturalKnowledge.reviewer != "system-auto-publish",
        func.length(func.trim(CulturalKnowledge.reviewer)) >= 2,
        KnowledgeChunk.knowledge_version == CulturalKnowledge.version,
    )).all()
    return [Evidence(
        id=chunk.id, knowledge_id=k.id, spot_id=k.location_id or "", title=k.title,
        content=chunk.content, content_type=k.content_type, source=k.source,
        source_url=k.source_url, license=k.license, review_status=k.review_status, trust_level=k.trust_level,
        chapter=int(k.metadata_json.get("min_chapter", 1)), embedding=chunk.embedding,
        embedding_model=chunk.embedding_model, conflicted=bool(k.metadata_json.get("conflicted", False)),
    ) for chunk, k in rows]
