"""Restore a pinned, previously human-approved release; never grant new review authority.

Default is read-only. Run with --release PATH --database-url URL [--apply].
Only absent rows or *exact*, untouched demo seed rows may be restored. All other
conflicts are reported and skipped. The command always builds free keyword chunks.
"""
import argparse
import hashlib
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.ai.rag.index import has_human_review, rebuild_knowledge  # noqa: E402
from app.ai.rag.retrieval import fingerprint, split_text  # noqa: E402
from app.ai.settings import AISettings  # noqa: E402
from app.core.config import PROJECT_ROOT  # noqa: E402
from app.core.database import make_engine  # noqa: E402
from app.models import CulturalKnowledge, CulturalLocation, KnowledgeChunk, Story  # noqa: E402

# Pinned Git blob digest after CRLF -> LF normalization (Git checkout may change line endings).\n# No other whitespace or content change is accepted; caller-provided digests grant no authority.
TRUSTED_RELEASES = {"78192485ed2d521259947deaf4baa8758ca5d4a20b98c1c8d986b916260066d1"}
FIELDS = ("id", "story_id", "location_id", "title", "content", "content_type", "source",
          "source_url", "license", "review_status", "reviewer", "reviewed_at", "version",
          "is_demo", "trust_level", "tags", "metadata_json")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_release(path: Path) -> dict:
    raw = path.read_bytes()
    if hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest() not in TRUSTED_RELEASES:
        raise ValueError("UNTRUSTED_RELEASE_SHA256")
    payload = json.loads(raw)
    if payload.get("schema_version") != "cultural-knowledge-reviewed-release-v1":
        raise ValueError("INVALID_SCHEMA")
    rows = payload.get("records", [])
    if len(rows) != payload.get("record_count") or len({r["id"] for r in rows}) != len(rows):
        raise ValueError("INVALID_RECORD_COUNT")
    if dict(Counter(r["story_id"] for r in rows)) != payload.get("story_counts"):
        raise ValueError("INVALID_STORY_COUNTS")
    if set(payload.get("record_sha256", {})) != {r["id"] for r in rows}:
        raise ValueError("INVALID_HASH_INVENTORY")
    for row in rows:
        if set(row) != set(FIELDS) or hashlib.sha256(canonical(row).encode()).hexdigest() != payload["record_sha256"][row["id"]]:
            raise ValueError("INVALID_RECORD_SHA256: " + row["id"])
        if type(row["version"]) is not int or row["version"] < 1:
            raise ValueError("INVALID_VERSION: " + row["id"])
        record = CulturalKnowledge(**{**row, "reviewed_at": datetime.fromisoformat(row["reviewed_at"])})
        if not has_human_review(record) or not row["content"].strip() or row["content_type"] not in {"fact", "disputed", "legend", "fiction"}:
            raise ValueError("INVALID_REVIEW: " + row["id"])
    return payload


def record_values(record):
    values = {field: getattr(record, field) for field in FIELDS}
    stamp = values["reviewed_at"]
    if stamp is not None:
        values["reviewed_at"] = stamp.replace(tzinfo=stamp.tzinfo or UTC).astimezone(UTC).isoformat()
    return values


def pristine_seed():
    raw = json.loads((PROJECT_ROOT / "data/demo/seed.json").read_text(encoding="utf-8"))
    return {r["id"]: dict(id=r["id"], story_id=raw["theme"]["id"], location_id=r["spotId"],
                         title=r["title"], content=r["content"], content_type=r["type"], source=r["source"],
                         source_url="", license="【待补充】", trust_level="unverified", review_status="pending",
                         reviewer=None, reviewed_at=None, version=1, is_demo=True, tags=[],
                         metadata_json={"seedVersion": raw["seedVersion"]}) for r in raw["knowledge"]}


def chunks_current(db, record):
    chunks = list(db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == record.id).order_by(KnowledgeChunk.chunk_index)))
    segments = split_text(record.content)
    return len(chunks) == len(segments) and all(
        c.chunk_index == i and c.content == segment and c.knowledge_version == record.version
        and c.metadata_json.get("sha256") == fingerprint(segment)
        for i, (c, segment) in enumerate(zip(chunks, segments, strict=True)))


