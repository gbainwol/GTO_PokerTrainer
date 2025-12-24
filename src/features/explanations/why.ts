import { SolverMetric, StrategyMixEntry, SpotDescriptor } from "../../types/solver";

export interface WhyTemplate {
  spot: SpotDescriptor;
  headline: string;
  supportingPoints: string[];
  metrics: SolverMetric[];
  mixes?: StrategyMixEntry[];
  riskLevel?: "low" | "medium" | "high";
}

export interface LlmAdapter {
  generate: (template: WhyTemplate) => Promise<string>;
}

export interface BuildWhyExplanationOptions {
  templateOnly?: boolean;
  llmAdapter?: LlmAdapter;
}

export interface WhyNarrative {
  template: WhyTemplate;
  narrative: string;
}

const formatMetric = (metric: SolverMetric) => {
  const delta = typeof metric.delta === "number" ? ` (Δ${metric.delta.toFixed(2)})` : "";
  const suffix = metric.unit ? ` ${metric.unit}` : "";
  return `${metric.label}: ${metric.value.toFixed(2)}${suffix}${delta}`;
};

export const buildWhyTemplate = (
  spot: SpotDescriptor,
  metrics: SolverMetric[],
  mixes?: StrategyMixEntry[]
): WhyTemplate => {
  const highSensitivity = metrics.find((m) => m.delta && Math.abs(m.delta) > 1.5);
  const headline = highSensitivity
    ? `${spot.position} strategy is highly sensitive to ${highSensitivity.label.toLowerCase()}`
    : `${spot.position} strategy is stable for ${spot.board}`;

  const supportingPoints = [
    `Top driver: ${metrics[0]?.label ?? "unknown"} is shaping EV decisions.`,
    metrics[1] ? `Secondary: ${metrics[1].label} shows notable shift.` : "",
    mixes?.length
      ? `Dominant action: ${[...mixes].sort((a, b) => b.frequency - a.frequency)[0].action}`
      : "",
  ].filter(Boolean);

  const riskLevel = highSensitivity
    ? Math.abs(highSensitivity.delta ?? 0) > 3
      ? "high"
      : "medium"
    : "low";

  return {
    spot,
    headline,
    supportingPoints,
    metrics,
    mixes,
    riskLevel,
  };
};

export const buildWhyNarrative = (
  spot: SpotDescriptor,
  metrics: SolverMetric[],
  mixes?: StrategyMixEntry[]
): WhyNarrative => {
  const template = buildWhyTemplate(spot, metrics, mixes);
  const narrative = [
    template.headline,
    ...template.supportingPoints,
    `Metrics → ${template.metrics.map(formatMetric).join(", ")}`,
  ].join("\n");

  return { template, narrative };
};

export const buildWhyExplanation = async (
  spot: SpotDescriptor,
  metrics: SolverMetric[],
  mixes?: StrategyMixEntry[],
  options?: BuildWhyExplanationOptions
): Promise<WhyNarrative> => {
  const template = buildWhyTemplate(spot, metrics, mixes);

  if (options?.templateOnly || !options?.llmAdapter) {
    return buildWhyNarrative(spot, metrics, mixes);
  }

  const narrative = await options.llmAdapter.generate(template);
  return { template, narrative };
};
