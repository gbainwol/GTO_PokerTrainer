import React from "react";

export interface SliderControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => v.toFixed(2),
  onChange,
}) => (
  <label
    htmlFor={id}
    style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}
  >
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(value)}</span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ accentColor: "#2563eb", width: "100%" }}
    />
  </label>
);

export default SliderControl;
