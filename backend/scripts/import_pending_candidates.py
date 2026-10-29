"""Insert a vetted-format Suzhou candidate pack as pending records only.

Dry-run by default. This script never changes an existing knowledge record or
creates an index; human review remains an independent admin action.
"""

import argparse
import ipaddress
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.ai.rag.retrieval import fingerprint  # noqa: E402
from app.core.database import make_engine  # noqa: E402
from app.models import CulturalKnowledge, CulturalLocation, Story  # noqa: E402

STORY_ID = "suzhou-pingjiang"
STATIONS = frozenset({"pingjiang", "ouyuan", "shizilin", "subo", "zhuozhengyuan"})
CONTENT_TYPES = frozenset({"fact", "disputed", "legend", "fiction"})
ROW_FIELDS = ("story_id", "location_id", "title", "content", "content_type",
              "source", "source_url", "license", "tags")
ATTRIBUTION = ("collection_method", "collection_model", "source_title", "publisher",
               "accessed_at", "source_locator", "source_access", "source_access_note")


def _required_text(value: object, label: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"{label}: missing or invalid text")
    return value


def _valid_source_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port  # Access rejects non-numeric and out-of-range ports.
        if not hostname or parsed.username is not None or parsed.password is not None:
            return False
        host = hostname.encode("idna").decode("ascii")
        if ":" in host:
            ipaddress.IPv6Address(host)
        elif re.fullmatch(r"[0-9]+(?:\.[0-9]+){3}", host):
            ipaddress.IPv4Address(host)
        elif (len(host) > 253 or not all(
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
            for label in host.rstrip(".").split(".")
        )):
            return False
    except (UnicodeError, ValueError):
        return False
    return (parsed.scheme in {"http", "https"} and port != 0
            and not any(char.isspace() for char in value))


def load_candidates(path: Path) -> list[dict]:
    pack = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(pack, dict) or pack.get("schema_version") != "suzhou-pending-candidates-v1"
            or pack.get("user_review_required") is not True or not isinstance(pack.get("records"), list)
            or not pack["records"]):
        raise ValueError("candidate pack structure invalid")
    ids: set[str] = set()
    bodies: set[str] = set()
    for index, row in enumerate(pack["records"]):
        if not isinstance(row, dict):
            raise ValueError(f"record {index}: invalid object")
        identifier = row.get("id")
        if not isinstance(identifier, str) or identifier in ids:
            raise ValueError(f"record {index}: invalid or duplicate ID")
        if row.get("story_id") != STORY_ID or row.get("location_id") not in STATIONS:
            raise ValueError(f"{identifier}: invalid story or station")
        if (len(identifier) > 100 or not re.fullmatch(
            rf"kn-sz-{row['location_id']}-[a-z0-9]+(?:-[a-z0-9]+)*", identifier
        )):
            raise ValueError(f"{identifier}: invalid candidate ID for station")
        ids.add(identifier)
        for field, limit in {"title": 200, "content": 30000, "source": 1000,
                             "source_url": 2000, "license": 1000}.items():
            _required_text(row.get(field), f"{identifier}.{field}", limit)
        if row.get("content_type") not in CONTENT_TYPES:
            raise ValueError(f"{identifier}: invalid content type")
        if any("待补充" in row[field] for field in ("source", "license")):
            raise ValueError(f"{identifier}: incomplete attribution")
        if not _valid_source_url(row["source_url"]):
            raise ValueError(f"{identifier}: invalid source URL")
        if (row.get("review_status") != "pending" or row.get("trust_level") != "unverified"
                or row.get("reviewer") is not None or row.get("reviewed_at") is not None
                or row.get("is_demo") is not False or type(row.get("version")) is not int
                or row["version"] != 1):
            raise ValueError(f"{identifier}: candidate must be pending without review")
        tags = row.get("tags")
        if not isinstance(tags, list) or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
            raise ValueError(f"{identifier}: invalid tags")
        metadata = row.get("metadata_json")
        if not isinstance(metadata, dict):
            raise ValueError(f"{identifier}: invalid metadata")
        if type(metadata.get("min_chapter")) is not int or metadata["min_chapter"] != 1:
            raise ValueError(f"{identifier}: invalid chapter")
        for field in ATTRIBUTION:
            _required_text(metadata.get(field), f"{identifier}.metadata_json.{field}", 2000)
        if (metadata["collection_model"] != "gpt-6-luna"
                or metadata["source_access"] not in {"readable_primary", "readable_secondary"}):
            raise ValueError(f"{identifier}: invalid collection provenance")
        for field in ("caveats", "review_checkpoints"):
            values = metadata.get(field)
            if (not isinstance(values, list) or not values
                    or any(not isinstance(value, str) or not value.strip() for value in values)):
                raise ValueError(f"{identifier}: incomplete {field}")
        json.dumps(metadata, allow_nan=False)
        if "sha256" in metadata and metadata["sha256"] != fingerprint(row["content"]):
            raise ValueError(f"{identifier}: invalid content digest")
        digest = fingerprint(row["content"])
        if digest in bodies:
            raise ValueError(f"{identifier}: duplicate content in pack")
        bodies.add(digest)
    return pack["records"]


