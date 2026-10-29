# Standalone Mock Demo and controlled cultural restore

Requires Python 3.12+. First installation needs internet for pinned Python dependencies.
The prebuilt Demo ZIP contains web/; Node is not needed to run that package.
A source checkout needs Node 22+ once to run npm ci and npm run build in frontend/.

From the extracted package root:

    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -c backend/requirements.lock ./backend
    .\.venv\Scripts\python.exe run_demo.py --port 18088

Open http://127.0.0.1:18088 . The default model is Mock; retrieval is keyword-only.
No model, embedding, or Tencent key is needed. Maps loaded from external services
still need internet, and browser TTS depends on installed system voices.
macOS/Linux use .venv/bin/python; those hosts have not been validated in this round.

Ordinary startup does not approve knowledge. To explicitly restore the controlled,
previously human-approved release:

    .\.venv\Scripts\python.exe run_demo.py --port 18088 --include-reviewed-corpus --include-archives

--include-reviewed-corpus restores 131 Suzhou records by default.
--include-archives additionally creates unpublished reference-only associations for
six Hangzhou/Nanjing records, restoring all 137. It adds no playable cities or routes.
The release is pinned by a source-controlled SHA-256 (CRLF normalized to LF) and per-record hashes.
Existing rejected, withdrawn, changed, or newer records are preserved and conflicts
are reported. Exact untouched demo seed rows can be upgraded; unrelated user state
is not changed. Repeating the command does not duplicate current keyword chunks.

State and generated private credentials live only in .runtime/. Never share that
directory. No checkout .env or external production database is read by the launcher.
The runtime binds to loopback by default; LAN requires explicit --lan. It does not
change firewall rules. Virtual touring never requires GPS; real GPS usually needs HTTPS.

Stop with Ctrl+C, or from the same extracted root:

    .\.venv\Scripts\python.exe run_demo.py --stop

The stop request uses a private local control token and never kills unrelated processes.
Restart with the same command to retain sessions, journey progress and review decisions.
For a separate independent instance, use --runtime-name example and a distinct
--port; use the same runtime name when stopping. Do not delete .runtime/ to restart.

The administrator restoration CLI is separate from Seed:

    cd backend
    ..\.venv\Scripts\python.exe scripts/restore_reviewed_release.py --release ../data/releases/cultural-knowledge-reviewed-20261029.json --database-url sqlite:///../isolated.db --include-archives

This is dry-run by default and requires an already migrated, initialized database.
Add --apply to write. It also supports an explicit PostgreSQL SQLAlchemy URL.
Do not put passwords in public logs. No paid embeddings are generated.

Street maps receive approximately converted WGS-84 display coordinates. Tencent
keeps the original GCJ-02 values. Coordinates are not surveyed entrances or task
arrival proofs. The OSM iframe shows the selected point; the local diagram and
50-place list remain the multi-point fallback. OSM content availability is external.

Audio: original Ogg and AAC/M4A conversion of the same Charlie Huang performance,
both under CC BY-SA 3.0. Attribution, change notes and hashes are in
assets/audio/LICENSE.json and LICENSE.txt in the built web directory.
Music starts only after a gesture and releases its source when turned off.

Acceptance status for real phones, real map services and paid models must be reported
separately from Chromium/WebKit simulation. Firefox is excluded at the user's request.
