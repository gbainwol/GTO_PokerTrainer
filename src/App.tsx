import React from "react";
import ExplorerView from "./features/explorer/ExplorerView";
import LiveSensitivityView from "./features/liveSensitivity/LiveSensitivityView";
import TrainingView from "./features/training/TrainingView";
import LeakReviewView from "./features/leakReview/LeakReviewView";
import HistoryService from "./services/history";
import { SolverMetric, SpotDescriptor, StrategyMixEntry } from "./types/solver";

const history = new HistoryService();

const sampleSpot: SpotDescriptor = {
  id: "spot-1",
  game: "NLH",
  board: "Ah Kc 4s",
  position: "BTN vs BB",
  stackDepth: "50bb",
};

const sampleMatrix = [
  [
    { label: "Bet small", value: 1.5 },
    { label: "Bet big", value: 2.1 },
    { label: "Check", value: 0.4 },
  ],
  [
    { label: "Fold", value: -0.2 },
    { label: "Call", value: 1.8 },
    { label: "Raise", value: 2.8 },
  ],
];

const sampleMetrics: SolverMetric[] = [
  { key: "ev", label: "EV", value: 2.1, delta: 0.4, unit: "bb" },
  { key: "exploit", label: "Exploitability", value: 0.12, delta: -0.03, unit: "%" },
  { key: "freq", label: "Aggression Frequency", value: 0.63 },
];

const sampleMixes: StrategyMixEntry[] = [
  { action: "Bet small", frequency: 0.45, ev: 1.5 },
  { action: "Bet big", frequency: 0.3, ev: 2.1 },
  { action: "Check", frequency: 0.25, ev: 0.4 },
];

const leakSummaries = [
  { spot: sampleSpot, evLoss: 3.4 },
  { spot: { ...sampleSpot, id: "spot-2", board: "Qs Jd 7c" }, evLoss: 2.2 },
];

const App: React.FC = () => {
  return (
    <div style={{ display: "grid", gap: 28, padding: 24 }}>
      <ExplorerView
        spot={sampleSpot}
        matrix={sampleMatrix}
        mixes={sampleMixes}
        metrics={sampleMetrics}
        history={history}
      />
      <LiveSensitivityView
        spot={sampleSpot}
        baseline={sampleMatrix}
        metrics={sampleMetrics}
        history={history}
      />
      <TrainingView
        spot={sampleSpot}
        prompt="BTN vs BB, SPR 4.5, choose your action."
        matrix={sampleMatrix}
        mixes={sampleMixes}
        metrics={sampleMetrics}
        history={history}
      />
      <LeakReviewView
        aggregated={sampleMatrix}
        leaks={leakSummaries}
        metrics={sampleMetrics}
        history={history}
      />
    </div>
  );
};

export default App;