def import_candidates(path: Path, database_url: str, *, apply: bool = False) -> dict:
    """Validate the entire pack and database state before any insert."""
    rows = load_candidates(path)
    url = make_url(database_url)
    if (url.get_backend_name() == "sqlite" and url.database != ":memory:"
            and (url.database is None or not Path(url.database).is_file())):
        raise ValueError("database file does not exist")
    engine = make_engine(database_url)
    try:
        with Session(engine) as db, db.begin():
            # A SQLite write reservation keeps validation and inserts in one serial batch.
            if apply and engine.dialect.name == "sqlite":
                db.connection().exec_driver_sql("BEGIN IMMEDIATE")
            if db.get(Story, STORY_ID) is None:
                raise ValueError("Suzhou story missing from database")
            locations = {location.id: location for location in db.scalars(select(CulturalLocation))}
            for row in rows:
                location = locations.get(row["location_id"])
                if location is None or location.story_id != STORY_ID:
                    raise ValueError(f"{row['id']}: station missing or belongs to another story")
            existing = list(db.scalars(select(CulturalKnowledge)))
            by_id = {row.id: row for row in existing}
            by_body = {fingerprint(row.content): row.id for row in existing}
            new_rows = []
            skipped = 0
            for row in rows:
                current = by_id.get(row["id"])
                if current is not None:
                    if any(getattr(current, field) != row[field] for field in ROW_FIELDS):
                        raise ValueError(f"{row['id']}: ID collision with different content or attribution")
                    skipped += 1
                    continue
                other_id = by_body.get(fingerprint(row["content"]))
                if other_id is not None:
                    raise ValueError(f"{row['id']}: duplicate content already stored as {other_id}")
                new_rows.append(CulturalKnowledge(
                    id=row["id"], story_id=STORY_ID, location_id=row["location_id"],
                    title=row["title"], content=row["content"], content_type=row["content_type"],
                    source=row["source"], source_url=row["source_url"], license=row["license"],
                    tags=row["tags"], metadata_json=row["metadata_json"],
                    review_status="pending", trust_level="unverified", reviewer=None,
                    reviewed_at=None, is_demo=False, version=1,
                ))
            result = {"total": len(rows), "created": len(new_rows), "skipped": skipped,
                      "applied": apply, "stations": {station: sum(row["location_id"] == station for row in rows)
                                                   for station in sorted(STATIONS)}}
            if apply:
                db.add_all(new_rows)
                db.flush()
            return result
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        result = import_candidates(args.file, args.database_url, apply=args.apply)
    except Exception as error:  # noqa: BLE001 - command line must return failure without a partial success report.
        print(f"IMPORT_FAILED: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
