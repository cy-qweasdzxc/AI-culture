from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from sqlalchemy import select

from app.ai.rag.index import approved_records
from app.core.config import get_settings
from app.core.rate_limit import _buckets, _lock
from app.models import CulturalKnowledge, KnowledgeChunk


@pytest.fixture
def admin_config(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "fixture-admin-password")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "test-admin-secret-private-fixture-32-chars")
    monkeypatch.setenv("EMBEDDING_PROVIDER", "none")
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    get_settings.cache_clear()
    with _lock:
        _buckets.clear()
    yield
    get_settings.cache_clear()
    with _lock:
        _buckets.clear()


def login(client):
    response = client.post("/api/admin/login", json={"username": "admin", "password": "fixture-admin-password"})
    assert response.status_code == 200, response.text
    return response


def knowledge_body():
    return {"id": "fixture-authored", "location_id": "pingjiang", "title": "合成古桥资料",
            "content": "古桥是合成工程测试剧情中的石桥，并非真实史实。", "content_type": "fiction",
            "source": "人工编写的合成测试夹具", "source_url": "https://example.invalid/fixture",
            "license": "仅用于工程测试，不作为真实授权凭证"}


def create_review_publish(client):
    body = knowledge_body()
    created = client.post("/api/admin/knowledge", json=body)
    assert created.status_code == 201, created.text
    reviewed = client.post("/api/admin/knowledge/fixture-authored/review", json={"version": 1, "status": "reviewed", "reviewer": "合成测试审核员", "confirm_sources": True})
    assert reviewed.status_code == 200, reviewed.text
    published = client.post("/api/admin/knowledge/fixture-authored/publish")
    assert published.status_code == 200, published.text
    return reviewed.json()


def test_admin_api_denies_unauthenticated_reads_and_writes(client, admin_config):
    for path in ["/api/admin/me", "/api/admin/knowledge", "/api/admin/metrics", "/api/admin/characters", "/api/admin/story", "/api/admin/dialogues", "/api/admin/tests"]:
        response = client.get(path)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "ADMIN_UNAUTHORIZED"
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 401
    assert client.patch("/api/admin/tasks/task-shuangqipan", json={"title": "伪造", "briefing": "伪造"}).status_code == 401


def test_public_default_signing_key_cannot_authenticate_forged_admin(client, admin_config, monkeypatch):
    public_default = "development-admin-secret-change-before-deployment"
    monkeypatch.setenv("ADMIN_JWT_SECRET", public_default)
    get_settings.cache_clear()
    forged = jwt.encode({"sub": "admin", "role": "admin", "exp": datetime.now(UTC) + timedelta(hours=1)},
                        public_default, algorithm="HS256")
    headers = {"Authorization": "Bearer " + forged}
    for path in ["/api/admin/me", "/api/admin/metrics", "/api/admin/knowledge", "/api/admin/story", "/api/admin/tests"]:
        response = client.get(path, headers=headers)
        assert response.status_code == 503 and response.json()["error"]["code"] == "ADMIN_NOT_CONFIGURED"
    denied_write = client.post("/api/admin/knowledge", json=knowledge_body(), headers=headers)
    assert denied_write.status_code == 503
    assert client.post("/api/admin/login", json={"username": "admin", "password": "fixture-admin-password"}).status_code == 503


def test_admin_login_cookie_logout_and_forged_token(client, admin_config):
    rejected = client.post("/api/admin/login", json={"username": "admin", "password": "incorrect"})
    assert rejected.status_code == 401
    response = login(client)
    assert "HttpOnly" in response.headers["set-cookie"] and "SameSite=strict" in response.headers["set-cookie"]
    assert client.get("/api/admin/me").json()["username"] == "admin"
    assert client.get("/api/admin/me", headers={"Authorization": "Bearer forged"}).status_code == 401
    assert client.post("/api/admin/logout").status_code == 200
    assert client.get("/api/admin/me").status_code == 401


@pytest.mark.parametrize("credentials", [
    {"username": "无效管理员", "password": "fixture-admin-password"},
    {"username": "admin", "password": "错误密码"},
])
def test_unicode_invalid_admin_credentials_are_unauthorized(client, admin_config, credentials):
    response = client.post("/api/admin/login", json=credentials)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ADMIN_UNAUTHORIZED"
    assert client.get("/api/admin/me").status_code == 401


def test_unicode_configured_admin_can_login_and_logout(client, admin_config, monkeypatch):
    monkeypatch.setenv("ADMIN_USERNAME", "工程管理员")
    monkeypatch.setenv("ADMIN_PASSWORD", "仅供合成测试的中文密码")
    get_settings.cache_clear()
    response = client.post("/api/admin/login", json={
        "username": "工程管理员", "password": "仅供合成测试的中文密码",
    })
    assert response.status_code == 200
    assert client.get("/api/admin/me").json()["username"] == "工程管理员"
    assert client.post("/api/admin/logout").status_code == 200
    assert client.get("/api/admin/me").status_code == 401


