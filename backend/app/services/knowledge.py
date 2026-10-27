"""Public provenance and non-destructive refresh of historical citation status."""
from app.ai.rag.index import has_human_review
from app.models import CulturalKnowledge


def provenance(knowledge: CulturalKnowledge) -> dict:
    return {"review_status": knowledge.review_status, "trust_level": knowledge.trust_level,
            "human_review_verified": has_human_review(knowledge),
            "is_demo": knowledge.is_demo, "is_fictional": knowledge.content_type == "fiction",
            "source_url": knowledge.source_url, "license": knowledge.license,
            "version": knowledge.version,
            "reviewed_at": knowledge.reviewed_at.isoformat() if knowledge.reviewed_at else None}


def public_knowledge(knowledge: CulturalKnowledge) -> dict:
    return {"id": knowledge.id, "location_id": knowledge.location_id, "title": knowledge.title,
            "content": knowledge.content, "content_type": knowledge.content_type,
            "source": knowledge.source, **provenance(knowledge)}


def current_citation(entry: dict, knowledge: CulturalKnowledge | None) -> dict:
    # Preserve the cited wording/source/license. An edited version must not lend its
    # new approval to an old quotation, and historical audit rows remain immutable.
    if knowledge is None:
        return {**entry, "review_status": "rejected", "trust_level": "unverified",
                "reviewed_at": None, "human_review_verified": False, "citation_current": False, "current_version": None,
                "is_fictional": entry.get("type") == "fiction"}
    return {**entry, "review_status": knowledge.review_status, "trust_level": knowledge.trust_level,
            "human_review_verified": has_human_review(knowledge),
            "is_demo": knowledge.is_demo, "is_fictional": entry.get("type") == "fiction",
            "reviewed_at": knowledge.reviewed_at.isoformat() if knowledge.reviewed_at else None,
            "current_version": knowledge.version,
            "citation_current": has_human_review(knowledge) and entry.get("version") == knowledge.version}


def refresh_response(db, response: dict) -> dict:
    """Refresh replay provenance without changing the immutable receipt/audit content."""
    def entries(items):
        return [current_citation(item, db.get(CulturalKnowledge, item["id"])) for item in items]

    result = dict(response)
    if "evidence" in result:
        result["evidence"] = entries(result["evidence"])
    if "messages" in result:
        result["messages"] = [{**message, "evidence": entries(message["evidence"])}
                              if "evidence" in message else dict(message)
                              for message in result["messages"]]
    return result
