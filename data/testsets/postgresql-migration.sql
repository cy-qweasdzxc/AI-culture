BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE TABLE stories (
    id VARCHAR(80) NOT NULL, 
    name VARCHAR(160) NOT NULL, 
    status VARCHAR(24) NOT NULL, 
    version VARCHAR(32) NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (id)
);

CREATE INDEX ix_stories_status ON stories (status);

CREATE TABLE test_cases (
    id VARCHAR(120) NOT NULL, 
    category VARCHAR(64) NOT NULL, 
    input JSON NOT NULL, 
    expected JSON NOT NULL, 
    result JSON, 
    executed_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id)
);

CREATE INDEX ix_test_cases_category ON test_cases (category);

CREATE TABLE users (
    id VARCHAR(64) NOT NULL, 
    session_hash VARCHAR(64) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    location_consent BOOLEAN NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (session_hash)
);

CREATE INDEX ix_users_expires_at ON users (expires_at);

CREATE TABLE characters (
    id VARCHAR(80) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    kind VARCHAR(16) NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_character_kind CHECK (kind IN ('player', 'npc')), 
    FOREIGN KEY(story_id) REFERENCES stories (id)
);

CREATE INDEX ix_characters_story_id ON characters (story_id);

CREATE TABLE cultural_locations (
    id VARCHAR(80) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    name VARCHAR(160) NOT NULL, 
    route_order INTEGER NOT NULL, 
    lat FLOAT NOT NULL, 
    lng FLOAT NOT NULL, 
    trigger_radius_m FLOAT NOT NULL, 
    dwell_seconds INTEGER NOT NULL, 
    coordinates_verified BOOLEAN NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_location_radius CHECK (trigger_radius_m > 0), 
    FOREIGN KEY(story_id) REFERENCES stories (id), 
    UNIQUE (story_id, route_order)
);

CREATE INDEX ix_cultural_locations_story_id ON cultural_locations (story_id);

CREATE TABLE cultural_knowledge (
    id VARCHAR(100) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    location_id VARCHAR(80), 
    content_type VARCHAR(16) NOT NULL, 
    title VARCHAR(200) NOT NULL, 
    content TEXT NOT NULL, 
    source TEXT NOT NULL, 
    source_url TEXT NOT NULL, 
    license TEXT NOT NULL, 
    trust_level VARCHAR(32) NOT NULL, 
    review_status VARCHAR(16) NOT NULL, 
    reviewer VARCHAR(120), 
    reviewed_at TIMESTAMP WITH TIME ZONE, 
    version INTEGER NOT NULL, 
    is_demo BOOLEAN NOT NULL, 
    tags JSON NOT NULL, 
    metadata_json JSON NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_knowledge_type CHECK (content_type IN ('fact', 'disputed', 'legend', 'fiction')), 
    CONSTRAINT ck_knowledge_review CHECK (review_status IN ('pending', 'reviewed', 'rejected')), 
    FOREIGN KEY(location_id) REFERENCES cultural_locations (id), 
    FOREIGN KEY(story_id) REFERENCES stories (id)
);

CREATE INDEX ix_cultural_knowledge_story_id ON cultural_knowledge (story_id);

CREATE INDEX ix_knowledge_review_location ON cultural_knowledge (review_status, location_id);

CREATE TABLE story_nodes (
    id VARCHAR(120) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    location_id VARCHAR(80), 
    kind VARCHAR(24) NOT NULL, 
    hidden BOOLEAN NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(location_id) REFERENCES cultural_locations (id), 
    FOREIGN KEY(story_id) REFERENCES stories (id)
);

CREATE INDEX ix_story_nodes_story_id ON story_nodes (story_id);

CREATE TABLE items (
    id VARCHAR(100) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    knowledge_id VARCHAR(100), 
    kind VARCHAR(16) NOT NULL, 
    name VARCHAR(160) NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(knowledge_id) REFERENCES cultural_knowledge (id), 
    FOREIGN KEY(story_id) REFERENCES stories (id)
);

