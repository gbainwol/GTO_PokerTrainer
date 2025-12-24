from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


@dataclass
class RangeEntry:
    """Metadata for a single canonical range."""

    variant: str
    version: str
    path: Path
    description: str = ""
    source: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variant": self.variant,
            "version": self.version,
            "path": str(self.path.relative_to(self.path.parents[3])),
            "description": self.description,
            "source": self.source,
            "tags": self.tags,
            "created_at": self.created_at,
        }


class RangeManager:
    """Manage canonical ranges as versioned assets.

    Ranges are stored under ``assets/canonical_ranges/<variant>/<version>/range.json``
    and tracked via ``manifest.json`` for quick lookup.
    """

    def __init__(self, assets_root: Optional[Path] = None) -> None:
        base_path = assets_root or Path(__file__).resolve().parent / "assets" / "canonical_ranges"
        self.assets_root = base_path
        self.manifest_path = self.assets_root / "manifest.json"
        self.assets_root.mkdir(parents=True, exist_ok=True)
        self._manifest = self._load_manifest()

    def _load_manifest(self) -> Dict[str, Dict[str, Dict[str, Any]]]:
        if self.manifest_path.exists():
            with self.manifest_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        return {}

    def _save_manifest(self) -> None:
        with self.manifest_path.open("w", encoding="utf-8") as handle:
            json.dump(self._manifest, handle, indent=2)

    def list_variants(self) -> List[str]:
        return sorted(self._manifest.keys())

    def list_versions(self, variant: str) -> List[str]:
        return sorted(self._manifest.get(variant, {}).keys())

    def get_range_path(self, variant: str, version: str) -> Path:
        return self.assets_root / variant / version / "range.json"

    def get_range(self, variant: str, version: str) -> Dict[str, Any]:
        range_path = self.get_range_path(variant, version)
        if not range_path.exists():
            raise FileNotFoundError(f"Range payload missing: {range_path}")
        with range_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def ingest_range(
        self,
        source_path: Path | str,
        variant: str,
        version: str,
        *,
        description: str = "",
        source: Optional[str] = None,
        tags: Optional[Iterable[str]] = None,
    ) -> Path:
        """Ingest a CSV or JSON range payload and store a canonical asset.

        Args:
            source_path: Path to the CSV/JSON file to import.
            variant: One of "cash", "mtt", or "icm".
            version: Semantic version string for the stored asset.
            description: Human-readable description for the manifest.
            source: Optional origin (e.g., script name, download URL).
            tags: Optional iterable of tags used for filtering.
        """

        normalized_variant = variant.lower()
        if normalized_variant not in {"cash", "mtt", "icm"}:
            raise ValueError("variant must be one of: cash, mtt, icm")

        incoming_path = Path(source_path)
        if not incoming_path.exists():
            raise FileNotFoundError(incoming_path)

        target_dir = self.assets_root / normalized_variant / version
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / "range.json"

        payload = self._normalize_payload(incoming_path)
        wrapped = {
            "variant": normalized_variant,
            "version": version,
            "description": description,
            "source": source,
            "tags": sorted(set(tags or [])),
            "hands": payload,
        }

        with target_path.open("w", encoding="utf-8") as handle:
            json.dump(wrapped, handle, indent=2)

        entry = RangeEntry(
            variant=normalized_variant,
            version=version,
            path=target_path,
            description=description,
            source=source,
            tags=list(sorted(set(tags or []))),
        )
        self._manifest.setdefault(normalized_variant, {})[version] = entry.to_dict()
        self._save_manifest()
        return target_path

    def _normalize_payload(self, incoming_path: Path) -> List[Dict[str, Any]]:
        if incoming_path.suffix.lower() == ".csv":
            with incoming_path.open("r", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                return [row for row in reader]

        with incoming_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            if isinstance(data, dict):
                # Often stored as {"hands": [...]} payloads
                if "hands" in data:
                    return list(data["hands"])
                return [data]
            if isinstance(data, list):
                return data
        raise ValueError("Unsupported range payload; expected CSV, JSON list, or JSON dict")

    def build_payload(self, variant: str) -> Dict[str, Any]:
        """Return a combined payload for all versions of a variant."""

        versions = self.list_versions(variant)
        if not versions:
            raise ValueError(f"No ranges registered for variant '{variant}'")
        aggregated: Dict[str, Any] = {"variant": variant, "versions": {}}
        for version in versions:
            aggregated["versions"][version] = self.get_range(variant, version)
        return aggregated


DEFAULT_MANAGER = RangeManager()
