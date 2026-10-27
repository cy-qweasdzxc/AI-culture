from test_journey import action


def test_rules_whitelist_unknown_distances_and_short_preview(client, started):
    result = client.post('/api/routes/recommend', json={'journey_id':started['journeyId'], 'time_budget_minutes':30, 'audience_mode':'child', 'difficulty':'easy', 'interests':['architecture']})
    assert result.status_code == 200
    data = result.json()
    assert data['provider'] == 'rules' and data['model_calls'] == 0
    assert {r['route_id'] for r in data['items']} == {'suzhou-classic', 'suzhou-short'}
    assert data['items'][0]['route_id'] == 'suzhou-short' and data['items'][0]['preview_only']
    for row in data['items']:
        assert row['walking_distance_m'] is None and row['walking_duration_minutes'] is None
        assert row['estimated_visit_minutes'] is None
        assert row['opening_status'] == 'unknown' and row['opening_checked_at'] is None
    assert data['unavailable'][0]['route_id'] == 'suzhou-branches'
    assert client.post('/api/location/trigger', json=action(started, spot_id='subo')).status_code == 409
    assert client.get('/api/journeys/current').json()['snapshot']['stateVersion'] == started['stateVersion']


def test_building_cities_never_offer_fake_routes(client):
    client.post('/api/session')
    for city in ['beijing','xian','chengdu']:
        data = client.post('/api/routes/recommend', json={'city_id':city}).json()
        assert data['items'] == [] and data['model_calls'] == 0
    assert client.post('/api/routes/recommend', json={'stop_ids':['subo']}).status_code == 422
    assert client.post('/api/routes/recommend', json={'interests':['invented']}).status_code == 422


def test_recommendation_cannot_read_foreign_journey(client, started):
    client.cookies.clear()
    client.post('/api/session')
    assert client.post('/api/routes/recommend', json={'journey_id':started['journeyId']}).status_code == 404
