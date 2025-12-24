from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict


@dataclass
class CurrencySetting:
    code: str
    symbol: str
    precision: int
    locale: str

    def format_amount(self, amount: float) -> str:
        rounded = round(amount, self.precision)
        formatted = f"{rounded:,.{self.precision}f}"
        return f"{self.symbol}{formatted}"


class CurrencyConfig:
    def __init__(self, config_dir: Path | None = None) -> None:
        base_dir = config_dir or Path(__file__).resolve().parent / "config"
        self.config_path = base_dir / "currencies.json"
        self.currencies: Dict[str, CurrencySetting] = {}
        self._load()

    def _load(self) -> None:
        if not self.config_path.exists():
            return
        with self.config_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        for code, entry in payload.items():
            self.currencies[code.lower()] = CurrencySetting(
                code=code.upper(),
                symbol=entry.get("symbol", "$"),
                precision=int(entry.get("precision", 2)),
                locale=entry.get("locale", "en"),
            )

    def get(self, code: str) -> CurrencySetting:
        normalized = code.lower()
        if normalized not in self.currencies:
            raise KeyError(f"Currency '{code}' is not configured")
        return self.currencies[normalized]


class ReceiptFormatter:
    def __init__(self, currency_config: CurrencyConfig | None = None) -> None:
        self.currency_config = currency_config or CurrencyConfig()

    def format_receipt(self, *, amount: float, currency: str, product: str, locale: str) -> Dict[str, str]:
        currency_setting = self.currency_config.get(currency)
        return {
            "product": product,
            "currency": currency_setting.code,
            "locale": locale,
            "total": currency_setting.format_amount(amount),
            "note": f"Pricing shown in {currency_setting.code} (locale {currency_setting.locale})",
        }


DEFAULT_RECEIPTS = ReceiptFormatter()
