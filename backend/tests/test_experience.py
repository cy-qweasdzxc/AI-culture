from uuid import uuid4

import pytest
from test_journey import action, complete_route, grant_dialogue_clue, trigger

from app.models import Task, UserStoryState
from app.services.experience import agent_context, profile, task_definition


@pytest.mark.parametrize('audience', ['child', 'student', 'adult', 'senior'])
@pytest.mark.parametrize('difficulty', ['easy', 'normal', 'advanced'])
def test_profiles_real_tasks_rewards_and_restore(client, db, audience, difficulty):
    client.post('/api/session')
    state = client.post('/api/journeys/start', json={'role_id': 'scholar', 'audience_mode': audience, 'difficulty': difficulty}).json()['snapshot']
    assert state['audienceMode'] == audience and state['difficulty'] == difficulty
    assert state['storyRoleId'] == 'scholar' and state['visitMode'] == 'virtual'
    state = trigger(client, state, 'pingjiang')
    tasks = client.get('/api/tasks').json()['items']
    quiz = next(t for t in tasks if t['type'] != 'password' or t.get('answerMode') == 'text')
    entity = db.get(Task, quiz['id'])
    _, rule = task_definition(entity, db.get(UserStoryState, state['journeyId']))
    assert not {'answerKey', 'password', 'sortingAnswer', 'explanation'} & quiz.keys()
    if difficulty == 'easy':
        assert len(quiz['options']) == 2
    if difficulty == 'advanced':
        assert quiz['answerMode'] == 'text' and 'options' not in quiz
    answer = rule['password'] if quiz['type'] == 'password' else rule['answerKey']
    body = action(state, answer=answer)
    path = f"/api/tasks/{quiz['id']}/verify"
    result = client.post(path, json=body)
    assert result.status_code == 200, result.text
    state = result.json()['snapshot']
    assert result.json()['ok']
    assert state['taskStates'][quiz['id']]['score'] == quiz['knowledgeScore']
    replay = client.post(path, json=body).json()
    assert replay['replayed'] and replay['snapshot']['taskStates'] == state['taskStates']
    duplicate = client.post(path, json=action(state, answer=answer))
    assert duplicate.status_code == 409
    blocked = client.post('/api/journeys/profile', json=action(state, audience_mode=audience, difficulty='normal' if difficulty != 'normal' else 'easy'))
    assert blocked.status_code == 409
    restored = client.post('/api/session').json()['snapshot']
    assert restored['difficulty'] == difficulty and restored['taskStates'] == state['taskStates']
    report = client.get('/api/report').json()
    assert report['difficulty'] == difficulty and report['maxScore'] >= report['knowledgeScore'] > 0


def test_profile_defaults_switch_and_validation(client, db):
    client.post('/api/session')
    assert client.post('/api/journeys/start', json={'role_id':'scholar', 'audience_mode':'invalid'}).status_code == 422
    assert client.post('/api/journeys/start', json={'role_id':'scholar', 'difficulty':'impossible'}).status_code == 422
    state = client.post('/api/journeys/start', json={'role_id':'scholar', 'audience_mode':'child'}).json()['snapshot']
    assert state['difficulty'] == 'easy'
    state = client.post('/api/journeys/profile', json=action(state, audience_mode='student', difficulty='advanced')).json()['snapshot']
    assert state['audienceMode'] == 'student' and state['difficulty'] == 'advanced'
    journey = db.get(UserStoryState, state['journeyId'])
    context = agent_context(journey)
    assert context['audience_mode'] == 'student' and context['truthfulness_instruction']
    journey.state_data = {k:v for k,v in journey.state_data.items() if k != 'profile'}
    assert profile(journey)['difficulty'] == 'normal' and profile(journey)['audience_mode'] == 'adult'


@pytest.mark.parametrize('route', ['suzhou-short', 'suzhou-branches', 'missing'])
def test_unplayable_routes_cannot_skip_story(client, route):
    client.post('/api/session')
    assert client.post('/api/journeys/start', json={'role_id':'scholar', 'route_id':route}).status_code == 409
    assert client.get('/api/journeys/current').json()['snapshot'] is None


def test_scene_receives_saved_profile(client, db):
    from app.services.scene import prepare_scene
    client.post('/api/session')
    state = client.post('/api/journeys/start', json={'role_id':'scholar', 'audience_mode':'child'}).json()['snapshot']
    state = trigger(client, state, 'pingjiang')
    prepared = prepare_scene(db, db.get(UserStoryState, state['journeyId']), 'zhou-bo', '平江图', ['zhou-bo'], str(uuid4()))
    assert prepared.actors['zhou-bo'].context['audience_mode'] == 'child'
    assert prepared.actors['zhou-bo'].context['difficulty'] == 'easy'


def test_original_normal_route_and_ending_remain_legal(client, started):
    state = complete_route(client, started)
    result = client.post('/api/journeys/finale', json=action(state, choice_key='hang'))
    assert result.status_code == 200 and result.json()['snapshot']['state'] == 'COMPLETED'


@pytest.mark.parametrize('difficulty', ['easy', 'advanced'])
def test_all_six_task_variants_complete_mainline_and_match_max_score(client, db, difficulty):
    from app.repositories.catalog import locations, tasks
    client.post('/api/session')
    state = client.post('/api/journeys/start', json={'role_id':'scholar','audience_mode':'student','difficulty':difficulty}).json()['snapshot']
    total = 0
    for place in locations(db, 'suzhou-pingjiang'):
        state = trigger(client, state, place.id)
        if place.id == 'pingjiang':
            state = grant_dialogue_clue(client, state, 'zhou-bo', '平江图')
        if place.id == 'subo':
            state = grant_dialogue_clue(client, state, 'xiao-shen', '片石白墙')
        for task in tasks(db, 'suzhou-pingjiang'):
            if task.location_id != place.id or task.data.get("optional"):
                continue
            definition, rule = task_definition(task, db.get(UserStoryState, state['journeyId']))
            answer = rule.get('password') if definition['type'] == 'password' else rule.get('sortingAnswer') if definition['type'] == 'sorting' else rule.get('answerKey')
            result = client.post(f'/api/tasks/{task.id}/verify', json=action(state, answer=answer))
            assert result.status_code == 200 and result.json()['ok'], result.text
            state = result.json()['snapshot']
            total += definition['knowledgeScore']
    assert state['state'] == 'ENDING_READY'
    report = client.get('/api/report').json()
    assert report['knowledgeScore'] == report['requiredTaskMaxScore'] == total
    assert report['maxScore'] == total + report['optionalTaskMaxScore']
    assert report['completedTaskCount'] == 6
    result = client.post('/api/journeys/finale', json=action(state,choice_key='hang'))
    assert result.status_code == 200 and result.json()['snapshot']['state'] == 'COMPLETED'
