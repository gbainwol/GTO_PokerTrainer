from __future__ import annotations

import json
import tempfile
from pathlib import Path

from .currency import ReceiptFormatter
from .localization import LocalizationService
from .ranges import RangeManager
from .training_packs import default_packs


SAMPLE_CSV = """position,action,combo,frequency
BTN,open,QJo,0.48
BB,defend,A9s,0.55
"""


def run_demo() -> None:
    print("== Range ingestion (isolated temp directory) ==")
    with tempfile.TemporaryDirectory() as tmpdir:
        assets_root = Path(tmpdir) / "assets" / "canonical_ranges"
        manager = RangeManager(assets_root=assets_root)
        source_path = Path(tmpdir) / "cash_sample.csv"
        source_path.write_text(SAMPLE_CSV, encoding="utf-8")
        stored = manager.ingest_range(
            source_path,
            variant="cash",
            version="v1.1.0",
            description="Demo cash sample from CSV",
            source="demo",
            tags=["demo", "csv"],
        )
        print(f"Stored: {stored}")
        print("Manifest variants:", manager.list_variants())
        print("Cash versions:", manager.list_versions("cash"))

    print("\n== Default training packs ==")
    for pack in default_packs():
        print(f"Pack: {pack.name} -> {len(pack.drills)} drills")

    print("\n== Localization & receipts ==")
    localization = LocalizationService()
    receipts = ReceiptFormatter()
    en_receipt = receipts.format_receipt(amount=29.0, currency="usd", product="Standard Pack", locale="en")
    es_label = localization.translate("receipt.thank_you", locale="es")
    print(es_label)
    print(json.dumps(en_receipt, indent=2))


if __name__ == "__main__":
    run_demo()
