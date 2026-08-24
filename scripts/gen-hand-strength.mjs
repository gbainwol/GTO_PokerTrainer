/**
 * Regenerates src/engine/handStrength.js.
 *
 * Simulates each of the 169 distinct starting hands heads-up against a
 * uniformly random opponent and writes the resulting equity ordering out as a
 * static data module, so the app pays no startup cost for it.
 *
 * Usage: node scripts/gen-hand-strength.mjs
 */
import { writeFileSync } from "node:fs";
import { calculateEquity } from "../src/engine/equity.js";
import { ALL_HAND_CODES, handCodeToCombos } from "../src/engine/range.js";

const ITERATIONS = 120000;
const TARGET_STDERR = 0.0006;
const SEED = 0x51ed5eed;

const rows = ALL_HAND_CODES.map((code) => {
  const [a, b] = handCodeToCombos(code)[0];
  const { equity } = calculateEquity({
    hero: [a, b],
    opponents: 1,
    maxIterations: ITERATIONS,
    targetStdErr: TARGET_STDERR,
    seed: SEED,
  });
  return [code, Math.round(equity * 10000) / 10000];
});

rows.sort((x, y) => y[1] - x[1]);

const body = rows.map(([code, eq]) => `  ["${code}", ${eq.toFixed(4)}],`).join("\n");

const header = [
  "/**",
  " * Preflop hand strength, ordered strongest to weakest.",
  " *",
  " * GENERATED FILE - do not edit by hand.",
  " * Regenerate with: node scripts/gen-hand-strength.mjs",
  " *",
  " * Each of the 169 distinct starting hands was simulated heads-up against a",
  ` * uniformly random opponent hand (${ITERATIONS.toLocaleString()} Monte Carlo trials).`,
  " * The values are that equity, so the ordering is derived from measured math",
  " * rather than folklore.",
  " *",
  " * This ranks raw all-in equity vs one random hand. It is the right metric for",
  " * shove/call decisions and a reasonable proxy for opening strength, but it does",
  " * not capture postflop playability - suited connectors are worth more in",
  " * deep-stacked multiway pots than this ordering alone implies.",
  " */",
  "",
].join("\n");

const footer = `
/** Hand code -> equity vs a random hand. */
export const STRENGTH_BY_CODE = new Map(HAND_STRENGTH);

/** Hand code -> rank. 0 = AA (strongest), 168 = 32o (weakest). */
export const RANK_BY_CODE = new Map(HAND_STRENGTH.map(([code], i) => [code, i]));

/**
 * The strongest \`percent\` of starting hands, measured by combo count rather
 * than hand-code count: "top 15%" means 15% of the 1326 possible combos.
 *
 * @param {number} percent
 * @param {(code: string) => number} comboCounts combos for a given hand code
 * @returns {string[]}
 */
export const topPercentCodes = (percent, comboCounts) => {
  const target = (Math.max(0, Math.min(100, percent)) / 100) * 1326;
  const out = [];
  let combos = 0;
  for (const [code] of HAND_STRENGTH) {
    if (combos >= target) break;
    out.push(code);
    combos += comboCounts(code);
  }
  return out;
};
`;

const source = `${header}/** @type {ReadonlyArray<[string, number]>} */
export const HAND_STRENGTH = [
${body}
];
${footer}`;

writeFileSync(new URL("../src/engine/handStrength.js", import.meta.url), source);
console.log(`Wrote ${rows.length} hands to src/engine/handStrength.js`);
console.log(
  `  strongest: ${rows[0][0]} ${(rows[0][1] * 100).toFixed(1)}%  |  weakest: ${
    rows[rows.length - 1][0]
  } ${(rows[rows.length - 1][1] * 100).toFixed(1)}%`
);
