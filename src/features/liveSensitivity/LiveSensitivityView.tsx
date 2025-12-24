import React, { useMemo, useState } from "react";
import Heatmap, { HeatmapData } from "../../components/Heatmap";
import SliderControl from "../../components/SliderControl";
import { buildWhyNarrative } from "../explanations/why";
import { SolverMetric, SpotDescriptor } from "../../types/solver";
import HistoryService from "../../services/history";

interface LiveSensitivityProps {
  spot: SpotDescriptor;
  baseline: HeatmapData;
  metrics: SolverMetric[];
  history: HistoryService;
}

export const LiveSensitivityView: React.FC<LiveSensitivityProps> = ({
  spot,
  baseline,
  metrics,
  history,
}) => {
  const [betSize, setBetSize] = useState(0.33);
  const [rangeTightness, setRangeTightness] = useState(0.5);

  const adjusted = useMemo<HeatmapData>(() => {
    return baseline.map((row) =>
      row.map((cell) => ({
        ...cell,
        value: cell.value + betSize * 2 - rangeTightness,
        annotation: `Δ ${((betSize - 0.33) * 10).toFixed(2)} EV`,
      }))
    );
  }, [baseline, betSize, rangeTightness]);

  const { narrative } = useMemo(() => buildWhyNarrative(spot, metrics, undefined), [spot, metrics]);

  const logInteraction = (label: string) => {
    history.record({
      id: `${spot.id}-${label}-${Date.now()}`,
      spot,
      type: "view",
      timestamp: Date.now(),
      metadata: { betSize, rangeTightness },
    });
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Heatmap
          title="Sensitivity Heatmap"
          data={adjusted}
          min={-5}
          max={5}
          onCellSelect={(cell) => logInteraction(cell.label)}
        />
        <div style={{ display: "grid", gap: 12 }}>
          <SliderControl
            id="bet-size"
            label="Bet Sizing"
            min={0.1}
            max={1}
            step={0.05}
            value={betSize}
            format={(v) => `${(v * 100).toFixed(0)}% pot`}
            onChange={(value) => {
              setBetSize(value);
              logInteraction("bet-size-change");
            }}
          />
          <SliderControl
            id="range-tightness"
            label="Range Tightness"
            min={0}
            max={1}
            step={0.05}
            value={rangeTightness}
            format={(v) => `${(v * 100).toFixed(0)}% tight`}
            onChange={(value) => {
              setRangeTightness(value);
              logInteraction("range-change");
            }}
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

export default LiveSensitivityView;
