# GTO Poker Trainer Asset Toolkit

This repository provides building blocks for managing poker training assets:

- **Canonical ranges** for cash, MTT, and ICM formats with versioned storage and manifest metadata.
- **Betting presets** to standardize bet sizes/trees per stake and game type.
- **Default training packs** that bundle ranges, presets, and drills.
- **Localization scaffolding** for UI/receipts along with configurable currencies.

The code focuses on portability and zero external dependencies so it can run in CI or offline environments.

## Getting started

```bash
python -m gto_pokertrainer.demo
```

The demo shows how to ingest a range file, list installed presets, and format a localized receipt.

## Project layout

- `gto_pokertrainer/ranges.py` – range ingestion and manifest management
- `gto_pokertrainer/presets.py` – bet size/tree presets and lookup helpers
- `gto_pokertrainer/training_packs.py` – bundled drills that reference ranges and presets
- `gto_pokertrainer/localization.py` – translation scaffolding with JSON catalogs
- `gto_pokertrainer/currency.py` – currency configuration and receipt helpers
- `gto_pokertrainer/assets/` – built-in ranges and training pack payloads
- `gto_pokertrainer/locales/` – translation catalogs (JSON)
- `gto_pokertrainer/config/` – currency configurations

## Versioned ranges

The range ingestor accepts CSV or JSON payloads, normalizes them, and writes them to `assets/canonical_ranges/{variant}/{version}/range.json` while updating `manifest.json`. The manifest can power UI selectors or remote syncing.

## Presets and training packs

Bet size presets are grouped by stake and game type. Training packs link presets with canonical ranges so the trainer can ship ready-to-use drills out of the box.

## Localization and pricing

`LocalizationService` reads JSON catalogs to translate keys, and `ReceiptFormatter` applies currency symbols/precision so pricing screens and receipts remain consistent across locales.

## Development

This repo uses only the Python standard library. You can run a quick syntax check:

```bash
python -m compileall gto_pokertrainer
```

Add new canonical ranges by dropping CSV/JSON into the repo and calling `RangeManager.ingest_range(...)`.
