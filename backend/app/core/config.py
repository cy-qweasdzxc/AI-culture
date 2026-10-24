from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent if (BACKEND_ROOT.parent / "data/demo/seed.json").exists() else BACKEND_ROOT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(PROJECT_ROOT / ".env"), ".env"), extra="ignore", case_sensitive=False
    )

    app_env: str = "development"
    database_url: str = "sqlite:///./city_story.db"
    session_secret: str = "development-session-secret-change-before-deployment"
    session_cookie: str = "citystory_session"
    session_days: int = 30
    # 会话 Cookie 是否只在 HTTPS 上回传。真实部署应保持开启（默认按 APP_ENV 推导）。
    # 仅当确知服务以明文 HTTP 直接对外提供时，才显式设为 false：浏览器不会在 HTTP 上
    # 回传 Secure Cookie，那时所有需要登录的接口都会返回 401，而健康检查仍然正常，
    # 故障表现是静默的。Compose 默认以 HTTP 暴露前端，因此本地全栈验收需要显式关闭。
    session_cookie_secure: bool | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_username: str = "admin"
    admin_password: str = ""
    admin_jwt_secret: str = "development-admin-secret-change-before-deployment"
    llm_provider: str = "mock"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    llm_timeout_seconds: float = 30
    ai_timeout_seconds: float = 30
    embedding_provider: str = "none"
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = ""
    embedding_dimension: int = 1024
    rag_min_score: float = 0.15
    tmap_web_service_key: str = ""
    tmap_timeout_seconds: float = 3

    @model_validator(mode="after")
    def production_secrets(self) -> "Settings":
        if self.app_env == "production":
            for name in ("session_secret", "admin_jwt_secret"):
                value = getattr(self, name)
                if len(value) < 32 or "change" in value or value.startswith("development-"):
                    raise ValueError(f"{name} must be a private secret of at least 32 characters")
            if len(self.admin_password) < 12:
                raise ValueError("admin_password must contain at least 12 characters in production")
        return self

    @property
    def cookie_secure(self) -> bool:
        """Whether cookies must be marked Secure. Explicit setting wins over APP_ENV."""
        if self.session_cookie_secure is not None:
            return self.session_cookie_secure
        return self.app_env == "production"

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
