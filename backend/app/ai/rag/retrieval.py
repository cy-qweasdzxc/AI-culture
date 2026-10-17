"""Audited, scoped exact hybrid retrieval for the small MVP corpus."""

import hashlib
import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Literal

# Engineering starting parameters, not experimentally tuned optima.
# They live here so every experiment can report the exact configuration it ran with.
LEXICAL_MIN_SCORE = 0.12
VECTOR_MIN_SCORE = 0.65
HYBRID_LEXICAL_WEIGHT = 0.65
HYBRID_VECTOR_WEIGHT = 0.35
DEFAULT_LIMIT = 4

RetrievalMode = Literal["keyword", "vector", "hybrid"]

# Reported back to callers so a stored experiment always carries its own configuration.
RETRIEVAL_CONFIG = {
    "lexical_min_score": LEXICAL_MIN_SCORE,
    "vector_min_score": VECTOR_MIN_SCORE,
    "hybrid_lexical_weight": HYBRID_LEXICAL_WEIGHT,
    "hybrid_vector_weight": HYBRID_VECTOR_WEIGHT,
    "default_limit": DEFAULT_LIMIT,
    "top_k_unit": "knowledge",
    "distance": "cosine",
    "index": "exact",
}


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


def fingerprint(text: str) -> str:
    return hashlib.sha256(clean_text(text).encode("utf-8")).hexdigest()


def split_text(text: str, size: int = 450, overlap: int = 60) -> list[str]:
    if size <= overlap or overlap < 0:
        raise ValueError("invalid chunk size")
    normalized = clean_text(text)
    return [normalized[i:i + size] for i in range(0, len(normalized), size - overlap) if normalized[i:i + size]]


def tokens(text: str) -> set[str]:
    value = clean_text(text).lower()
    chinese = re.findall(r"[\u4e00-\u9fff]+", value)
    # Bigrams preserve Chinese lexical matching without a large tokenizer dependency.
    return set(re.findall(r"[a-z0-9]{2,}", value)) | {
        run[i:i + 2] for run in chinese for i in range(max(0, len(run) - 1))
    }


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a or any(not math.isfinite(v) for v in a + b):
        return 0.0
    divisor = math.sqrt(sum(v * v for v in a) * sum(v * v for v in b))
    return sum(x * y for x, y in zip(a, b, strict=True)) / divisor if divisor else 0.0


@dataclass(frozen=True)
class Evidence:
    id: str
    knowledge_id: str
    spot_id: str
    title: str
    content: str
    content_type: str
    source: str
    source_url: str
    license: str
    review_status: str
    chapter: int
    embedding: list[float] = field(default_factory=list)
    embedding_model: str = ""
    conflicted: bool = False


@dataclass(frozen=True)
class Hit:
    evidence: Evidence
    score: float
    lexical_score: float
    vector_score: float


def is_eligible(evidence: Evidence, allowed_spots: set[str], chapter: int) -> bool:
    """Shared eligibility gate for retrieval and conversational subject resolution."""
    return (evidence.review_status == "reviewed" and evidence.spot_id in allowed_spots
            and evidence.chapter <= chapter and not evidence.conflicted
            and bool(evidence.source) and bool(evidence.license))


def retrieve(query: str, records: list[Evidence], allowed_spots: set[str], chapter: int,
             query_vector: list[float] | None = None, embedding_model: str = "",
             limit: int = DEFAULT_LIMIT, mode: RetrievalMode = "hybrid") -> list[Hit]:
    """Return audited hits under an explicit retrieval mode.

    The default keeps the original behaviour: hybrid scoring when a query vector is
    supplied, lexical-only otherwise. ``mode`` makes the three experiment arms
    (keyword / vector / hybrid) selectable without changing any guard.
    """
    query_tokens = tokens(query)
    matches = []
    for evidence in records:
        if not is_eligible(evidence, allowed_spots, chapter):
            continue
        overlap = query_tokens & tokens(evidence.title + " " + evidence.content)
        lexical = len(overlap) / max(1, len(query_tokens))
        vector = (max(0.0, cosine(query_vector, evidence.embedding))
                  if query_vector and evidence.embedding_model == embedding_model else 0.0)
        if mode == "keyword":
            if lexical < LEXICAL_MIN_SCORE:
                continue
            score = lexical
        elif mode == "vector":
            # Pure vector hits require a conservative cosine threshold; thresholds are not accuracy claims.
            if vector < VECTOR_MIN_SCORE:
                continue
            score = vector
        elif query_vector:
            if lexical < LEXICAL_MIN_SCORE and vector < VECTOR_MIN_SCORE:
                continue
            score = HYBRID_LEXICAL_WEIGHT * lexical + HYBRID_VECTOR_WEIGHT * vector
        else:
            # Hybrid degrades to lexical when no query vector was supplied.
            if lexical < LEXICAL_MIN_SCORE:
                continue
            score = lexical
        matches.append(Hit(evidence, score, lexical, vector))
    matches.sort(key=lambda hit: (-hit.score, hit.evidence.id))
    seen = set()
    unique = []
    for hit in matches:
        key = fingerprint(hit.evidence.content)
        if key not in seen:
            seen.add(key)
            unique.append(hit)
    return unique[:limit]


def retrieve_knowledge(query: str, records: list[Evidence], allowed_spots: set[str], chapter: int,
                       query_vector: list[float] | None = None, embedding_model: str = "",
                       limit: int = DEFAULT_LIMIT, mode: RetrievalMode = "hybrid") -> list[Hit]:
    """Shared production/evaluation contract: K distinct knowledge IDs, best chunk each."""
    if limit <= 0:
        return []
    ranked = retrieve(query, records, allowed_spots, chapter, query_vector, embedding_model,
                      max(1, len(records)), mode)
    selected = []
    seen = set()
    for hit in ranked:
        if hit.evidence.knowledge_id not in seen:
            seen.add(hit.evidence.knowledge_id)
            selected.append(hit)
        if len(selected) >= limit:
            break
    return selected
