"""Compile Alembic PostgreSQL DDL without connecting to a database."""
import io
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from alembic.config import Config

from alembic import command

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
# This address is deliberately never contacted. No secrets are needed for offline generation.
os.environ["DATABASE_URL"] = "postgresql+psycopg://offline@localhost/citystory"

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.models import entities  # noqa: E402,F401


def main() -> int:
    get_settings.cache_clear()
    output = io.StringIO()
    config = Config(str(BACKEND / "alembic.ini"), output_buffer=output)
    command.upgrade(config, "head", sql=True)
    ddl = output.getvalue()
    required = set(Base.metadata.tables) | {"knowledge_vectors", "alembic_version"}
    missing = sorted(name for name in required if f"CREATE TABLE {name} (" not in ddl)
    checks = {
        "all_expected_tables_emitted": not missing,
        "vector_extension_emitted": "CREATE EXTENSION IF NOT EXISTS vector" in ddl,
        "vector_dimension_constraint_emitted": "vector_dims(embedding) = dimension" in ddl,
        "vector_chunk_foreign_key_emitted": "REFERENCES knowledge_chunks(id) ON DELETE CASCADE" in ddl,
        "state_unique_user_emitted": "CONSTRAINT uq_journey_user UNIQUE (user_id)" in ddl,
        "both_revisions_emitted": "0001" in ddl and "0002" in ddl,
    }
    result = {
        "executed_at_utc": datetime.now(UTC).isoformat(),
        "verification": "offline_postgresql_ddl_compilation",
        "database_connected": False,
        "postgresql_execution_verified": False,
        "docker_deployment_verified": False,
        "expected_tables": sorted(required),
        "missing_tables": missing,
        "checks": checks,
        "passed": all(checks.values()),
    }
    destination = ROOT / "data/testsets"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "postgresql-migration.sql").write_text(ddl, encoding="utf-8")
    (destination / "postgresql-static-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
