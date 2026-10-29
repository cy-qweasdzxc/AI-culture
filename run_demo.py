"""Isolated prebuilt Mock Demo, adapted from the reviewed competition run_demo.py.

Install first: python -m pip install -c backend/requirements.lock ./backend
Run: python run_demo.py [--include-reviewed-corpus] [--include-archives] [--port 18088]
Stop: Ctrl+C, or python run_demo.py --stop. Runtime state remains in .runtime/.
A frontend build must exist in web/ (delivery) or frontend/dist/ (source checkout).
"""
import argparse
import hmac
import json
import os
import re
import secrets
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
RUNTIME = ROOT / ".runtime"


def spa_fallback(path: str) -> bool:
    """Starlette emits OS-specific static paths; never turn an API 404 into HTML."""
    route = path.replace('\\', "/").lstrip("/")
    return route != "api" and not route.startswith(("api/", "__demo_")) and "." not in Path(route).name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18088)
    parser.add_argument("--lan", action="store_true", help="Explicitly listen on the local network; no firewall changes")
    parser.add_argument("--include-reviewed-corpus", action="store_true")
    parser.add_argument("--include-archives", action="store_true", help="Also restore six unpublished reference-only archive records")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--runtime-name", default="", help="Optional isolated runtime name: letters, digits, underscore, hyphen")
    args = parser.parse_args()
    if sys.version_info < (3, 12) or not 1024 <= args.port <= 65535:
        parser.error("Python 3.12+ and a port between 1024 and 65535 are required")
    if args.runtime_name and not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", args.runtime_name):
        parser.error("Invalid runtime name")
    runtime = RUNTIME / args.runtime_name if args.runtime_name else RUNTIME
    private = runtime / "private-config.json"
    marker = runtime / "server.json"
    if args.stop:
        if not marker.exists():
            print("Demo is already stopped; saved data is unchanged.")
            return
        values = json.loads(private.read_text(encoding="utf-8"))
        state = json.loads(marker.read_text(encoding="utf-8"))
        request = urllib.request.Request(f"http://127.0.0.1:{state['port']}/__demo_stop", method="POST",
                                         headers={"Authorization": "Bearer " + values["CONTROL_TOKEN"]})
        try:
            # Never send a private control token through a system proxy.
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=5) as response:
                if response.status != 200:
                    raise SystemExit("Could not verify the running Demo; no process was killed.")
        except (OSError, urllib.error.URLError):
            raise SystemExit("Demo did not answer; saved data and other processes were left untouched.") from None
        print("Requested graceful stop of this Demo only.")
        return
    web = ROOT / "web" if (ROOT / "web/index.html").exists() else ROOT / "frontend/dist"
    if not (web / "index.html").exists():
        raise SystemExit("Prebuilt frontend missing. In a source checkout, first run npm ci and npm run build in frontend/.")
    with socket.socket() as probe:
        try:
            probe.bind(("0.0.0.0" if args.lan else "127.0.0.1", args.port))
        except OSError:
            raise SystemExit("Selected port is occupied; no process was stopped. Use --port with another value.") from None
    runtime.mkdir(parents=True, exist_ok=True)
    if not private.exists():
        with private.open("x", encoding="utf-8") as stream:
            json.dump({key: secrets.token_hex(32) for key in
                       ("SESSION_SECRET", "ADMIN_JWT_SECRET", "ADMIN_PASSWORD", "CONTROL_TOKEN")}, stream)
        private.chmod(0o600)
    values = json.loads(private.read_text(encoding="utf-8"))
    if not all(isinstance(values.get(k), str) and len(values[k]) >= 32 for k in
               ("SESSION_SECRET", "ADMIN_JWT_SECRET", "ADMIN_PASSWORD", "CONTROL_TOKEN")):
        raise SystemExit("Invalid private runtime configuration; preserve it and use a fresh extraction.")
    database = runtime / "demo.db"
    for key, value in {**{k: v for k, v in values.items() if k != "CONTROL_TOKEN"},
                       "APP_ENV": "development", "DATABASE_URL": "sqlite:///" + database.as_posix(),
                       "ADMIN_USERNAME": "admin", "SESSION_COOKIE": "citystory_demo_" + values["SESSION_SECRET"][:12],
                       "SESSION_COOKIE_SECURE": "false", "LLM_PROVIDER": "mock", "LLM_API_KEY": "",
                       "EMBEDDING_PROVIDER": "none", "EMBEDDING_API_KEY": "", "TMAP_WEB_SERVICE_KEY": "",
                       "CORS_ORIGINS": f"http://localhost:{args.port},http://127.0.0.1:{args.port}"}.items():
        os.environ[key] = value
    sys.path.insert(0, str(BACKEND))
    try:
        import uvicorn
        from alembic.config import Config
        from fastapi import Request
        from fastapi.responses import JSONResponse
        from sqlalchemy.orm import Session
        from starlette.exceptions import HTTPException
        from starlette.staticfiles import StaticFiles

        from alembic import command
        from app.core.config import Settings, get_settings
        # Explicitly ignore checkout/private .env files; only this isolated config applies.
        Settings.model_config["env_file"] = None
        get_settings.cache_clear()
        from app.core.database import make_engine
        from app.services.seed import seed_database
        from scripts.restore_reviewed_release import load_release, restore_release
    except ImportError:
        raise SystemExit("Install dependencies first: python -m pip install -c backend/requirements.lock ./backend") from None
    initialized = runtime / "initialized.json"
    if database.exists() and not initialized.exists():
        raise SystemExit("Existing demo.db has no initialization marker. It was preserved; use a fresh extraction directory.")
    release = ROOT / "data/releases/cultural-knowledge-reviewed-20261029.json"

    def restore(engine):
        with Session(engine) as db:
            report = restore_release(db, load_release(release), apply=True, include_archives=args.include_archives,
                                     story_id=None if args.include_archives else "suzhou-pingjiang")
        print(json.dumps(report, ensure_ascii=False), flush=True)

    if not database.exists():
        temporary = runtime / ("initializing-" + uuid4().hex + ".db")
        engine = make_engine("sqlite:///" + temporary.as_posix())
        try:
            config = Config(str(BACKEND / "alembic.ini"))
            config.set_main_option("script_location", str(BACKEND / "alembic"))
            with engine.begin() as connection:
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
            with Session(engine) as db:
                seed_database(db, auto_publish=False)
            if args.include_reviewed_corpus:
                restore(engine)
        except BaseException:
            engine.dispose()
            # A failed temporary initialization is retained for diagnosis, never published.
            raise
        engine.dispose()
        temporary.replace(database)
        initialized.write_text(json.dumps({"schema": 1, "isolated": True}), encoding="utf-8")
    elif args.include_reviewed_corpus:
        engine = make_engine("sqlite:///" + database.as_posix())
        try:
            restore(engine)
        finally:
            engine.dispose()
    from app.main import app

    class SPAFiles(StaticFiles):
        async def get_response(self, path, scope):
            try:
                return await super().get_response(path, scope)
            except HTTPException as error:
                if error.status_code == 404 and spa_fallback(path):
                    return await super().get_response("index.html", scope)
                raise

    server = uvicorn.Server(uvicorn.Config(app, host="0.0.0.0" if args.lan else "127.0.0.1",
                                           port=args.port, log_level="warning", timeout_graceful_shutdown=5))

    async def stop(request: Request):
        token = request.headers.get("authorization", "")
        if request.client.host not in {"127.0.0.1", "::1"} or not hmac.compare_digest(token, "Bearer " + values["CONTROL_TOKEN"]):
            return JSONResponse({"error": "forbidden"}, status_code=403)
        server.should_exit = True
        return JSONResponse({"stopping": True})

    app.add_api_route("/__demo_stop", stop, methods=["POST"], include_in_schema=False)
    app.mount("/", SPAFiles(directory=web, html=True), name="demo-web")
    marker.write_text(json.dumps({"port": args.port, "pid": os.getpid()}), encoding="utf-8")
    print(f"Mock Demo: http://127.0.0.1:{args.port} — keyword retrieval; no paid models.", flush=True)
    print("Stop with Ctrl+C or python run_demo.py --stop. Keep .runtime/ private.", flush=True)
    try:
        server.run()
    finally:
        marker.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
