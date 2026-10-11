"""AI configuration is independent of chat-provider embedding support."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AISettings:
    provider: str = "mock"
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    embedding_provider: str = "none"
    embedding_key: str = ""
    embedding_url: str = ""
    embedding_model: str = ""
    embedding_dimension: int = 1024
    timeout: float = 30.0

    @classmethod
    def configured(cls) -> "AISettings":
        from app.core.config import get_settings

        s = get_settings()
        return cls(s.llm_provider, s.llm_api_key, s.llm_base_url, s.llm_model,
                   s.embedding_provider, s.embedding_api_key, s.embedding_base_url,
                   s.embedding_model, s.embedding_dimension, s.llm_timeout_seconds)

    @classmethod
    def from_env(cls) -> "AISettings":
        return cls(
            provider=os.getenv("LLM_PROVIDER", "mock"),
            api_key=os.getenv("LLM_API_KEY", ""),
            base_url=os.getenv("LLM_BASE_URL", ""),
            model=os.getenv("LLM_MODEL", ""),
            embedding_provider=os.getenv("EMBEDDING_PROVIDER", "none"),
            embedding_key=os.getenv("EMBEDDING_API_KEY", ""),
            embedding_url=os.getenv("EMBEDDING_BASE_URL", ""),
            embedding_model=os.getenv("EMBEDDING_MODEL", ""),
            embedding_dimension=int(os.getenv("EMBEDDING_DIMENSION", "1024")),
            timeout=float(os.getenv("AI_TIMEOUT_SECONDS", "30")),
        )
