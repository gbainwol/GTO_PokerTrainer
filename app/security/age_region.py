from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.config import settings


@dataclass
class UserProfile:
    user_id: str
    age: int
    region: str


class AgeRegionGate:
    def __init__(self) -> None:
        cfg = settings.age_region
        self.minimum_age = cfg.minimum_age
        self.blocked_regions = {region.upper() for region in cfg.blocked_regions}

    def enforce(self, profile: UserProfile) -> None:
        if profile.age < self.minimum_age:
            raise HTTPException(
                status_code=status.HTTP_451_UNAVAILABLE_FOR_LEGAL_REASONS,
                detail="User does not meet minimum age requirement",
            )
        if profile.region.upper() in self.blocked_regions:
            raise HTTPException(
                status_code=status.HTTP_451_UNAVAILABLE_FOR_LEGAL_REASONS,
                detail="Region is blocked for responsible gaming policies",
            )


age_region_gate = AgeRegionGate()
