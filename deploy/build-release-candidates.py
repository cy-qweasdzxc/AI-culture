"""Build candidate archives from an explicitly reviewed worktree, without private state.

Run: python deploy/build-release-candidates.py --output NEW_EMPTY_DIRECTORY
Requires a production build at frontend/dist/. Never overwrites existing outputs.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
ADDITIONS = (
    "run_demo.py", "backend/scripts/restore_reviewed_release.py",
    "backend/tests/test_reviewed_release.py", "backend/tests/test_standalone_launcher.py",
    "deploy/standalone-demo.md",
    "deploy/build-release-candidates.py",
)
BANNED_PARTS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache",
                ".runtime", ".cache", "test-results", "playwright-report", "browser-qa"}
BANNED_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".log", ".pdf", ".docx", ".pptx", ".xlsx", ".zip"}


def digest(content):
    return hashlib.sha256(content).hexdigest()


def allowed(name):
    path = Path(name)
    return (not set(path.parts) & BANNED_PARTS and path.suffix.lower() not in BANNED_SUFFIXES
            and not name.startswith(("docs/competition/", "data/testsets/results"))
            and not path.name.startswith(".env") or name == ".env.example")


def archive(path, entries, base, kind):
    manifest = {"schema": "citystory-candidate-files-v1", "kind": kind, "base_commit": base,
                "source": "reviewed worktree, including uncommitted hardening changes",
                "files": {name: {"sha256": digest(content), "bytes": len(content)}
                          for name, content in sorted(entries.items())}}
    with ZipFile(path, "x", compression=ZIP_DEFLATED, compresslevel=6) as package:
        for name, content in sorted(entries.items()):
            package.writestr(name, content)
        package.writestr("PACKAGE_MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return {"file": path.name, "sha256": digest(path.read_bytes()), "bytes": path.stat().st_size,
            "payload_files": len(entries)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents:
        parser.error("Output must be outside the source workspace")
    output.mkdir(parents=True, exist_ok=True)
    names = ("AI-culture-source-candidate.zip", "AI-culture-mock-demo-candidate.zip", "manifest.json", "checksums.sha256")
    if any((output / name).exists() for name in names):
        parser.error("Candidate files already exist; choose a new output directory")
    if not (ROOT / "frontend/dist/index.html").exists():
        parser.error("Run frontend production build before packaging")
    tracked = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.decode().split("\0")
    base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    files = sorted({name for name in [*tracked, *ADDITIONS] if name and allowed(name)})
    source = {name: (ROOT / name).read_bytes() for name in files}
    demo = {name: content for name, content in source.items() if (
        name == "run_demo.py" or name == "LICENSE" or name == "deploy/standalone-demo.md"
        or name == "frontend/licenses/coordtransform.txt"
        or (name.startswith("backend/") and not name.startswith("backend/tests/"))
        or name.startswith(("data/demo/", "data/suzhou/", "data/releases/", "data/templates/"))
    )}
    for item in (ROOT / "frontend/dist").rglob("*"):
        if item.is_file():
            demo["web/" + item.relative_to(ROOT / "frontend/dist").as_posix()] = item.read_bytes()
    # No private database, credentials, development environment or API key is copied.
    results = [archive(output / names[0], source, base, "source"),
               archive(output / names[1], demo, base, "prebuilt-mock-demo")]
    (output / "manifest.json").write_text(json.dumps({"schema": "citystory-candidates-v1", "base_commit": base,
                                                     "artifacts": results}, indent=2) + "\n", encoding="utf-8")
    (output / "checksums.sha256").write_text("".join(item["sha256"] + "  " + item["file"] + "\n" for item in results), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
