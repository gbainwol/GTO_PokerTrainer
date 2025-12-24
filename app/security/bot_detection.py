from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Iterable

from fastapi import HTTPException, status

from app.config import settings


@dataclass
class ActionEvent:
    name: str
    timestamp: float
    metadata: dict[str, str] | None = None


def detect_bot_behavior(actions: Iterable[ActionEvent]) -> dict[str, float]:
    actions_list = list(actions)
    if len(actions_list) < 2:
        return {"score": 0.0}

    cfg = settings.bot_detection
    repeated = _repeated_action_score(actions_list, cfg.max_repeated_actions)
    cadence = _cadence_score(actions_list, cfg.max_uniform_interval_seconds)
    velocity = _velocity_score(actions_list, cfg.max_actions_per_minute)

    score = min(1.0, repeated + cadence + velocity)
    return {"score": round(score, 2), "signals": {"repeated": repeated, "cadence": cadence, "velocity": velocity}}


def enforce_no_botting(actions: Iterable[ActionEvent]) -> None:
    result = detect_bot_behavior(actions)
    if result.get("score", 0.0) >= 1.0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"reason": "bot_detected", "signals": result.get("signals", {})},
        )


def _repeated_action_score(actions: list[ActionEvent], max_repeats: int) -> float:
    streak = 1
    max_streak = 1
    for current, nxt in zip(actions, actions[1:]):
        if current.name == nxt.name:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 1
    return 1.0 if max_streak > max_repeats else max_streak / max_repeats


def _cadence_score(actions: list[ActionEvent], max_uniform_seconds: float) -> float:
    deltas = [nxt.timestamp - cur.timestamp for cur, nxt in zip(actions, actions[1:])]
    if not deltas:
        return 0.0
    avg_delta = mean(deltas)
    if avg_delta >= max_uniform_seconds:
        return 0.0
    return min(1.0, (max_uniform_seconds - avg_delta) / max_uniform_seconds)


def _velocity_score(actions: list[ActionEvent], max_per_minute: int) -> float:
    window_seconds = 60.0
    spans = actions[-1].timestamp - actions[0].timestamp
    if spans <= 0:
        return 0.0
    per_minute = len(actions) / (spans / window_seconds)
    if per_minute <= max_per_minute:
        return per_minute / max_per_minute
    return 1.0
