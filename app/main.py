from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.compliance.privacy import consents
from app.routers import compliance, receipts, training_ladder

app = FastAPI(title="GTO Poker Trainer Compliance Layer")
app.include_router(training_ladder.router, dependencies=[Depends(consents.require)])
app.include_router(receipts.router)
app.include_router(compliance.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
