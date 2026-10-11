"""Verify the optional pgvector storage actually holds searchable, correct vectors.

The 0002 migration adds a ``knowledge_vectors`` table so PostgreSQL deployments keep embeddings in
a native ``vector`` column. Retrieval itself runs in Python (exact cosine over the small corpus), so
that table is only useful if its contents are provably equivalent to the JSON embeddings used for
ranking. This script proves or disproves that, and then runs a native pgvector cosine query to show
the stored column is genuinely queryable.

Read-only: it never writes to the database.

Run from backend (needs a PostgreSQL DATABASE_URL):
    python scripts/verify_pgvector_storage.py
"""
import argparse
import json
import sys
import time
from pathlib import Path

from sqlalchemy import select, text

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.ai.rag.index import approved_records  # noqa: E402
from app.ai.rag.retrieval import cosine, retrieve  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models import KnowledgeChunk  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--story-id", default="suzhou-pingjiang")
    parser.add_argument("--query", default="平江路", help="用于对比排序的一条查询")
    parser.add_argument("--limit", type=int, default=4)
    args = parser.parse_args()

    with SessionLocal() as db:
        dialect = db.bind.dialect.name
        print(json.dumps({"dialect": dialect, "story_id": args.story_id}, ensure_ascii=False))
        if dialect != "postgresql":
            print(json.dumps({"executed": False, "reason": "POSTGRES_REQUIRED: 本脚本只验证 pgvector 路径"},
                             ensure_ascii=False), file=sys.stderr)
            return 2

        chunks = list(db.scalars(select(KnowledgeChunk).order_by(KnowledgeChunk.id)))
        native = {row[0]: row[1] for row in db.execute(
            text("SELECT chunk_id, embedding::text FROM knowledge_vectors")).all()}
        print(json.dumps({
            "json_chunks": len(chunks),
            "native_rows": len(native),
            "chunks_with_vector": sum(1 for c in chunks if c.embedding),
        }, ensure_ascii=False))

        # 1) 原生表与 JSON 列必须一一对应，且逐维相同
        missing = [c.id for c in chunks if c.embedding and c.id not in native]
        same_dims, mismatched = 0, []
        for chunk in chunks:
            if not chunk.embedding or chunk.id not in native:
                continue
            raw = native[chunk.id].strip("[]").split(",")
            native_vec = [float(value) for value in raw]
            if len(native_vec) != len(chunk.embedding):
                mismatched.append({"chunk": chunk.id, "reason": "维度不同",
                                   "json": len(chunk.embedding), "native": len(native_vec)})
                continue
            worst = max((abs(a - b) for a, b in zip(chunk.embedding, native_vec, strict=True)), default=0.0)
            if worst > 1e-6:
                mismatched.append({"chunk": chunk.id, "reason": "数值不同", "max_abs_diff": worst})
            else:
                same_dims += 1
        print(json.dumps({"identical_vectors": same_dims, "native_missing_for": missing,
                          "mismatched": mismatched}, ensure_ascii=False))

        # 2) 原生余弦查询必须可用，且与 Python 排序一致
        records = approved_records(db, args.story_id)
        if not records:
            print(json.dumps({"executed": False, "reason": "REVIEWED_CORPUS_REQUIRED"}, ensure_ascii=False),
                  file=sys.stderr)
            return 2
        probe = next((r for r in records if r.embedding), None)
        if probe is None:
            print(json.dumps({"executed": False, "reason": "NO_EMBEDDED_RECORD"}, ensure_ascii=False),
                  file=sys.stderr)
            return 2
        query_vector = probe.embedding
        started = time.perf_counter()
        native_hits = db.execute(text(
            "SELECT chunk_id, 1 - (embedding <=> CAST(:vec AS vector)) AS similarity "
            "FROM knowledge_vectors ORDER BY embedding <=> CAST(:vec AS vector) LIMIT :k"
        ), {"vec": json.dumps(query_vector), "k": args.limit}).all()
        native_ms = round((time.perf_counter() - started) * 1000, 3)

        py_hits = retrieve(args.query, records, {probe.spot_id}, 99, query_vector,
                           probe.embedding_model, args.limit, "vector")
        native_top = [row[0].split(":")[0] for row in native_hits]
        python_top = [hit.evidence.knowledge_id for hit in py_hits]
        print(json.dumps({
            "probe_query": args.query, "probe_spot": probe.spot_id,
            "native_top": native_top, "native_similarities": [round(row[1], 6) for row in native_hits],
            "native_elapsed_ms": native_ms,
            "python_top": python_top,
            "python_top_similarities": [round(cosine(query_vector, hit.evidence.embedding), 6) for hit in py_hits],
            "ranking_matches": native_top[:len(python_top)] == python_top,
        }, ensure_ascii=False))
        db.rollback()
        return 0 if not mismatched and not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
