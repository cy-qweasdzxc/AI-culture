"""Import a small, previously checked Commons photo manifest; no scraping or image edits."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import PROJECT_ROOT  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    rows = json.loads(args.metadata.read_text(encoding="utf-8-sig"))
    names = {"pingjiang": "平江路", "ouyuan": "耦园", "shizilin": "狮子林", "zhuozhengyuan": "拙政园", "subo": "苏州博物馆"}
    output = []
    with httpx.Client(timeout=20, headers={"User-Agent": "CityStoryDemo/0.2 (https://github.com/cy-qweasdzxc/AI-culture)"}) as client:
        for row in rows:
            location_id = row["location_id"]
            if row.get("rights_status") != "metadata_checked" or location_id not in names:
                continue
            download = urlsplit(row["download_url"])
            source = urlsplit(row["source_url"])
            if download.scheme != "https" or download.hostname not in {"upload.wikimedia.org", "thumb.wikimedia.org"} or source.scheme != "https" or source.hostname != "commons.wikimedia.org":
                raise ValueError("Only checked Commons/CDN locations are allowed")
            if not row["author"] or not row["license_url"].startswith(("https://creativecommons.org/licenses/by/", "https://creativecommons.org/licenses/by-sa/", "https://creativecommons.org/publicdomain/")):
                raise ValueError("Redistribution license and attribution are required")
            if not args.apply:
                continue
            response = client.get(row["download_url"])
            response.raise_for_status()
            content = response.content
            if not content.startswith(b"\xff\xd8") or len(content) > 12_000_000:
                raise ValueError("Expected a bounded JPEG photograph")
            destination = PROJECT_ROOT / "frontend/public/assets/places" / (location_id + ".jpg")
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists() and destination.read_bytes() != content:
                raise ValueError("Refusing to overwrite an existing different asset")
            destination.write_bytes(content)
            output.append({"id": "commons-" + location_id, "city_id": "suzhou", "location_id": location_id,
                "url": "/assets/places/" + location_id + ".jpg", "title": names[location_id] + "实景照片",
                "caption": "Wikimedia 提供的等比缩略图；本项目未修改图像。照片不代表已核验游客入口。",
                "kind": "photograph", "source_url": row["source_url"], "author": row["author"],
                "license": row["license"], "license_url": row["license_url"],
                "attribution": row["file_title"] + " — " + row["author"] + " — " + row["license"],
                "redistributable": True, "review_status": "rights_verified",
                "sha256": hashlib.sha256(content).hexdigest(), "version": 1})
            if location_id == "subo":
                output[-1]["title"] = "苏州博物馆馆内展品照片（2016）"
                output[-1]["caption"] = "2016 年馆内展品旧照，并非建筑外景或当前展陈承诺。Wikimedia 等比缩略图；本项目未修改图像。"
    if args.apply:
        (PROJECT_ROOT / "data/demo/media.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (PROJECT_ROOT / "frontend/public/assets/places/credits.json").write_text(json.dumps({"license_scope": "Photographs retain their individual Creative Commons licenses; the code license is unchanged.", "assets": output}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS" if args.apply else "DRY_RUN", "photos": len(output), "modified_photos": 0}, ensure_ascii=True))


if __name__ == "__main__":
    main()
