import React from "react";

export interface StrategySlice {
  label: string;
  value: number; // 0-1 normalized probability
  color: string;
}

export interface MixedStrategyPieProps {
  title?: string;
  slices: StrategySlice[];
  radius?: number;
}

const polarToCartesian = (centerX: number, centerY: number, radius: number, angle: number) => {
  const rad = ((angle - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(rad),
    y: centerY + radius * Math.sin(rad),
  };
};

const describeArc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    "L",
    x,
    y,
    "Z",
  ].join(" ");
};

export const MixedStrategyPie: React.FC<MixedStrategyPieProps> = ({
  title,
  slices,
  radius = 52,
}) => {
  let cumulative = 0;
  const center = radius + 8;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title && <div style={{ fontWeight: 600 }}>{title}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <svg width={(center + 4) * 2} height={(center + 4) * 2} role="img">
          {slices.map((slice, index) => {
            const startAngle = cumulative * 360;
            cumulative += slice.value / total;
            const endAngle = cumulative * 360;
            return (
              <path
                key={`${slice.label}-${index}`}
                d={describeArc(center, center, radius, startAngle, endAngle)}
                fill={slice.color}
                stroke="#0f172a"
                strokeWidth={1}
                opacity={slice.value > 0 ? 1 : 0.15}
              />
            );
          })}
        </svg>
        <div style={{ display: "grid", gap: 6 }}>
          {slices.map((slice) => (
            <div key={slice.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 4,
                  background: slice.color,
                }}
              />
              <span style={{ fontWeight: 600 }}>{slice.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>
                {(slice.value * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MixedStrategyPie;
