import React, { useMemo, useState } from "react";
import Heatmap, { HeatmapData } from "../../components/Heatmap";
import MixedStrategyPie from "../../components/MixedStrategyPie";
import SliderControl from "../../components/SliderControl";
import { buildWhyNarrative } from "../explanations/why";
import { SolverMetric, StrategyMixEntry, SpotDescriptor } from "../../types/solver";
import HistoryService from "../../services/history";

interface TrainingViewProps {
  spot: SpotDescriptor;
  prompt: string;
  matrix: HeatmapData;
  mixes: StrategyMixEntry[];
  metrics: SolverMetric[];
  history: HistoryService;
}

export const TrainingView: React.FC<TrainingViewProps> = ({
  spot,
  prompt,
  matrix,
  mixes,
  metrics,
  history,
}) => {
  const [answerMix, setAnswerMix] = useState(0.5);
  const { narrative } = useMemo(() => buildWhyNarrative(spot, metrics, mixes), [spot, metrics, mixes]);

  const onSubmit = (action: string) => {
    history.record({
      id: `${spot.id}-${action}-${Date.now()}`,
      type: "drill",
      spot,
      timestamp: Date.now(),
      metadata: { action, answerMix },
    });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
        <div style={{ fontWeight: 700 }}>{spot.board}</div>
        <div style={{ opacity: 0.75 }}>{prompt}</div>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr" }}>
        <Heatmap
          title="Feedback Heatmap"
          data={matrix}
          min={0}
          max={5}
          onCellSelect={(cell) => onSubmit(cell.label)}
        />
        <div style={{ display: "grid", gap: 10 }}>
          <SliderControl
            id="mix"
            label="Answer Mix"
            min={0}
            max={1}
            step={0.05}
            value={answerMix}
            format={(v) => `${(v * 100).toFixed(0)}% aggressive`}
            onChange={setAnswerMix}
          />
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={() => onSubmit("bet")}>Bet</button>
            <button onClick={() => onSubmit("check")}>Check</button>
          </div>
          <MixedStrategyPie
            title="Solution Mix"
            slices={mixes.map((mix, index) => ({
              label: mix.action,
              value: mix.frequency,
              color: ["#16a34a", "#0ea5e9", "#f97316", "#e11d48"][index % 4],
            }))}
          />
        </div>
      </div>
      <div>
        <h3>Why?</h3>
        <pre style={{ background: "#eef2ff", padding: 12, borderRadius: 8 }}>
          {narrative}
        </pre>
      </div>
    </div>
  );
};

export default TrainingView;
