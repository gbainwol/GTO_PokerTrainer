from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header

from app.security.age_region import UserProfile, age_region_gate
from app.security.bot_detection import ActionEvent, enforce_no_botting
from app.security.rate_limiting import rate_limiter

router = APIRouter(prefix="/ladder", tags=["training_ladder"])


@router.post("/attempt")
def submit_attempt(
    user_id: Annotated[str, Body(embed=True)],
    actions: Annotated[list[str], Body(embed=True)],
    age: Annotated[int, Header()],
    region: Annotated[str, Header()],
    x_client_ip: Annotated[str | None, Header(alias="X-Client-IP", default=None)] = None,
):
    identifier = x_client_ip or user_id
    rate_limiter.check(identifier)

    action_events = [ActionEvent(name=action, timestamp=time.monotonic()) for action in actions]
    enforce_no_botting(action_events)

    profile = UserProfile(user_id=user_id, age=age, region=region)
    age_region_gate.enforce(profile)

    return {"status": "ok", "reviewed_actions": len(actions)}