CREATE INDEX ix_items_story_id ON items (story_id);

CREATE TABLE knowledge_chunks (
    id VARCHAR(120) NOT NULL, 
    knowledge_id VARCHAR(100) NOT NULL, 
    chunk_index INTEGER NOT NULL, 
    content TEXT NOT NULL, 
    embedding JSON NOT NULL, 
    embedding_model VARCHAR(120) NOT NULL, 
    embedding_dimension INTEGER NOT NULL, 
    knowledge_version INTEGER NOT NULL, 
    vector_ref VARCHAR(160), 
    metadata_json JSON NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(knowledge_id) REFERENCES cultural_knowledge (id) ON DELETE CASCADE, 
    UNIQUE (knowledge_id, chunk_index)
);

CREATE INDEX ix_knowledge_chunks_knowledge_id ON knowledge_chunks (knowledge_id);

CREATE TABLE story_edges (
    id VARCHAR(160) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    from_node_id VARCHAR(120) NOT NULL, 
    to_node_id VARCHAR(120) NOT NULL, 
    choice_key VARCHAR(32) NOT NULL, 
    priority INTEGER NOT NULL, 
    conditions JSON NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(from_node_id) REFERENCES story_nodes (id), 
    FOREIGN KEY(story_id) REFERENCES stories (id), 
    FOREIGN KEY(to_node_id) REFERENCES story_nodes (id), 
    UNIQUE (from_node_id, to_node_id, choice_key)
);

CREATE INDEX ix_story_edges_from_node_id ON story_edges (from_node_id);

CREATE INDEX ix_story_edges_story_id ON story_edges (story_id);

CREATE TABLE tasks (
    id VARCHAR(100) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    location_id VARCHAR(80) NOT NULL, 
    node_id VARCHAR(120) NOT NULL, 
    type VARCHAR(24) NOT NULL, 
    title VARCHAR(200) NOT NULL, 
    knowledge_score INTEGER NOT NULL, 
    validation JSON NOT NULL, 
    rewards JSON NOT NULL, 
    data JSON NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_task_score CHECK (knowledge_score >= 0), 
    FOREIGN KEY(location_id) REFERENCES cultural_locations (id), 
    FOREIGN KEY(node_id) REFERENCES story_nodes (id), 
    FOREIGN KEY(story_id) REFERENCES stories (id)
);

CREATE INDEX ix_tasks_location_id ON tasks (location_id);

CREATE INDEX ix_tasks_story_id ON tasks (story_id);