def test_login_unconfigured_is_explicit_and_does_not_accept_empty_password(client, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "")
    get_settings.cache_clear()
    try:
        response = client.post("/api/admin/login", json={"username": "admin", "password": ""})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "ADMIN_NOT_CONFIGURED"
    finally:
        get_settings.cache_clear()


def test_retrieval_test_endpoint_selects_mode_and_reports_configuration(client, admin_config):
    """The admin retrieval probe must expose the arm it ran and the parameters used."""
    login(client)
    create_review_publish(client)
    payload = {"query": "古桥", "location_id": "pingjiang", "chapter": 1}
    keyword = client.post("/api/admin/retrieval/test", json=payload)
    assert keyword.status_code == 200, keyword.text
    body = keyword.json()
    assert body["mode"] == "keyword" and body["requestedMode"] == "keyword"
    assert body["corpusCount"] == 1 and body["limit"] == 4
    assert body["embeddingModel"] == "" and body["embeddingError"] is None
    assert isinstance(body["elapsedMs"], (int, float))
    assert body["retrievalConfig"]["lexical_min_score"] == 0.12
    assert body["retrievalConfig"]["vector_min_score"] == 0.65
    assert body["items"][0]["id"] == "fixture-authored"
    assert body["items"][0]["lexicalScore"] > 0
    assert body["items"][0]["vectorScore"] == 0.0
    assert body["items"][0]["type"] == "fiction"

    # No embedding provider is configured here, so the hybrid arm degrades to lexical
    # and must say so rather than silently reporting a vector run.
    hybrid = client.post("/api/admin/retrieval/test", json=payload | {"mode": "hybrid"})
    assert hybrid.status_code == 200, hybrid.text
    assert hybrid.json()["mode"] == "keyword" and hybrid.json()["requestedMode"] == "hybrid"

    # The pure vector arm cannot run without a query vector: it fails loudly.
    vector = client.post("/api/admin/retrieval/test", json=payload | {"mode": "vector"})
    assert vector.status_code == 503
    assert vector.json()["error"]["code"] == "EMBEDDING_UNAVAILABLE"