def restore_release(db: Session, payload: dict, *, apply=False, story_id=None, include_archives=False) -> dict:
    # Revalidate even for programmatic callers; a modified in-memory payload is not trusted.
    if hashlib.sha256(canonical(payload).encode()).hexdigest() != hashlib.sha256(canonical(load_release(
            PROJECT_ROOT / "data/releases/cultural-knowledge-reviewed-20261029.json")).encode()).hexdigest():
        raise ValueError("UNTRUSTED_RELEASE_CONTENT")
    seed = pristine_seed()
    report = {"mode": "apply" if apply else "dry-run", "release_records": payload["record_count"],
              "restored": 0, "unchanged": 0, "indexed": 0, "conflicts": [], "excluded": 0, "archive_links": 0}
    # Caller owns a fresh transaction. A failure rolls back the entire restore, not only the last row.
    if db.in_transaction():
        raise ValueError("RESTORE_REQUIRES_FRESH_TRANSACTION")
    with db.begin():
        plans = []
        archive_ids = {"hangzhou-xihu", "nanjing-zhongshan"}
        archive_points = {}
        if include_archives:
            for row in payload["records"]:
                if row["story_id"] in archive_ids and (not story_id or row["story_id"] == story_id):
                    archive_points.setdefault(row["story_id"], set()).add(row["location_id"])
            for archive_id, location_ids in archive_points.items():
                archive = db.get(Story, archive_id)
                # Never attach to, or alter, an independently created playable story.
                if archive is not None and not archive.data.get("reviewed_release_archive"):
                    continue
                if archive is None:
                    report["archive_links"] += 1
                    if apply:
                        db.add(Story(id=archive_id, name=archive_id + "（资料归档，未发布）", status="draft",
                                     data={"reviewed_release_archive": True, "playable": False}))
                        db.flush()
                for position, location_id in enumerate(sorted(location_ids), 1):
                    if db.get(CulturalLocation, location_id) is None:
                        report["archive_links"] += 1
                        if apply:
                            db.add(CulturalLocation(id=location_id, story_id=archive_id, name=location_id,
                                                   route_order=position, lat=0, lng=0, trigger_radius_m=1,
                                                   coordinates_verified=False,
                                                   data={"reviewed_release_archive": True, "coordinates_unavailable": True,
                                                         "playable": False}))
                            db.flush()
        for row in payload["records"]:
            if story_id and row["story_id"] != story_id:
                report["excluded"] += 1
                continue
            story = db.get(Story, row["story_id"])
            location = db.get(CulturalLocation, row["location_id"]) if row["location_id"] else None
            reason = None
            archived_dry_run = (not apply and include_archives and row["story_id"] in archive_points
                                and (story is None or story.data.get("reviewed_release_archive"))
                                and (location is None or location.story_id == row["story_id"]))
            if not archived_dry_run and (not story or not location or location.story_id != row["story_id"]):
                reason = "missing_or_mismatched_story_location"
            record = db.scalar(select(CulturalKnowledge).where(CulturalKnowledge.id == row["id"]).with_for_update())
            expected = {**row, "reviewed_at": datetime.fromisoformat(row["reviewed_at"]).astimezone(UTC).isoformat()}
            same = record is not None and record_values(record) == expected
            if reason is None and record is not None and not same:
                if record.review_status == "rejected":
                    reason = "rejected"
                elif record_values(record) != seed.get(row["id"]):
                    reason = "preserved_review_or_manual_edit_or_version_conflict"
            if reason:
                report["conflicts"].append({"id": row["id"], "reason": reason})
                continue
            needs_index = not same or not chunks_current(db, record)
            plans.append((row, record, same, needs_index))
        for row, record, same, needs_index in plans:
            report["unchanged" if same else "restored"] += 1
            if not apply:
                continue
            if not same:
                if record is None:
                    record = CulturalKnowledge(id=row["id"])
                    db.add(record)
                for field, value in row.items():
                    setattr(record, field, datetime.fromisoformat(value) if field == "reviewed_at" else value)
                db.flush()
            if needs_index:
                report["indexed"] += rebuild_knowledge(db, record, AISettings())
        # No changes are staged at all in dry-run mode.
    report["conflict_count"] = len(report["conflicts"])
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True, type=Path)
    parser.add_argument("--database-url", required=True, help="Explicit target database; never inferred from .env")
    parser.add_argument("--story-id")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--include-archives", action="store_true", help="Create unpublished reference-only links for six archived records")
    args = parser.parse_args()
    payload = load_release(args.release)
    engine = make_engine(args.database_url)
    try:
        with Session(engine) as db:
            print(json.dumps(restore_release(db, payload, apply=args.apply, story_id=args.story_id, include_archives=args.include_archives), ensure_ascii=False, indent=2))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
