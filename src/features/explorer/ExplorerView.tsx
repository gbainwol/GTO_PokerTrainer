import React, { useMemo, useState } from "react";
import Heatmap, { HeatmapData } from "../../components/Heatmap";
import MixedStrategyPie from "../../components/MixedStrategyPie";
import SliderControl from "../../components/SliderControl";
import { buildWhyNarrative } from "../explanations/why";
import { SolverMetric, StrategyMixEntry, SpotDescriptor } from "../../types/solver";
import HistoryService from "../../services/history";

interface ExplorerViewProps {
  spot: SpotDescriptor;
  matrix: HeatmapData;
  mixes: StrategyMixEntry[];
  metrics: SolverMetric[];
  history: HistoryService;
}

export const ExplorerView: React.FC<ExplorerViewProps> = ({
  spot,
  matrix,
  mixes,
  metrics,
  history,
}) => {
  const [weight, setWeight] = useState(0.5);

  const { narrative } = useMemo(() => {
    return buildWhyNarrative(spot, metrics, mixes);
  }, [spot, metrics, mixes]);

  const adjustedMatrix = useMemo<HeatmapData>(() => {
    return matrix.map((row) =>
      row.map((cell) => ({ ...cell, value: cell.value * (0.5 + weight) }))
    );
  }, [matrix, weight]);

  const onSelect = (cellLabel: string) => {
    history.record({
      id: `${spot.id}-${cellLabel}-${Date.now()}`,
      type: "view",
      spot,
      timestamp: Date.now(),
      metadata: { cell: cellLabel },
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr" }}>
        <Heatmap
          title="Board/Range Heatmap"
          data={adjustedMatrix}
          min={0}
          max={5}
          onCellSelect={(cell) => onSelect(cell.label)}
        />
        <div style={{ display: "grid", gap: 12 }}>
          <MixedStrategyPie title="Mixed Strategy" slices={mixes.map((mix, index) => ({
            label: mix.action,
            value: mix.frequency,
            color: ["#22c55e", "#f97316", "#2563eb", "#e11d48"][index % 4],
          }))} />
          <SliderControl
            id="weight"
            label="Sensitivity Weight"
            min={0}
            max={1}
            step={0.05}
            value={weight}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={setWeight}
          />
        </div>
      </div>
      <div>
        <h3>Why?</h3>
        <pre style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
          {narrative}
        </pre>
      </div>
    </div>
  );
};

export default ExplorerView;
