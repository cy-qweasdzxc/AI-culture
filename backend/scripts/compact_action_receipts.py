"""Remove obsolete snapshot copies from legacy receipts. Default is a read-only plan."""
import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal  # noqa: E402
from app.models import ActionReceipt  # noqa: E402


def compact_receipts(db: Session, *, apply: bool = False) -> dict:
    rows = candidates = before = after = 0
    for receipt in db.scalars(select(ActionReceipt).execution_options(yield_per=100)):
        rows += 1
        original = receipt.response
        compact = {key: value for key, value in original.items() if key != "snapshot"}
        before += len(json.dumps(original, ensure_ascii=False).encode())
        after += len(json.dumps(compact, ensure_ascii=False).encode())
        if "snapshot" in original:
            candidates += 1
            if apply:
                receipt.response = compact
        if apply and rows % 100 == 0:
            db.flush()
    if apply:
        db.commit()
    return {"applied": apply, "rows": rows, "candidates": candidates,
            "payload_bytes_before": before, "payload_bytes_after": after}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="备份后显式执行，仅删除回执内可重建的 snapshot 副本")
    args = parser.parse_args()
    with SessionLocal() as db:
        print(json.dumps(compact_receipts(db, apply=args.apply), ensure_ascii=False))


if __name__ == "__main__":
    main()
