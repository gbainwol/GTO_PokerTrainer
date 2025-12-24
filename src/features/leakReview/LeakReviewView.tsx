import React, { useMemo } from "react";
import Heatmap, { HeatmapData } from "../../components/Heatmap";
import { buildWhyNarrative } from "../explanations/why";
import { SolverMetric, SpotDescriptor } from "../../types/solver";
import HistoryService from "../../services/history";

export interface LeakSummary {
  spot: SpotDescriptor;
  evLoss: number;
}

interface LeakReviewViewProps {
  aggregated: HeatmapData;
  leaks: LeakSummary[];
  metrics: SolverMetric[];
  history: HistoryService;
}

export const LeakReviewView: React.FC<LeakReviewViewProps> = ({
  aggregated,
  leaks,
  metrics,
  history,
}) => {
  const mainSpot = leaks[0]?.spot ?? {
    id: "unknown",
    game: "",
    board: "",
    position: "",
  };
  const { narrative } = useMemo(() => buildWhyNarrative(mainSpot, metrics, undefined), [mainSpot, metrics]);

  const bookmarkLeak = (leak: LeakSummary) => {
    history.pin(leak.spot);
    history.record({
      id: `${leak.spot.id}-pin-${Date.now()}`,
      spot: leak.spot,
      type: "leak",
      timestamp: Date.now(),
      metadata: { evLoss: leak.evLoss },
    });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Heatmap title="EV Leak Heatmap" data={aggregated} min={0} max={10} />
      <div style={{ display: "grid", gap: 8 }}>
        {leaks.map((leak) => (
          <div
            key={leak.spot.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              background: "#f8fafc",
              padding: 10,
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{leak.spot.board}</div>
              <div style={{ opacity: 0.75 }}>{leak.spot.position}</div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                EV Loss: {leak.evLoss.toFixed(2)}
              </div>
            </div>
            <button onClick={() => bookmarkLeak(leak)}>Bookmark</button>
          </div>
        ))}
      </div>
      <div>
        <h3>Why?</h3>
        <pre style={{ background: "#fff7ed", padding: 12, borderRadius: 8 }}>
          {narrative}
        </pre>
      </div>
    </div>
  );
};

export default LeakReviewView;
