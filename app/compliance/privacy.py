from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Set

from fastapi import HTTPException, status

from app.config import settings

Purpose = str


@dataclass
class ConsentRecord:
    user_id: str
    purposes: Set[Purpose] = field(default_factory=set)
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def has_required(self) -> bool:
        return all(purpose in self.purposes for purpose in settings.consent.required_purposes)


class ConsentRegistry:
    def __init__(self) -> None:
        self._records: Dict[str, ConsentRecord] = {}

    def give(self, user_id: str, purposes: set[Purpose]) -> ConsentRecord:
        record = ConsentRecord(user_id=user_id, purposes=purposes)
        self._records[user_id] = record
        return record

    def withdraw(self, user_id: str) -> None:
        if user_id in self._records:
            del self._records[user_id]

    def require(self, user_id: str) -> ConsentRecord:
        record = self._records.get(user_id)
        if record is None or not record.has_required():
            raise HTTPException(
                status_code=status.HTTP_412_PRECONDITION_FAILED,
                detail="Consent required for processing",
            )
        return record


consents = ConsentRegistry()
