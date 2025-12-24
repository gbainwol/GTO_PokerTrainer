from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List


@dataclass
class GamingNotice:
    message: str
    severity: str
    created_at: datetime


class ResponsibleGamingNotices:
    def __init__(self) -> None:
        self._notices: List[GamingNotice] = []

    def publish(self, message: str, severity: str = "info") -> GamingNotice:
        notice = GamingNotice(message=message, severity=severity, created_at=datetime.utcnow())
        self._notices.append(notice)
        return notice

    def latest(self, limit: int = 5) -> Iterable[GamingNotice]:
        return list(self._notices[-limit:])


responsible_gaming = ResponsibleGamingNotices()
responsible_gaming.publish(
    "Play responsibly: set limits, take breaks, and seek help if needed.",
    severity="info",
)
