"""Render only complete, verifiable source excerpts, never unverified model prose."""

from app.ai.rag.retrieval import clean_text

_BOUNDARIES = "。.!?;\n"


def verified_sentence_excerpt(quote: str, source: str) -> bool:
    """Reject fabricated excerpts and fragments that could strip a negation/qualifier."""
    quote, source = clean_text(quote), clean_text(source)
    if not quote:
        return False
    start = source.find(quote)
    while start >= 0:
        end = start + len(quote)
        before = source[:start].rstrip()
        if (not before or before[-1] in _BOUNDARIES) and (end == len(source) or quote[-1] in _BOUNDARIES):
            return True
        start = source.find(quote, start + 1)
    return False
