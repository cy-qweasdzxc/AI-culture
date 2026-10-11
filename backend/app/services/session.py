import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import DomainError
from app.models import User, utcnow


def session_hash(token: str) -> str:
    return hmac.new(get_settings().session_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def find_user(db: Session, token: str | None) -> User | None:
    if not token or len(token) > 256:
        return None
    user = db.scalar(select(User).where(User.session_hash == session_hash(token)))
    if user and user.expires_at.replace(tzinfo=UTC) > datetime.now(UTC):
        return user
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = find_user(db, request.cookies.get(get_settings().session_cookie))
    if user is None:
        raise DomainError("SESSION_INVALID", "匿名会话已失效，请重新创建会话。", 401)
    return user


def create_or_restore_session(db: Session, request: Request, response: Response) -> User:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie)
    user = find_user(db, token)
    if user is None:
        token = secrets.token_urlsafe(32)
        user = User(id=str(uuid4()), session_hash=session_hash(token), expires_at=utcnow() + timedelta(days=settings.session_days))
        db.add(user)
    user.last_active_at = utcnow()
    db.commit()
    response.set_cookie(
        settings.session_cookie,
        token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=settings.session_days * 86400,
        path="/",
    )
    return user
