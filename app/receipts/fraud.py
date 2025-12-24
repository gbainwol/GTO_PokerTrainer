from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List

from app.config import settings


@dataclass
class Receipt:
    id: str
    user_id: str
    amount: float
    country: str
    payment_method: str
    created_at: datetime
    metadata: dict


class FraudSignalEngine:
    def __init__(self) -> None:
        self._recent: List[Receipt] = []

    def evaluate(self, receipt: Receipt) -> dict:
        cfg = settings.fraud_signals
        signals: Dict[str, bool | int | float] = {}

        signals["high_value"] = receipt.amount >= cfg.high_value_threshold
        signals["country_mismatch"] = receipt.metadata.get("ip_country") not in {receipt.country, None}
        signals["payment_method_risky"] = receipt.payment_method in {"prepaid_card", "crypto"}
        signals["velocity"] = self._velocity(receipt, cfg.velocity_window_minutes, cfg.velocity_limit)

        score = sum(1 for value in signals.values() if value)
        signals["score"] = score

        self._recent.append(receipt)
        self._prune_history(cfg.velocity_window_minutes)

        return signals

    def _velocity(self, receipt: Receipt, window_minutes: int, limit: int) -> bool:
        window = timedelta(minutes=window_minutes)
        now = receipt.created_at
        recent_count = sum(1 for r in self._recent if r.user_id == receipt.user_id and now - r.created_at <= window)
        return recent_count >= limit

    def _prune_history(self, window_minutes: int) -> None:
        window = timedelta(minutes=window_minutes)
        cutoff = datetime.utcnow() - window
        self._recent = [r for r in self._recent if r.created_at >= cutoff]


fraud_engine = FraudSignalEngine()
