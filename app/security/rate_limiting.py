from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque

from fastapi import HTTPException, status

from app.config import settings


@dataclass
class RateLimitBucket:
    window_seconds: float
    max_requests: int
    timestamps: Deque[float]

    def allow(self) -> bool:
        now = time.monotonic()
        while self.timestamps and now - self.timestamps[0] > self.window_seconds:
            self.timestamps.popleft()
        if len(self.timestamps) >= self.max_requests:
            return False
        self.timestamps.append(now)
        return True


class RateLimiter:
    def __init__(self) -> None:
        cfg = settings.rate_limit
        self._window_seconds = cfg.window.total_seconds()
        self._max_requests = cfg.max_requests
        self._buckets: dict[str, RateLimitBucket] = defaultdict(
            lambda: RateLimitBucket(
                window_seconds=self._window_seconds,
                max_requests=self._max_requests,
                timestamps=deque(),
            )
        )

    def check(self, identifier: str) -> None:
        bucket = self._buckets[identifier]
        if not bucket.allow():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded for training ladders",
            )


rate_limiter = RateLimiter()
