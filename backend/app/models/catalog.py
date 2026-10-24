from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.entities import utcnow


class City(Base):
    __tablename__ = "cities"
    __table_args__ = (CheckConstraint("status IN ('open','demo','building','planned')", name="ck_city_status"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="building")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (CheckConstraint("status IN ('open','demo','building','planned')", name="ck_route_status"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    city_id: Mapped[str] = mapped_column(ForeignKey("cities.id"), index=True)
    story_id: Mapped[str | None] = mapped_column(ForeignKey("stories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default="building")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class RouteStop(Base):
    __tablename__ = "route_stops"
    __table_args__ = (UniqueConstraint("route_id", "position"),)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"), primary_key=True)
    location_id: Mapped[str] = mapped_column(ForeignKey("cultural_locations.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)
    required: Mapped[bool] = mapped_column(Boolean, default=True)


class MediaAsset(Base):
    __tablename__ = "media_assets"
    __table_args__ = (
        CheckConstraint("kind IN ('photograph','illustration')", name="ck_media_kind"),
        CheckConstraint("review_status IN ('pending','rights_verified','rejected')", name="ck_media_review"),
        CheckConstraint("version > 0", name="ck_media_version"),
    )
    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    city_id: Mapped[str] = mapped_column(ForeignKey("cities.id"), index=True)
    location_id: Mapped[str | None] = mapped_column(ForeignKey("cultural_locations.id"), nullable=True, index=True)
    url: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str] = mapped_column(String(240))
    caption: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(24), default="photograph")
    source_url: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(Text, default="")
    license: Mapped[str] = mapped_column(Text, default="")
    license_url: Mapped[str] = mapped_column(Text, default="")
    attribution: Mapped[str] = mapped_column(Text, default="")
    redistributable: Mapped[bool] = mapped_column(Boolean, default=False)
    review_status: Mapped[str] = mapped_column(String(24), default="pending")
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
