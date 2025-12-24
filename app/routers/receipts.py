from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body

from app.compliance.retention import receipts_retention
from app.config import settings
from app.receipts.fraud import Receipt, fraud_engine

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.post("")
def create_receipt(
    receipt_id: Annotated[str, Body(embed=True)],
    user_id: Annotated[str, Body(embed=True)],
    amount: Annotated[float, Body(embed=True)],
    country: Annotated[str, Body(embed=True)],
    payment_method: Annotated[str, Body(embed=True)],
    metadata: Annotated[dict, Body(embed=True, default_factory=dict)],
):
    receipt = Receipt(
        id=receipt_id,
        user_id=user_id,
        amount=amount,
        country=country,
        payment_method=payment_method,
        created_at=datetime.utcnow(),
        metadata=metadata,
    )

    signals = fraud_engine.evaluate(receipt)
    receipts_retention.register(receipt_id, data=receipt.__dict__, ttl=settings.retention.receipts_ttl)

    return {"receipt": receipt.__dict__, "fraud_signals": signals}
