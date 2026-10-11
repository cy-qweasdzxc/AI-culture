"""Small HTTP adapters; errors never include provider bodies or credentials."""

import json
import math
from dataclasses import dataclass
from typing import Any

import httpx

from app.ai.settings import AISettings

# Provider batch ceilings differ; DashScope text-embedding-v3 rejects more than 10 inputs per
# request, so requests are chunked at the strictest commonly documented limit.
EMBEDDING_BATCH_SIZE = 10


class ProviderError(Exception):
    pass


@dataclass(frozen=True)
class Generation:
    content: str
    provider: str
    model: str
    mock: bool
    fallback_reason: str | None = None


class ChatProvider:
    def __init__(self, settings: AISettings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def generate(self, messages: list[dict[str, str]], mock_reply: dict[str, Any]) -> Generation:
        s = self.settings
        if s.provider not in {"deepseek", "qwen", "ollama", "mock"}:
            raise ProviderError("PROVIDER_INVALID")
        if s.provider == "mock" or (s.provider in {"deepseek", "qwen"} and not s.api_key):
            reason = "API_KEY_MISSING" if s.provider != "mock" else None
            return Generation(json.dumps(mock_reply, ensure_ascii=False), "mock", "extractive-v1", True, reason)
        if not s.model:
            raise ProviderError("MODEL_NOT_CONFIGURED")
        if not s.base_url:
            raise ProviderError("BASE_URL_NOT_CONFIGURED")
        try:
            with httpx.Client(timeout=s.timeout, transport=self.transport, trust_env=False) as client:
                if s.provider == "ollama":
                    response = client.post(s.base_url.rstrip("/") + "/api/chat", json={
                        "model": s.model, "messages": messages, "format": "json", "stream": False,
                    })
                    response.raise_for_status()
                    content = response.json()["message"]["content"]
                else:
                    response = client.post(s.base_url.rstrip("/") + "/chat/completions", headers={
                        "Authorization": "Bearer " + s.api_key,
                    }, json={"model": s.model, "messages": messages, "temperature": 0,
                             "max_tokens": 700, "response_format": {"type": "json_object"}})
                    response.raise_for_status()
                    content = response.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or len(content) > 12000:
                raise ProviderError("MODEL_OUTPUT_INVALID")
            return Generation(content, s.provider, s.model, False)
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
            raise ProviderError("MODEL_UNAVAILABLE") from None


class EmbeddingProvider:
    """Batched HTTP embeddings.

    Provider batch ceilings differ (DashScope's text-embedding-v3 rejects more than 10 inputs in
    one request), so every call is chunked and the batches are re-assembled in input order. The
    per-batch invariant ``index == 0..n-1`` is still enforced, so a provider that ignores ordering
    inside a batch is rejected rather than silently mismatched.
    """

    def __init__(self, settings: AISettings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def embed(self, texts: list[str]) -> list[list[float]]:
        s = self.settings
        if s.embedding_provider == "none":
            raise ProviderError("EMBEDDING_NOT_CONFIGURED")
        if s.embedding_provider not in {"openai-compatible", "qwen", "ollama"}:
            raise ProviderError("EMBEDDING_PROVIDER_INVALID")
        if not s.embedding_url or not s.embedding_model:
            raise ProviderError("EMBEDDING_NOT_CONFIGURED")
        if s.embedding_provider != "ollama" and not s.embedding_key:
            raise ProviderError("EMBEDDING_KEY_MISSING")
        if not texts:
            return []
        try:
            with httpx.Client(timeout=s.timeout, transport=self.transport, trust_env=False) as client:
                vectors: list[list[float]] = []
                for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
                    batch = texts[start:start + EMBEDDING_BATCH_SIZE]
                    vectors.extend(self._embed_batch(client, batch))
            if len(vectors) != len(texts):
                raise ProviderError("EMBEDDING_OUTPUT_INVALID")
            result = []
            for vector in vectors:
                if len(vector) != s.embedding_dimension or any(
                    isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in vector
                ) or sum(v * v for v in vector) <= 0:
                    raise ProviderError("EMBEDDING_OUTPUT_INVALID")
                result.append([float(v) for v in vector])
            return result
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
            raise ProviderError("EMBEDDING_UNAVAILABLE") from None

    def _embed_batch(self, client: httpx.Client, batch: list[str]) -> list[list[float]]:
        s = self.settings
        if s.embedding_provider == "ollama":
            response = client.post(s.embedding_url.rstrip("/") + "/api/embed", json={
                "model": s.embedding_model, "input": batch, "truncate": False,
            })
            response.raise_for_status()
            vectors = response.json()["embeddings"]
            if len(vectors) != len(batch):
                raise ProviderError("EMBEDDING_OUTPUT_INVALID")
            return vectors
        response = client.post(s.embedding_url.rstrip("/") + "/embeddings", headers={
            "Authorization": "Bearer " + s.embedding_key,
        }, json={"model": s.embedding_model, "input": batch, "dimensions": s.embedding_dimension})
        response.raise_for_status()
        records = sorted(response.json()["data"], key=lambda x: x["index"])
        if [r["index"] for r in records] != list(range(len(batch))):
            raise ProviderError("EMBEDDING_OUTPUT_INVALID")
        return [row["embedding"] for row in records]
