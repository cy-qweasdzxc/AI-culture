def test_catalog_preserves_playability_boundaries(client):
    cities = client.get("/api/cities").json()["items"]
    assert len(cities) == 6
    assert {c["id"] for c in cities if c["status"] == "open"} == {"suzhou", "hangzhou", "nanjing"}
    routes = client.get("/api/cities/suzhou/routes").json()["items"]
    classic = next(r for r in routes if r["id"] == "suzhou-classic")
    assert classic["playable"] and len(classic["stops"]) == 5
    garden = next(r for r in routes if r["id"] == "suzhou-garden-stones")
    assert garden["playable"] and [s["id"] for s in garden["stops"]] == ["ouyuan", "shizilin", "zhuozhengyuan"]
    assert all(not r["playable"] for r in routes if r["id"] not in {"suzhou-classic", "suzhou-garden-stones"})
    assert client.get("/api/cities/missing").status_code == 404
    for city in ["beijing", "xian", "chengdu"]:
        previews = client.get(f"/api/cities/{city}/places").json()["items"]
        assert len(previews) == 3
        assert all(p["status"] == "building" and p["coordinates"] is None and p["source_url"].startswith("https://") for p in previews)
        assert client.get(f"/api/cities/{city}/routes").json()["items"] == []


def test_five_stations_have_honest_media_status(client, monkeypatch):
    for place in ["pingjiang", "ouyuan", "shizilin", "zhuozhengyuan", "subo"]:
        items = client.get(f"/api/places/{place}/media").json()["items"]
        assert items
        for item in items:
            if not item["displayable"]:
                assert item["url"] is None
            assert item["cultural_review"] == "not_implied"
    from app.core.config import get_settings
    monkeypatch.setenv("ADMIN_PASSWORD", "synthetic-private-password")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "synthetic-admin-signing-secret-at-least-32-characters")
    get_settings.cache_clear()
    try:
        assert client.get("/api/admin/media").status_code == 401
    finally:
        get_settings.cache_clear()


def test_new_city_routes_are_virtual_playable_and_source_review_is_pending(client):
    for city_id, route_id, story_id, stop_count in (
        ("hangzhou", "hangzhou-xihu-classic", "hangzhou-xihu", 3),
        ("nanjing", "nanjing-zhongshan-classic", "nanjing-zhongshan", 3),
    ):
        route = next(r for r in client.get(f"/api/cities/{city_id}/routes").json()["items"] if r["id"] == route_id)
        assert route["playable"] and route["story_id"] == story_id and route["onsite_ready"] is False
        assert len(route["stops"]) == stop_count
        assert all(p["id"] for p in client.get(f"/api/cities/{city_id}/places").json()["items"])
        assert client.get(f"/api/roles?story_id={story_id}").json()["items"]
def test_media_publication_requires_complete_rights_and_city(client, monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setenv("ADMIN_PASSWORD", "synthetic-private-password")
    monkeypatch.setenv("ADMIN_JWT_SECRET", "synthetic-admin-signing-secret-at-least-32-characters")
    get_settings.cache_clear()
    try:
        assert client.post("/api/admin/login", json={"username": "admin", "password": "synthetic-private-password"}).status_code == 200
        payload = {"id": "synthetic-media", "city_id": "suzhou", "location_id": "pingjiang", "url": "/assets/synthetic.jpg", "title": "Synthetic metadata fixture", "review_status": "rights_verified"}
        assert client.post("/api/admin/media", json=payload).status_code == 422
        payload.update(review_status="pending", city_id="beijing")
        assert client.post("/api/admin/media", json=payload).status_code == 422
        payload.update(city_id="suzhou", source_url="/assets/not-a-source")
        assert client.post("/api/admin/media", json=payload).status_code == 422
    finally:
        get_settings.cache_clear()


def test_catalog_seed_retains_staff_edits_and_verified_media_hashes(db):
    import hashlib
    import json

    from app.core.config import PROJECT_ROOT
    from app.models import City
    from app.services.catalog import seed_catalog
    city = db.get(City, 'beijing')
    city.status = 'planned'
    city.data = {**city.data, 'preview_places':[{**city.data['preview_places'][0], 'intro':'staff edit'}]}
    seed_catalog(db)
    seed_catalog(db)
    assert city.status == 'planned' and len(city.data['preview_places']) == 3
    assert city.data['preview_places'][0]['intro'] == 'staff edit'
    assets = json.loads((PROJECT_ROOT / 'data/demo/media.json').read_text(encoding='utf-8'))
    assert len(assets) == 5
    for asset in assets:
        image = PROJECT_ROOT / 'frontend/public' / asset['url'].lstrip('/')
        # Backend-only containers serve images through the frontend, not this path.
        if image.exists():
            assert hashlib.sha256(image.read_bytes()).hexdigest() == asset['sha256']
        assert asset['license_url'].startswith('https://creativecommons.org/')
        assert asset['author'] and asset['source_url'].startswith('https://commons.wikimedia.org/')
