"""Lightweight CLI prototype for a GTO poker trainer.

Run with: `gto-pokertrainer --demo`
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from typing import List, Sequence


SUITS = ["♠", "♥", "♦", "♣"]
RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]


@dataclass(frozen=True)
class Card:
    rank: str
    suit: str

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return f"{self.rank}{self.suit}"


class Deck:
    """Simple in-memory deck."""

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)
        self._cards: List[Card] = [Card(rank, suit) for suit in SUITS for rank in RANKS]

    def shuffle(self) -> None:
        self._rng.shuffle(self._cards)

    def deal(self, count: int = 2) -> List[Card]:
        if count > len(self._cards):
            raise ValueError("Not enough cards left in the deck to deal.")
        return [self._cards.pop() for _ in range(count)]


def suggest_action(hand: Sequence[Card]) -> str:
    """Placeholder action suggestion based on high-card strength.

    Replace this with solver integration, strategy tables, or ML inference.
    """
    ranks_in_hand = [card.rank for card in hand]
    high_card = min(ranks_in_hand, key=RANKS.index)
    if high_card in {"A", "K", "Q"}:
        return "Open-raise (strong starting hand)"
    if high_card in {"J", "T", "9"}:
        return "Consider calling or raising depending on position"
    return "Fold or call cheaply; look for better spots"


def format_hand(hand: Sequence[Card]) -> str:
    return " ".join(str(card) for card in hand)


def run_demo(hands: int, seed: int | None) -> None:
    deck = Deck(seed=seed)
    deck.shuffle()
    for i in range(1, hands + 1):
        hand = deck.deal(2)
        action = suggest_action(hand)
        print(f"Hand {i}: {format_hand(hand)} -> {action}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="GTO PokerTrainer prototype CLI")
    parser.add_argument(
        "--hands",
        type=int,
        default=3,
        help="Number of hands to deal in demo mode (default: 3)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional RNG seed for reproducible hands",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run the demo mode (deals hands and prints suggestions)",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.demo:
        parser.print_help()
        return

    run_demo(hands=args.hands, seed=args.seed)


if __name__ == "__main__":
    main()
