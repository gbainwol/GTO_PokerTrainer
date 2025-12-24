import React from "react";

export type HeatmapCell = {
  label: string;
  value: number;
  annotation?: string;
};

export type HeatmapData = HeatmapCell[][];

export interface HeatmapProps {
  title?: string;
  data: HeatmapData;
  min?: number;
  max?: number;
  onCellHover?: (cell: HeatmapCell) => void;
  onCellSelect?: (cell: HeatmapCell) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const colorForValue = (value: number, min: number, max: number) => {
  if (max === min) return "rgb(200, 200, 200)";
  const normalized = (clamp(value, min, max) - min) / (max - min);
  const hue = 140 * normalized; // green (low) to red (high)
  return `hsl(${hue}, 70%, 55%)`;
};

export const Heatmap: React.FC<HeatmapProps> = ({
  title,
  data,
  min = 0,
  max = 1,
  onCellHover,
  onCellSelect,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title && (
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center" }}>
          <span>{title}</span>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${data[0]?.length ?? 0}, minmax(0, 1fr))`,
          gap: 2,
        }}
      >
        {data.flatMap((row, rowIndex) =>
          row.map((cell, columnIndex) => {
            const key = `${rowIndex}-${columnIndex}-${cell.label}`;
            const background = colorForValue(cell.value, min, max);
            return (
              <div
                key={key}
                title={cell.annotation ?? cell.label}
                onMouseEnter={() => onCellHover?.(cell)}
                onClick={() => onCellSelect?.(cell)}
                style={{
                  background,
                  minHeight: 36,
                  padding: 6,
                  borderRadius: 4,
                  color: "#0f172a",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>{cell.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {cell.value.toFixed(2)}
                </div>
                {cell.annotation && (
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                    {cell.annotation}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Heatmap;