CREATE TABLE user_story_state (
    id VARCHAR(64) NOT NULL, 
    user_id VARCHAR(64) NOT NULL, 
    story_id VARCHAR(80) NOT NULL, 
    role_id VARCHAR(80) NOT NULL, 
    mode VARCHAR(16) NOT NULL, 
    state VARCHAR(32) NOT NULL, 
    current_node_id VARCHAR(120), 
    current_location_id VARCHAR(80), 
    chapter INTEGER NOT NULL, 
    state_version INTEGER NOT NULL, 
    state_data JSON NOT NULL, 
    ending_id VARCHAR(120), 
    ending_snapshot JSON, 
    started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    finished_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_journey_mode CHECK (mode IN ('virtual', 'onsite')), 
    CONSTRAINT ck_state_version CHECK (state_version >= 0), 
    FOREIGN KEY(current_location_id) REFERENCES cultural_locations (id), 
    FOREIGN KEY(current_node_id) REFERENCES story_nodes (id), 
    FOREIGN KEY(ending_id) REFERENCES story_nodes (id), 
    FOREIGN KEY(role_id) REFERENCES characters (id), 
    FOREIGN KEY(story_id) REFERENCES stories (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_journey_user UNIQUE (user_id)
);

CREATE INDEX ix_journey_user_started ON user_story_state (user_id, started_at);

CREATE INDEX ix_user_story_state_user_id ON user_story_state (user_id);

CREATE TABLE action_receipts (
    journey_id VARCHAR(64) NOT NULL, 
    request_id VARCHAR(80) NOT NULL, 
    action VARCHAR(160) NOT NULL, 
    payload_hash VARCHAR(64) NOT NULL, 
    response JSON NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (journey_id, request_id), 
    FOREIGN KEY(journey_id) REFERENCES user_story_state (id) ON DELETE CASCADE
);

CREATE TABLE dialogue_logs (
    id VARCHAR(64) NOT NULL, 
    journey_id VARCHAR(64) NOT NULL, 
    npc_id VARCHAR(80) NOT NULL, 
    user_input TEXT NOT NULL, 
    response JSON NOT NULL, 
    evidence_ids JSON NOT NULL, 
    approved_actions JSON NOT NULL, 
    provider VARCHAR(32) NOT NULL, 
    model VARCHAR(120) NOT NULL, 
    prompt_version VARCHAR(32) NOT NULL, 
    feedback TEXT, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(journey_id) REFERENCES user_story_state (id) ON DELETE CASCADE, 
    FOREIGN KEY(npc_id) REFERENCES characters (id)
);

CREATE INDEX ix_dialogue_logs_journey_id ON dialogue_logs (journey_id);

CREATE TABLE safety_logs (
    id VARCHAR(64) NOT NULL, 
    journey_id VARCHAR(64), 
    risk_type VARCHAR(64) NOT NULL, 
    reason TEXT NOT NULL, 
    rule_version VARCHAR(32) NOT NULL, 
    result VARCHAR(32) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(journey_id) REFERENCES user_story_state (id) ON DELETE CASCADE
);

CREATE INDEX ix_safety_logs_journey_id ON safety_logs (journey_id);

CREATE TABLE user_collections (
    journey_id VARCHAR(64) NOT NULL, 
    item_id VARCHAR(100) NOT NULL, 
    level INTEGER NOT NULL, 
    source VARCHAR(160) NOT NULL, 
    acquired_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (journey_id, item_id), 
    FOREIGN KEY(item_id) REFERENCES items (id), 
    FOREIGN KEY(journey_id) REFERENCES user_story_state (id) ON DELETE CASCADE
);

CREATE TABLE user_inventory (
    journey_id VARCHAR(64) NOT NULL, 
    item_id VARCHAR(100) NOT NULL, 
    source VARCHAR(160) NOT NULL, 
    acquired_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (journey_id, item_id), 
    FOREIGN KEY(item_id) REFERENCES items (id), 
    FOREIGN KEY(journey_id) REFERENCES user_story_state (id) ON DELETE CASCADE
);

CREATE TABLE user_task_state (
    journey_id VARCHAR(64) NOT NULL, 
    task_id VARCHAR(100) NOT NULL, 
    status VARCHAR(24) NOT NULL, 
    attempts INTEGER NOT NULL, 
    answer JSON, 
    score INTEGER NOT NULL, 
    PRIMARY KEY (journey_id, task_id), 
    CONSTRAINT ck_user_task_nonnegative CHECK (attempts >= 0 AND score >= 0), 
    FOREIGN KEY(journey_id) REFERENCES user_story_state (id) ON DELETE CASCADE, 
    FOREIGN KEY(task_id) REFERENCES tasks (id)
);

INSERT INTO alembic_version (version_num) VALUES ('0001') RETURNING alembic_version.version_num;

-- Running upgrade 0001 -> 0002

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_vectors (
                chunk_id VARCHAR(120) PRIMARY KEY
                    REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
                embedding vector NOT NULL,
                model VARCHAR(200) NOT NULL,
                dimension INTEGER NOT NULL CHECK (dimension > 0),
                CHECK (vector_dims(embedding) = dimension)
            );

UPDATE alembic_version SET version_num='0002' WHERE alembic_version.version_num = '0001';

COMMIT;

