export interface SolverMetric {
  key: string;
  label: string;
  value: number;
  delta?: number;
  unit?: string;
}

export interface StrategyMixEntry {
  action: string;
  frequency: number; // 0-1
  ev: number;
}

export interface SpotDescriptor {
  id: string;
  game: string;
  board: string;
  position: string;
  stackDepth?: string;
}
