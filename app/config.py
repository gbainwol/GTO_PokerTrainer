from __future__ import annotations

from datetime import timedelta
from pydantic import BaseModel


class RateLimitConfig(BaseModel):
    window: timedelta = timedelta(minutes=1)
    max_requests: int = 60


class BotDetectionConfig(BaseModel):
    max_repeated_actions: int = 5
    max_uniform_interval_seconds: float = 0.75
    max_actions_per_minute: int = 180


class FraudSignalConfig(BaseModel):
    high_value_threshold: float = 250.0
    velocity_window_minutes: int = 5
    velocity_limit: int = 3


class ConsentConfig(BaseModel):
    required_purposes: tuple[str, ...] = ("analytics", "personalization", "marketing")


class RetentionPolicyConfig(BaseModel):
    training_logs_ttl: timedelta = timedelta(days=30)
    receipts_ttl: timedelta = timedelta(days=365)


class AgeRegionConfig(BaseModel):
    minimum_age: int = 18
    blocked_regions: tuple[str, ...] = ("IR", "KP", "SY")


class Settings(BaseModel):
    rate_limit: RateLimitConfig = RateLimitConfig()
    bot_detection: BotDetectionConfig = BotDetectionConfig()
    fraud_signals: FraudSignalConfig = FraudSignalConfig()
    consent: ConsentConfig = ConsentConfig()
    retention: RetentionPolicyConfig = RetentionPolicyConfig()
    age_region: AgeRegionConfig = AgeRegionConfig()


settings = Settings()
