# GTO PokerTrainer (Prototype)

This repository currently contains a lightweight, local-first prototype to help you start iterating on a Game Theory Optimal (GTO) poker training tool. It is designed to run easily on a macOS laptop (tested on 32 GB RAM) and provides a small, editable CLI you can extend with more sophisticated logic, solvers, or UI layers.

## Quick start

### Prerequisites
- macOS with Python 3.10+ installed (built-in on most Macs; otherwise install via Homebrew: `brew install python`)
- Git (preinstalled on macOS)

### Set up and run
```bash
git clone <repo-url>
cd GTO_PokerTrainer
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\\Scripts\\activate
pip install --upgrade pip
pip install -e .

# Run the prototype trainer
gto-pokertrainer --demo
```

The `--demo` flag deals a few random hands and prints a simple, placeholder action suggestion. Edit the CLI to add your own training logic.

> **No-internet fallback:** If package installation is blocked, you can still run the prototype without installing:
> ```bash
> export PYTHONPATH=src
> python -m gto_pokertrainer.cli --demo
> ```

### Project structure
- `src/gto_pokertrainer/cli.py` — Runnable prototype CLI with a basic deck model and action suggestion stub.
- `pyproject.toml` — Minimal packaging metadata; enables `pip install -e .` and the `gto-pokertrainer` console script.
- `README.md` — This guide.

## Using the prototype

- **Deal custom hands:** `gto-pokertrainer --hands 1 --seed 42`
- **Extend logic:** Open `src/gto_pokertrainer/cli.py` and replace `suggest_action` with your own heuristics, solver calls, or model inferences.
- **Integrate with a UI:** Keep `cli.py` as a pure Python module and import its functions from a web backend (FastAPI/Flask) or a desktop UI.
- **Logging/analytics:** Add instrumentation in `main()` to record decisions, timings, or user feedback.

## Development workflow
1. Create or activate the virtual environment.
2. Install in editable mode: `pip install -e .`
3. Modify the code under `src/gto_pokertrainer/`.
4. Run the CLI: `gto-pokertrainer --demo`
5. (Optional) Add tests under a `tests/` folder and run with `pytest`.

## Next steps (suggested)
- Replace the placeholder action generator with a proper solver or strategy table.
- Add a persistence layer (SQLite/PostgreSQL) to track sessions and progress.
- Expose an HTTP API (e.g., FastAPI) so a web or mobile client can consume the trainer.
- Add tests, linters, and CI to keep contributions healthy.

## Troubleshooting
- **Command not found (`gto-pokertrainer`):** Ensure the virtual environment is activated, or run `python -m gto_pokertrainer.cli`.
- **Using a different Python version:** Update the `python -m venv .venv` line to point to your preferred interpreter, e.g., `/opt/homebrew/bin/python3 -m venv .venv`.
