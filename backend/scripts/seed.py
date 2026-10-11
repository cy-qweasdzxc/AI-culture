"""Run after `alembic upgrade head`, from the backend directory."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal  # noqa: E402
from app.services.seed import seed_database  # noqa: E402

if __name__ == "__main__":
    with SessionLocal() as db:
        print(seed_database(db))
