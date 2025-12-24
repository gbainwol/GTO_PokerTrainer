from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, Optional

from app.config import settings


@dataclass
class RetainedItem:
    id: str
    data: dict
    created_at: datetime
    ttl: timedelta

    def expired(self, now: Optional[datetime] = None) -> bool:
        now = now or datetime.utcnow()
        return now - self.created_at >= self.ttl


class RetentionPolicy:
    def __init__(self) -> None:
        self._items: Dict[str, RetainedItem] = {}

    def register(self, item_id: str, data: dict, ttl: timedelta) -> RetainedItem:
        record = RetainedItem(id=item_id, data=data, created_at=datetime.utcnow(), ttl=ttl)
        self._items[item_id] = record
        return record

    def purge(self) -> list[str]:
        now = datetime.utcnow()
        expired = [item_id for item_id, item in self._items.items() if item.expired(now)]
        for item_id in expired:
            self._items.pop(item_id, None)
        return expired

    def items(self) -> Iterable[RetainedItem]:
        return self._items.values()


training_log_retention = RetentionPolicy()
receipts_retention = RetentionPolicy()
