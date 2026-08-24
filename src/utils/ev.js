const toDecimal = (value) => Math.max(0, Math.min(1, value / 100));

export const calculateCallEV = ({ pot, callSize, equity }) => {
  const eq = toDecimal(equity);
  return eq * (pot + callSize) - (1 - eq) * callSize;
};

export const calculateBetEV = ({ pot, betSize, equity, foldEquity }) => {
  const eq = toDecimal(equity);
  const fe = toDecimal(foldEquity);
  const calledEV = eq * (pot + 2 * betSize) - (1 - eq) * betSize;
  return fe * pot + (1 - fe) * calledEV;
};

export const calculateRaiseEV = ({ pot, raiseSize, equity, foldEquity }) => {
  const eq = toDecimal(equity);
  const fe = toDecimal(foldEquity);
  const calledEV = eq * (pot + 2 * raiseSize) - (1 - eq) * raiseSize;
  return fe * pot + (1 - fe) * calledEV;
};

export const calculateFoldEV = () => 0;

export const calculateKellyFraction = ({ pot, bet, equity }) => {
  const p = Math.max(0, Math.min(1, equity));
  const q = 1 - p;
  const b = bet > 0 ? pot / bet : 0;
  if (b <= 0) return 0;
  const f = (b * p - q) / b;
  return Math.max(0, Math.min(1, f));
};
