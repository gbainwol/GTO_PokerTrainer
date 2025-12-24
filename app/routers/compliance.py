from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Body

from app.compliance.privacy import consents
from app.compliance.responsible_gaming import responsible_gaming
from app.compliance.retention import training_log_retention
from app.config import settings

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.post("/consent")
def give_consent(user_id: Annotated[str, Body(embed=True)], purposes: Annotated[list[str], Body(embed=True)]):
    record = consents.give(user_id, set(purposes))
    return {"consent": {"user_id": record.user_id, "purposes": list(record.purposes)}}


@router.post("/consent/withdraw")
def withdraw_consent(user_id: Annotated[str, Body(embed=True)]):
    consents.withdraw(user_id)
    return {"status": "withdrawn"}


@router.post("/training-log")
def register_training_log(log_id: Annotated[str, Body(embed=True)], user_id: Annotated[str, Body(embed=True)], metadata: Annotated[dict, Body(embed=True, default_factory=dict)]):
    ttl_override = metadata.get("ttl")
    ttl = ttl_override if isinstance(ttl_override, timedelta) else settings.retention.training_logs_ttl
    record = training_log_retention.register(log_id, data={"user_id": user_id, "metadata": metadata}, ttl=ttl)
    return {"registered": record.id, "expires_at": record.created_at + record.ttl}


@router.get("/responsible-gaming")
def get_responsible_gaming_notices(limit: int = 5):
    notices = [notice.__dict__ for notice in responsible_gaming.latest(limit)]
    return {"notices": notices}
