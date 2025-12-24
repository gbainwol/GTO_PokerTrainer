from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional


@dataclass
class TranslationCatalog:
    locale: str
    strings: Dict[str, str]

    def translate(self, key: str, default: Optional[str] = None) -> str:
        return self.strings.get(key, default or key)


class LocalizationService:
    def __init__(self, locales_dir: Optional[Path] = None, fallback_locale: str = "en") -> None:
        self.locales_dir = locales_dir or Path(__file__).resolve().parent / "locales"
        self.fallback_locale = fallback_locale
        self.catalogs: Dict[str, TranslationCatalog] = {}
        self._load_catalogs()

    def _load_catalogs(self) -> None:
        if not self.locales_dir.exists():
            return
        for catalog_path in self.locales_dir.glob("*.json"):
            with catalog_path.open("r", encoding="utf-8") as handle:
                self.catalogs[catalog_path.stem] = TranslationCatalog(
                    locale=catalog_path.stem,
                    strings=json.load(handle),
                )

    def translate(self, key: str, locale: Optional[str] = None, *, default: Optional[str] = None) -> str:
        target_locale = (locale or self.fallback_locale).lower()
        catalog = self.catalogs.get(target_locale) or self.catalogs.get(self.fallback_locale)
        if not catalog:
            return default or key
        return catalog.translate(key, default=default)


DEFAULT_LOCALIZATION = LocalizationService()
