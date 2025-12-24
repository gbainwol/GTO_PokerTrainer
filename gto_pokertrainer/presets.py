from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class BetTree:
    street: str
    sizes: List[float]
    allow_all_in: bool = True

    def to_dict(self) -> Dict[str, object]:
        return {"street": self.street, "sizes": self.sizes, "allow_all_in": self.allow_all_in}


@dataclass
class BetSizePreset:
    name: str
    stake: str
    game_type: str
    description: str
    tree: List[BetTree] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "stake": self.stake,
            "game_type": self.game_type,
            "description": self.description,
            "tree": [street.to_dict() for street in self.tree],
        }


DEFAULT_PRESETS: List[BetSizePreset] = [
    BetSizePreset(
        name="Cash 100NL - Balanced",
        stake="$1/$2",
        game_type="cash",
        description="Balanced sizings for SRP/3bp/4bp with polarized river options.",
        tree=[
            BetTree("flop", [33, 66, 100]),
            BetTree("turn", [50, 100]),
            BetTree("river", [75, 125], allow_all_in=True),
        ],
    ),
    BetSizePreset(
        name="MTT 60bb - Ladder Safe",
        stake="$55 MTT",
        game_type="mtt",
        description="ICM-aware sizings that emphasize small c-bets and capped rivers.",
        tree=[
            BetTree("flop", [25, 40]),
            BetTree("turn", [50, 75], allow_all_in=False),
            BetTree("river", [60, 90], allow_all_in=False),
        ],
    ),
    BetSizePreset(
        name="ICM Final Table - Bubble Guard",
        stake="$215 FT",
        game_type="icm",
        description="Tightened aggression with reduced overbets to respect payout ladder.",
        tree=[
            BetTree("flop", [20, 33]),
            BetTree("turn", [40, 70], allow_all_in=False),
            BetTree("river", [50, 80], allow_all_in=False),
        ],
    ),
]


def find_preset(stake: str, game_type: str) -> Optional[BetSizePreset]:
    normalized = game_type.lower()
    for preset in DEFAULT_PRESETS:
        if preset.stake == stake and preset.game_type == normalized:
            return preset
    return None


def presets_by_game(game_type: str) -> List[BetSizePreset]:
    normalized = game_type.lower()
    return [preset for preset in DEFAULT_PRESETS if preset.game_type == normalized]
