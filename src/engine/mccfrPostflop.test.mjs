/**
 * Multiway postflop MCCFR validation.
 *
 * The headline test is a cross-check against the exact solver. On a heads-up
 * river spot both can solve the same game by completely different means - one
 * enumerates every runout and sweeps ranges in vector form, the other samples
 * runouts and opponent actions - so agreement is strong evidence for both.
 *
 * Beyond that: zero sum at every player count, sane multiway behaviour, and a
 * measurement of what the hand bucketing actually costs.
 */

import { makePostflopGame, coarseBucket } from "./mccfrPostflop.js";
import { solveMCCFR, evaluateStrategy, trainingQuality } from "./mccfr.js";
import { solveSubgame, expectedValue, OOP, IP } from "./solver.js";
import { cardToInt } from "./evaluator.js";
import { rangeToCombos } from "./range.js";

let failures = 0;
const ok = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(52)} ${detail}`);
};
const near = (label, a, b, tol) =>
  ok(label, Math.abs(a - b) <= tol, `${a.toFixed(4)} (expected ~${b.toFixed(4)} +/- ${tol})`);

const c = (s) => s.split(" ").map(cardToInt);
const combos = (list) => Int32Array.from(list.flatMap((h) => c(h)));

// ---------------------------------------------------------------------------
console.log("1. Heads-up river: MCCFR against the exact vector solver");
// ---------------------------------------------------------------------------

/*
 * Both solvers are handed the same tree: one bet size, no re-raises, no
 * all-in. Two things had to line up before they agreed.
 *
 * Action order. The betting engine starts postflop action left of the button,
 * so leaving buttonIndex at 0 made the *second* listed player act first - a
 * different game, and the values differed by 0.21 chips.
 *
 * Deal sampling. Drawing each player's hand in turn and re-drawing only on a
 * clash makes the first player's marginal uniform and everyone else's
 * conditional, which over-represents hands that block the other ranges. The
 * whole assignment is resampled instead.
 */
{
  const board = c("Ah 8d 5c 2s Ks");
  const oopRange = ["Ac Qd", "Kh Qh", "7h 7d", "Jc Tc"];
  const ipRange = ["Ad Jh", "Kc Jd", "9h 9s", "Qc Th"];
  const pot = 10;
  const stack = 10;

  const exact = solveSubgame({
    board,
    oopCombos: combos(oopRange),
    ipCombos: combos(ipRange),
    pot,
    effectiveStack: stack,
    iterations: 3000,
    treeConfig: { betSizes: [0.75], raiseSizes: [], maxRaises: 0, allowAllIn: false },
  });
  const exactOOP = expectedValue(exact, OOP);
  console.log(
    `       exact solver: OOP ${exactOOP.toFixed(4)}, IP ${expectedValue(exact, IP).toFixed(4)}, ` +
    `exploitability ${exact.exploitability.percentOfPot.toFixed(3)}% of pot`
  );

  const game = makePostflopGame({
    board,
    players: [
      { seat: "OOP", stack, range: combos(oopRange) },
      { seat: "IP", stack, range: combos(ipRange) },
    ],
    pot,
    betSizes: [0.75],
    maxRaises: 1,
    allowAllIn: false,
    bucketMode: "exact",
  });

  const deltas = [];
  let last = null;
  for (const iterations of [50000, 600000]) {
    const solved = solveMCCFR(game, { iterations, seed: 0x1234 });
    const evs = evaluateStrategy(game, solved.store, { samples: 300000, seed: 0x99 });
    deltas.push(Math.abs(evs[0].ev - exactOOP));
    last = { evs, solved };
    console.log(
      `       MCCFR ${String(iterations).padStart(6)} iters: OOP ${evs[0].ev.toFixed(4)} ` +
      `+/-${evs[0].confidence95.toFixed(4)}, delta ${deltas[deltas.length - 1].toFixed(4)}`
    );
  }

  ok("MCCFR moves toward the exact answer", deltas[1] < deltas[0],
     `${deltas[0].toFixed(4)} -> ${deltas[1].toFixed(4)}`);
  ok("MCCFR agrees with the exact solver inside its error bars",
     deltas[1] <= last.evs[0].confidence95 + 0.005,
     `delta ${deltas[1].toFixed(4)} vs 95% halfwidth ${last.evs[0].confidence95.toFixed(4)}`);
  near("MCCFR is zero sum", last.evs[0].ev + last.evs[1].ev, 0, 1e-9);
}

// ---------------------------------------------------------------------------
console.log("\n2. Multiway postflop: three and six ways");
// ---------------------------------------------------------------------------

const SEATS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const RANGE = "22+,A2s+,KTs+,QJs,JTs,AQo+";

const multiway = (n, board, iterations, bucketMode = "coarse") => {
  const boardInts = c(board);
  const game = makePostflopGame({
    board: boardInts,
    players: SEATS.slice(0, n).map((seat) => ({
      seat,
      stack: 20,
      range: rangeToCombos(RANGE, boardInts),
    })),
    pot: 12,
    betSizes: [0.66],
    maxRaises: 1,
    allowAllIn: false,
    bucketMode,
  });
  const solved = solveMCCFR(game, { iterations, seed: 0x5150 });
  return { game, solved };
};

/*
 * Two different things are worth knowing about training here, and they behave
 * differently as players are added.
 *
 * The *typical* decision trains well: at 400k iterations the median six-way
 * information set has been visited 232 times. But there is a long tail of rare
 * betting sequences - the tenth percentile is still 5 visits - and that tail
 * grows with player count, because more players means more ways for the action
 * to branch. That is a property of sampling, not a defect, so the median is
 * asserted and the tail is reported.
 */
for (const [n, iterations] of [[3, 150000], [6, 150000]]) {
  const { game, solved } = multiway(n, "Ah 8d 5c", iterations);
  const evs = evaluateStrategy(game, solved.store, { samples: 40000, seed: 0x321 });
  const quality = trainingQuality(solved.store);
  console.log(
    `       ${n}-way flop: ${quality.infoSets} info sets, median ${quality.median} visits, ` +
    `p10 ${quality.p10}, ${(quality.undertrained * 100).toFixed(0)}% under 30, ${solved.elapsedMs}ms`
  );
  console.log(
    "         " + evs.map((e, i) => `${game.seats[i]} ${e.ev >= 0 ? "+" : ""}${e.ev.toFixed(2)}`).join("  ")
  );
  near(`${n}-way payoffs sum to zero`, evs.reduce((s, e) => s + e.ev, 0), 0, 1e-6);
  ok(`${n}-way typical decision is well trained`, quality.median >= 50,
     `median ${quality.median} visits`);
}

// Every street should be reachable, not just the flop.
for (const [label, board] of [["turn", "Ah 8d 5c 2s"], ["river", "Ah 8d 5c 2s Ks"]]) {
  const { game, solved } = multiway(3, board, 30000);
  const evs = evaluateStrategy(game, solved.store, { samples: 30000, seed: 0x654 });
  console.log(`       3-way ${label}: ${solved.infoSets} info sets, ${solved.elapsedMs}ms`);
  near(`3-way ${label} sums to zero`, evs.reduce((s, e) => s + e.ev, 0), 0, 1e-6);
}

// ---------------------------------------------------------------------------
console.log("\n3. What the bucketing costs");
// ---------------------------------------------------------------------------

/*
 * Coarse bucketing is what makes a six-way pot solvable: it collapses 1326
 * holdings into 27 strength tiers. That is a real loss - two hands in the same
 * bucket must play identically - so it is worth measuring rather than assuming.
 */
{
  const board = c("Ah 8d 5c");
  const seen = new Map();
  const range = rangeToCombos(RANGE, board);
  for (let i = 0; i < range.length / 2; i += 1) {
    const bucket = coarseBucket([range[i * 2], range[i * 2 + 1]], board);
    seen.set(bucket, (seen.get(bucket) ?? 0) + 1);
  }
  console.log(
    `       ${range.length / 2} combos collapse into ${seen.size} buckets ` +
    `(largest holds ${Math.max(...seen.values())})`
  );
  ok("bucketing actually separates hands", seen.size >= 5, `${seen.size} buckets`);
  ok("no single bucket swallows the range",
     Math.max(...seen.values()) < range.length / 2 * 0.75,
     `${Math.max(...seen.values())} of ${range.length / 2}`);

  // Same spot solved both ways: the coarse solve should land near the exact one.
  const exactRun = multiway(2, "Ah 8d 5c", 120000, "exact");
  const coarseRun = multiway(2, "Ah 8d 5c", 120000, "coarse");
  const exactEv = evaluateStrategy(exactRun.game, exactRun.solved.store, { samples: 120000, seed: 7 });
  const coarseEv = evaluateStrategy(coarseRun.game, coarseRun.solved.store, { samples: 120000, seed: 7 });
  console.log(
    `       heads-up flop, exact buckets: ${exactRun.solved.infoSets} sets, EV ${exactEv[0].ev.toFixed(3)}`
  );
  console.log(
    `       heads-up flop, 27 buckets:    ${coarseRun.solved.infoSets} sets, EV ${coarseEv[0].ev.toFixed(3)}`
  );
  ok("bucketing shrinks the game a lot",
     coarseRun.solved.infoSets < exactRun.solved.infoSets / 3,
     `${coarseRun.solved.infoSets} vs ${exactRun.solved.infoSets}`);
  near("bucketed EV stays close to unabstracted", coarseEv[0].ev, exactEv[0].ev, 0.5);
}

console.log(
  failures === 0 ? "\nAll multiway postflop checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
