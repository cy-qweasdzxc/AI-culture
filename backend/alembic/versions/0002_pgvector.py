"""Optional PostgreSQL exact cosine vectors; SQLite keeps JSON embeddings.

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        # Dimensions are recorded per model. Avoid mixing models or dimensions;
        # no HNSW index is claimed for the small demonstration corpus.
        op.execute("""
            CREATE TABLE knowledge_vectors (
                chunk_id VARCHAR(120) PRIMARY KEY
                    REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
                embedding vector NOT NULL,
                model VARCHAR(200) NOT NULL,
                dimension INTEGER NOT NULL CHECK (dimension > 0),
                CHECK (vector_dims(embedding) = dimension)
            )
        """)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TABLE knowledge_vectors")
        # The extension can be shared with other applications.
