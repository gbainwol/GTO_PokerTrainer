# Product Architecture Overview

This document maps the requested features into a modular, front-end oriented architecture with clear data flows and component responsibilities. All code references live under `src/` and are platform-agnostic React components and service modules.

## Visualization primitives
- **Heatmap** (`src/components/Heatmap.tsx`): renders 2D matrices with optional annotations and sensitivity gradients.
- **SliderControl** (`src/components/SliderControl.tsx`): shared for bet sizing, difficulty, mix adjustments, and sensitivity toggles.
- **MixedStrategyPie** (`src/components/MixedStrategyPie.tsx`): expresses action mixes using grouped segments and inline legends.

These components are pure and accept data + callbacks; feature views compose them.

## Why-explanations
- **Template builder** (`src/features/explanations/why.ts`): normalizes solver metrics (EV deltas, exploitability, frequency shifts) into a structured template.
- **LLM/NLG hook**: optionally forwards the template to an `llmAdapter` to convert metrics into natural language with guardrails (max tokens, safety filters).
- **Consumption**: Explorer, Live Sensitivity, Training, and Leak Review import `buildWhyExplanation` to generate explanations for their contexts.

## History, bookmarks, and sync
- **HistoryService** (`src/services/history.ts`): records navigation events, training attempts, and saved “spots.”
- **Bookmark + pinned sync**: writes to local storage for offline resilience and syncs via a pluggable `SyncAdapter` (placeholder in the service) to propagate pinned spots across devices.
- **Selectors**: views read from the service to render recent history and apply pinned states to controls.

## Feature surfaces
- **Explorer** (`src/features/explorer/ExplorerView.tsx`): Board/position filters feeding heatmaps, mixed-strategy visualization, and “Why?” panel with solver metrics.
- **Live Sensitivity** (`src/features/liveSensitivity/LiveSensitivityView.tsx`): interactive sliders that recompute sensitivity highlights and explanations.
- **Training** (`src/features/training/TrainingView.tsx`): drill prompt, answer input, feedback heatmap + pie, and explanation.
- **Leak Review** (`src/features/leakReview/LeakReviewView.tsx`): aggregates EV leaks, links to Explorer, and shares the same explanation + bookmark UX.

## Data flow summary
1. User selects a spot or drill; view requests solver metrics from upstream (simulated via props in stubs).
2. Visualization components render primary data (heatmaps, pies, sliders).
3. `buildWhyExplanation` shapes metrics into templated narratives; optional LLM call enriches copy.
4. User interactions write into `HistoryService`, which persists locally and syncs pinned spots when connected.
5. Bookmarked spots are available across Explorer, Training, and Leak Review via the shared service.

## Extension hooks
- Swap the `llmAdapter` with a production API client.
- Replace `SyncAdapter` stub with real network persistence.
- Wire feature views to real solver endpoints and state managers.
