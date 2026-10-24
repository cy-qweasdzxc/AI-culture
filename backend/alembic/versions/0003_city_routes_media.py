"""Add city, route and rights-aware media catalog without altering existing tables."""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("cities", sa.Column("id", sa.String(80), primary_key=True), sa.Column("name", sa.String(100), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("data", sa.JSON(), nullable=False), sa.CheckConstraint("status IN ('open','demo','building','planned')", name="ck_city_status"))
    op.create_table("routes", sa.Column("id", sa.String(80), primary_key=True), sa.Column("city_id", sa.String(80), sa.ForeignKey("cities.id"), nullable=False), sa.Column("story_id", sa.String(80), sa.ForeignKey("stories.id")), sa.Column("name", sa.String(160), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("data", sa.JSON(), nullable=False), sa.CheckConstraint("status IN ('open','demo','building','planned')", name="ck_route_status"))
    op.create_index("ix_routes_city_id", "routes", ["city_id"])
    op.create_table("route_stops", sa.Column("route_id", sa.String(80), sa.ForeignKey("routes.id", ondelete="CASCADE"), primary_key=True), sa.Column("location_id", sa.String(80), sa.ForeignKey("cultural_locations.id"), primary_key=True), sa.Column("position", sa.Integer(), nullable=False), sa.Column("required", sa.Boolean(), nullable=False), sa.UniqueConstraint("route_id", "position"))
    op.create_table("media_assets",
        sa.Column("id", sa.String(120), primary_key=True), sa.Column("city_id", sa.String(80), sa.ForeignKey("cities.id"), nullable=False), sa.Column("location_id", sa.String(80), sa.ForeignKey("cultural_locations.id")),
        sa.Column("url", sa.Text(), nullable=False), sa.Column("title", sa.String(240), nullable=False), sa.Column("caption", sa.Text(), nullable=False), sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False), sa.Column("author", sa.Text(), nullable=False), sa.Column("license", sa.Text(), nullable=False), sa.Column("license_url", sa.Text(), nullable=False), sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("redistributable", sa.Boolean(), nullable=False), sa.Column("review_status", sa.String(24), nullable=False), sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False), sa.Column("sha256", sa.String(64)), sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint("kind IN ('photograph','illustration')", name="ck_media_kind"), sa.CheckConstraint("review_status IN ('pending','rights_verified','rejected')", name="ck_media_review"), sa.CheckConstraint("version > 0", name="ck_media_version"))
    op.create_index("ix_media_assets_city_id", "media_assets", ["city_id"])
    op.create_index("ix_media_assets_location_id", "media_assets", ["location_id"])


def downgrade():
    op.drop_table("media_assets")
    op.drop_table("route_stops")
    op.drop_table("routes")
    op.drop_table("cities")
