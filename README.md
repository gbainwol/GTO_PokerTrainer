# GTO Poker Trainer Frontend

A Vite + React + TypeScript prototype that outlines the poker trainer experience. The starter UI includes a table view, control panel, and stats area so designers and engineers can iterate quickly on the interaction model.

## Getting started

1. Install dependencies (Node 18+ recommended):

   ```bash
   cd frontend
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

   Vite serves the app at `http://localhost:5173` by default.

3. Build for production:

   ```bash
   npm run build
   ```

4. Lint the codebase:

   ```bash
   npm run lint
   ```

## Project structure

```
frontend/
├── src/
│   ├── components/     # Table, controls, and stats panels
│   ├── pages/          # Routed screens
│   ├── state/          # Shared trainer state provider
│   └── styles/         # Global styles
├── index.html          # Vite entry
├── vite.config.ts      # Vite configuration
└── tsconfig*.json      # TypeScript configs
```

The shared `TrainerStateProvider` delivers a simple reducer-backed store for the prototype. Routing is powered by `react-router-dom`, and the layout scaffolding includes a top-level shell with navigation, allowing additional trainer views to be added easily.
