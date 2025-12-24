from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from .presets import BetSizePreset, DEFAULT_PRESETS, find_preset


@dataclass
class Drill:
    name: str
    spots: List[str]
    preset: BetSizePreset
    range_variant: str
    range_version: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "spots": self.spots,
            "preset": self.preset.to_dict(),
            "range_variant": self.range_variant,
            "range_version": self.range_version,
        }


@dataclass
class TrainingPack:
    name: str
    description: str
    drills: List[Drill] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "drills": [drill.to_dict() for drill in self.drills],
        }


_DEFAULT_PACKS: List[TrainingPack] = []


def _build_default_packs() -> List[TrainingPack]:
    if _DEFAULT_PACKS:
        return _DEFAULT_PACKS

    cash_preset = find_preset("$1/$2", "cash") or DEFAULT_PRESETS[0]
    mtt_preset = find_preset("$55 MTT", "mtt") or DEFAULT_PRESETS[1]
    icm_preset = find_preset("$215 FT", "icm") or DEFAULT_PRESETS[2]

    _DEFAULT_PACKS.extend(
        [
            TrainingPack(
                name="Cash Fundamentals",
                description="Starter drills that pair micro-stake cash ranges with balanced sizing trees.",
                drills=[
                    Drill(
                        name="SRP BTN vs BB",
                        spots=["BTN open", "BB defend"],
                        preset=cash_preset,
                        range_variant="cash",
                        range_version="v1.0.0",
                    ),
                    Drill(
                        name="3BP CO vs BTN",
                        spots=["CO 3-bet", "BTN call"],
                        preset=cash_preset,
                        range_variant="cash",
                        range_version="v1.0.0",
                    ),
                ],
            ),
            TrainingPack(
                name="MTT Day 2",
                description="Late-stage MTT spots with ICM-leaning sizings and mid-stack ranges.",
                drills=[
                    Drill(
                        name="HJ vs BB 40bb",
                        spots=["HJ open", "BB defend"],
                        preset=mtt_preset,
                        range_variant="mtt",
                        range_version="v1.0.0",
                    ),
                    Drill(
                        name="BTN vs SB 30bb",
                        spots=["BTN open", "SB 3-bet"],
                        preset=mtt_preset,
                        range_variant="mtt",
                        range_version="v1.0.0",
                    ),
                ],
            ),
            TrainingPack(
                name="ICM Final Table",
                description="Bubble-guarded drills tuned for pay-jump pressure and capped rivers.",
                drills=[
                    Drill(
                        name="FT BTN vs BB 20bb",
                        spots=["BTN shove/call", "BB reshove"],
                        preset=icm_preset,
                        range_variant="icm",
                        range_version="v1.0.0",
                    ),
                    Drill(
                        name="FT SB vs BB 15bb",
                        spots=["SB limp", "BB iso"],
                        preset=icm_preset,
                        range_variant="icm",
                        range_version="v1.0.0",
                    ),
                ],
            ),
        ]
    )
    return _DEFAULT_PACKS


def default_packs() -> List[TrainingPack]:
    return list(_build_default_packs())