def test_vector_mode_failure_is_not_reported_as_a_successful_vector_run(client, admin_config, monkeypatch):
    """A provider outage must surface as 503, never as an empty vector result set."""
    login(client)
    create_review_publish(client)
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai-compatible")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("EMBEDDING_MODEL", "fixture-embedding")
    monkeypatch.setenv("EMBEDDING_API_KEY", "fixture-key")
    monkeypatch.setenv("AI_TIMEOUT_SECONDS", "2")
    get_settings.cache_clear()
    response = client.post("/api/admin/retrieval/test",
                           json={"query": "古桥", "location_id": "pingjiang", "chapter": 1, "mode": "vector"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "EMBEDDING_UNAVAILABLE"
    # hybrid degrades to keyword and reports the provider error instead of hiding it
    hybrid = client.post("/api/admin/retrieval/test",
                         json={"query": "古桥", "location_id": "pingjiang", "chapter": 1, "mode": "hybrid"})
    assert hybrid.status_code == 200
    assert hybrid.json()["mode"] == "keyword"
    assert hybrid.json()["embeddingError"]


def test_pending_cannot_publish_and_review_requires_sources(client, admin_config, db):
    login(client)
    body = knowledge_body() | {"source_url": "", "license": "【待补充】"}
    assert client.post("/api/admin/knowledge", json=body).status_code == 201
    assert client.post("/api/admin/knowledge/fixture-authored/publish").json()["error"]["code"] == "KNOWLEDGE_UNREVIEWED"
    review = client.post("/api/admin/knowledge/fixture-authored/review", json={"version": 1, "status": "reviewed", "reviewer": "合成审核员", "confirm_sources": True})
    assert review.status_code == 409 and review.json()["error"]["code"] == "SOURCE_REVIEW_REQUIRED"
    assert db.get(CulturalKnowledge, "fixture-authored").review_status == "pending"


@pytest.mark.parametrize("reviewer", ["  ", "system-auto-publish", "【待确认】审核人"])
def test_review_requires_a_real_non_placeholder_identity(client, admin_config, reviewer):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    response = client.post("/api/admin/knowledge/fixture-authored/review", json={
        "version": 1, "status": "reviewed", "reviewer": reviewer, "confirm_sources": True,
    })
    assert response.status_code == 422
    assert client.get("/api/admin/knowledge").json()["items"][0]  # authenticated request remains usable
    assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 409


@pytest.mark.parametrize("url", ["https://[invalid", "https://user:fixture@example.invalid/", "https://example.invalid:99999/"])
def test_malformed_source_url_cannot_crash_or_authorize_review(client, admin_config, url):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body() | {"source_url": url}).status_code == 201
    response = client.post("/api/admin/knowledge/fixture-authored/review", json={
        "version": 1, "status": "reviewed", "reviewer": "合成测试审核员", "confirm_sources": True,
    })
    assert response.status_code == 409, response.text
    assert client.post("/api/admin/knowledge/fixture-authored/publish").status_code == 409


def test_legacy_unverified_review_cannot_report_successful_publication(client, db, admin_config):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    row = db.get(CulturalKnowledge, "fixture-authored")
    row.review_status, row.reviewer = "reviewed", "合成测试署名"
    db.commit()
    response = client.post("/api/admin/knowledge/fixture-authored/publish")
    assert response.status_code == 409
    assert approved_records(db, "suzhou-pingjiang") == []
    assert approved_records(db, "suzhou-pingjiang") == []


def test_review_publish_retrieve_and_edit_revokes_old_index(client, admin_config, db):
    login(client)
    reviewed = create_review_publish(client)
    assert reviewed["review_status"] == "reviewed" and reviewed["version"] == 2
    assert [r.knowledge_id for r in approved_records(db, "suzhou-pingjiang")] == ["fixture-authored"]
    retrieval = client.post("/api/admin/retrieval/test", json={"query": "古桥", "location_id": "pingjiang"}).json()
    assert [item["id"] for item in retrieval["items"]] == ["fixture-authored"]
    assert client.post("/api/admin/retrieval/test", json={"query": "古桥", "location_id": "ouyuan"}).json()["items"] == []
    edited = client.put("/api/admin/knowledge/fixture-authored", json=knowledge_body() | {"version": 2, "content": "古桥第二版合成剧情资料"})
    assert edited.status_code == 200 and edited.json()["review_status"] == "pending"
    db.expire_all()
    assert db.get(CulturalKnowledge, "fixture-authored").version == 3
    assert db.scalar(select(KnowledgeChunk).where(KnowledgeChunk.knowledge_id == "fixture-authored")) is None
    assert approved_records(db, "suzhou-pingjiang") == []
    stale = client.put("/api/admin/knowledge/fixture-authored", json=knowledge_body() | {"version": 2})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "CONTENT_CONFLICT"


def test_admin_duplicate_content_and_unconfirmed_review_rejected(client, admin_config):
    login(client)
    assert client.post("/api/admin/knowledge", json=knowledge_body()).status_code == 201
    duplicate = client.post("/api/admin/knowledge", json=knowledge_body() | {"id": "fixture-duplicate"})
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "KNOWLEDGE_DUPLICATE"
    review = client.post("/api/admin/knowledge/fixture-authored/review", json={"version": 1, "status": "reviewed", "reviewer": "合成审核员", "confirm_sources": False})
    assert review.json()["error"]["code"] == "SOURCE_REVIEW_REQUIRED"


def test_rejection_revokes_published_chunks(client, admin_config, db):
    login(client)
    create_review_publish(client)
    rejected = client.post("/api/admin/knowledge/fixture-authored/review", json={"version": 2, "status": "rejected", "reviewer": "合成审核员"})
    assert rejected.status_code == 200 and rejected.json()["review_status"] == "rejected"
    assert approved_records(db, "suzhou-pingjiang") == []


def test_feedback_is_owned_by_session_and_npc(client, started):
    arrival = client.post("/api/location/trigger", json={"journey_id": started["journeyId"], "state_version": started["stateVersion"], "spot_id": "pingjiang"}).json()["snapshot"]
    chat = client.post("/api/chat/message", json={"journey_id": arrival["journeyId"], "state_version": arrival["stateVersion"], "request_id": str(uuid4()), "npc_id": "zhou-bo", "message": "你好"}).json()
    body = {"journey_id": arrival["journeyId"], "npc_id": "zhou-bo", "message_id": chat["message_id"], "reason": "合成测试纠错"}
    assert client.post("/api/chat/feedback", json=body | {"npc_id": "xiao-shen"}).status_code == 404
    assert client.post("/api/chat/feedback", json=body).status_code == 200
    client.cookies.clear()
    client.post("/api/session")
    other = client.post("/api/journeys/start", json={"role_id": "wanderer", "mode": "virtual"}).json()["snapshot"]
    assert client.post("/api/chat/feedback", json=body | {"journey_id": other["journeyId"]}).status_code == 404
    assert client.post("/api/chat/feedback", json=body).status_code == 404


def test_admin_metrics_and_basic_configuration_are_database_backed(client, admin_config):
    login(client)
    metrics = client.get("/api/admin/metrics").json()
    assert metrics["knowledge"] == 24 and metrics["reviewedKnowledge"] == metrics["chunks"] == 0
    assert metrics["source"] == "database_counts" and metrics["performance"] is None
    edited = client.patch("/api/admin/characters/zhou-bo", json={"name": "合成测试周伯", "greeting": "测试欢迎语", "knowledge_scope": "测试范围", "personality": ["合成"]})
    assert edited.status_code == 200 and edited.json()["data"]["name"] == "合成测试周伯"
    task = client.patch("/api/admin/tasks/task-shuangqipan", json={"title": "合成测试标题", "briefing": "合成测试说明"})
    assert task.status_code == 200 and task.json()["data"]["title"] == "合成测试标题"
