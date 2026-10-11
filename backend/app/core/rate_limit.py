"""Bounded per-process limits for MVP; multi-worker deployments need a shared store."""

import threading
import time
from collections import deque

from app.core.errors import DomainError

_buckets: dict[str, deque[float]] = {}
_lock = threading.Lock()


def check_rate(key: str, limit: int, window: float = 60) -> None:
    now = time.monotonic()
    with _lock:
        if len(_buckets) >= 10000:
            for expired in [k for k, v in _buckets.items() if not v or v[-1] < now - window]:
                _buckets.pop(expired, None)
            if len(_buckets) >= 10000 and key not in _buckets:
                raise DomainError("RATE_LIMITED", "服务繁忙，请稍后重试。", 429)
        bucket = _buckets.setdefault(key, deque())
        while bucket and bucket[0] <= now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise DomainError("RATE_LIMITED", "请求过于频繁，请稍后重试。", 429)
        bucket.append(now)
