/**
 * Betting engine validation.
 *
 * The load-bearing invariant is chip conservation: chips are never created or
 * destroyed, at any point in any hand. A random-play soak checks it after every
 * single action across thousands of hands, which catches most pot, side-pot,
 * and all-in mistakes without having to enumerate them.
 */

import {
  createHand,
  applyAction,
  legalActions,
  potSize,
  totalChips,
  amountToCall,
  buildPots,
  activePlayers,
  STREET_NAMES,
  SHOWDOWN,
} from "./table.js";
import { cardToInt, evaluate } from "./evaluator.js";

let failures = 0;
const ok = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label.padEnd(52)} ${detail}`);
};
const near = (label, a, b, tol = 1e-9) =>
  ok(label, Math.abs(a - b) <= tol, `${a} (expected ${b})`);

const cards = (s) => s.split(" ").map(cardToInt);

/** Deterministic shuffle so failures reproduce. */
const makeRng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
};
const shuffled = (rng) => {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const seats6 = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

// ---------------------------------------------------------------------------
console.log("1. Blinds and first to act");
// ---------------------------------------------------------------------------

{
  // Six-handed: blinds sit left of the button, UTG opens.
  const h = createHand({
    players: seats6.map((seat) => ({ seat, stack: 100 })),
    buttonIndex: 3, // BTN
    deck: shuffled(makeRng(1)),
    smallBlind: 0.5,
    bigBlind: 1,
  });
  near("six-handed pot after blinds", potSize(h), 1.5);
  ok("small blind is SB", h.players[4].committedTotal === 0.5, `${h.players[4].seat}`);
  ok("big blind is BB", h.players[5].committedTotal === 1, `${h.players[5].seat}`);
  ok("UTG acts first preflop", h.players[h.toAct].seat === "UTG", h.players[h.toAct].seat);
  near("UTG must call one big blind", amountToCall(h), 1);
  ok("every player has two cards", h.players.every((p) => p.hole.length === 2));
  const dealt = h.players.flatMap((p) => p.hole);
  ok("no duplicate hole cards", new Set(dealt).size === dealt.length);
}

{
  // Heads-up: the button posts the small blind and acts first preflop.
  const h = createHand({
    players: [{ seat: "BTN", stack: 100 }, { seat: "BB", stack: 100 }],
    buttonIndex: 0,
    deck: shuffled(makeRng(2)),
  });
  ok("heads-up button posts SB", h.players[0].committedTotal === 0.5);
  ok("heads-up other seat posts BB", h.players[1].committedTotal === 1);
  ok("heads-up button acts first preflop", h.toAct === 0, `index ${h.toAct}`);

  // ...and acts last postflop.
  let s = applyAction(h, { type: "call" });
  s = applyAction(s, { type: "check" });
  ok("heads-up reaches the flop", STREET_NAMES[s.street] === "Flop", STREET_NAMES[s.street]);
  ok("big blind acts first postflop", s.toAct === 1, `index ${s.toAct}`);
}

// ---------------------------------------------------------------------------
console.log("\n2. Action legality");
// ---------------------------------------------------------------------------

{
  const h = createHand({
    players: seats6.map((seat) => ({ seat, stack: 100 })),
    buttonIndex: 3,
    deck: shuffled(makeRng(3)),
  });
  const types = legalActions(h).map((a) => a.type);
  ok("cannot check facing the big blind", !types.includes("check"), types.join(","));
  ok("can fold, call, raise", ["fold", "call", "raise"].every((t) => types.includes(t)));

  let threw = false;
  try { applyAction(h, { type: "check" }); } catch { threw = true; }
  ok("checking facing a bet throws", threw);

  const raise = legalActions(h).find((a) => a.type === "raise");
  near("minimum raise is to 2bb", raise.min, 2);
  near("maximum raise is the stack", raise.max, 100);

  threw = false;
  try { applyAction(h, { type: "raise", amount: 1.5 }); } catch { threw = true; }
  ok("raising below the minimum throws", threw);

  threw = false;
  try { applyAction(h, { type: "raise", amount: 200 }); } catch { threw = true; }
  ok("raising beyond the stack throws", threw);
}

// ---------------------------------------------------------------------------
console.log("\n3. Minimum raise tracking");
// ---------------------------------------------------------------------------

{
  let s = createHand({
    players: seats6.map((seat) => ({ seat, stack: 100 })),
    buttonIndex: 3,
    deck: shuffled(makeRng(4)),
  });
  s = applyAction(s, { type: "raise", amount: 3 });   // UTG opens to 3
  const afterOpen = legalActions(s).find((a) => a.type === "raise");
  // The raise increment was 2 (from 1 to 3), so the next raise must reach 5.
  near("next minimum raise is to 5", afterOpen.min, 5);

  s = applyAction(s, { type: "raise", amount: 9 });   // HJ 3-bets to 9
  const after3bet = legalActions(s).find((a) => a.type === "raise");
  // Increment was 6, so a 4-bet must reach at least 15.
  near("minimum 4-bet is to 15", after3bet.min, 15);
}

// ---------------------------------------------------------------------------
console.log("\n4. Side pots");
// ---------------------------------------------------------------------------

{
  // Stacks 10 / 50 / 100, everyone all-in preflop.
  //   main pot  30 = 10 from each, all three eligible
  //   side pot  80 = 40 from each of the two deeper stacks
  //   side pot  50 = the uncalled remainder, only the deepest stack eligible
  let s = createHand({
    players: [
      { seat: "BTN", stack: 10 },
      { seat: "SB", stack: 50 },
      { seat: "BB", stack: 100 },
    ],
    buttonIndex: 0,
    deck: shuffled(makeRng(5)),
  });
  s = applyAction(s, { type: "raise", amount: 10 });  // BTN all-in
  s = applyAction(s, { type: "raise", amount: 50 });  // SB all-in
  s = applyAction(s, { type: "raise", amount: 100 }); // BB all-in

  const pots = buildPots(s);
  console.log(`       pots: ${pots.map((p) => `${p.amount} [${p.eligible.join("")}]`).join("  ")}`);
  ok("three pots", pots.length === 3, `${pots.length}`);
  near("main pot is 30", pots[0].amount, 30);
  ok("all three eligible for the main pot", pots[0].eligible.length === 3);
  near("first side pot is 80", pots[1].amount, 80);
  ok("only the two deeper stacks are eligible", pots[1].eligible.join("") === "12");
  near("uncalled remainder is 50", pots[2].amount, 50);
  ok("only the deepest stack is eligible", pots[2].eligible.join("") === "2");
  near("pots sum to all chips committed", pots.reduce((a, p) => a + p.amount, 0), 160);

  ok("hand ran to completion", s.complete);
  near("chips conserved", totalChips(s), 160);
  ok("board was dealt out", s.board.length === 5, `${s.board.length} cards`);
}

// ---------------------------------------------------------------------------
console.log("\n5. All-in for less does not reopen betting");
// ---------------------------------------------------------------------------

{
  // BB has a short stack and can only shove to 4 over a raise to 3 - an
  // increment of 1, below the minimum of 2. UTG may call but must not re-raise.
  let s = createHand({
    players: [
      { seat: "UTG", stack: 100 },
      { seat: "BTN", stack: 100 },
      { seat: "SB", stack: 100 },
      { seat: "BB", stack: 4 },
    ],
    buttonIndex: 1,
    deck: shuffled(makeRng(6)),
  });
  s = applyAction(s, { type: "raise", amount: 3 });  // UTG opens to 3
  s = applyAction(s, { type: "fold" });              // BTN
  s = applyAction(s, { type: "fold" });              // SB
  ok("short stack is to act", s.players[s.toAct].seat === "BB", s.players[s.toAct].seat);
  s = applyAction(s, { type: "raise", amount: 4 });  // BB shoves for less

  ok("action returns to the opener", s.players[s.toAct]?.seat === "UTG", `${s.players[s.toAct]?.seat}`);
  const types = legalActions(s).map((a) => a.type);
  console.log(`       UTG options: ${types.join(", ")}`);
  ok("UTG cannot re-raise an under-raise", !types.includes("raise"), types.join(","));
  ok("UTG can still call", types.includes("call"));
}

// ---------------------------------------------------------------------------
console.log("\n6. Uncontested pots and split pots");
// ---------------------------------------------------------------------------

{
  let s = createHand({
    players: seats6.map((seat) => ({ seat, stack: 100 })),
    buttonIndex: 3,
    deck: shuffled(makeRng(7)),
  });
  s = applyAction(s, { type: "raise", amount: 3 });
  for (let i = 0; i < 5; i += 1) if (!s.complete) s = applyAction(s, { type: "fold" });
  ok("hand ends when everyone folds", s.complete);
  ok("winner is the last player standing", s.winners.length === 1);
  near("chips conserved after a fold-out", totalChips(s), 600);
  const winner = s.players[s.winners[0]];
  near("opener wins the blinds", winner.stack, 100 + 1.5 - 0 + 0, 1e-9);
}

{
  // Both players play the board: a royal flush on the table is a guaranteed chop.
  const board = cards("As Ks Qs Js Ts");
  const p0 = cards("2h 3d");
  const p1 = cards("4c 5h");
  const rest = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => ![...board, ...p0, ...p1].includes(c)
  );
  // createHand deals one card at a time, so interleave the hole cards.
  const deck = [p0[0], p1[0], p0[1], p1[1], ...board, ...rest];

  let s = createHand({
    players: [{ seat: "BTN", stack: 100 }, { seat: "BB", stack: 100 }],
    buttonIndex: 0,
    deck,
  });
  s = applyAction(s, { type: "call" });
  s = applyAction(s, { type: "check" });
  while (!s.complete) s = applyAction(s, { type: "check" });

  ok("both hands reach showdown", s.street === SHOWDOWN);
  ok("board plays - pot is split", s.winners.length === 2, `${s.winners.length} winner(s)`);
  near("both players end even", s.players[0].stack, 100);
  near("chips conserved on a chop", totalChips(s), 200);
}

// ---------------------------------------------------------------------------
console.log("\n7. Showdown awards the best hand");
// ---------------------------------------------------------------------------

{
  const board = cards("Ah 8d 5c 2s Ks");
  const strong = cards("Ac Ad");  // set of aces
  const weak = cards("7h 6h");    // seven high
  const rest = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => ![...board, ...strong, ...weak].includes(c)
  );
  const deck = [strong[0], weak[0], strong[1], weak[1], ...board, ...rest];

  let s = createHand({
    players: [{ seat: "BTN", stack: 100 }, { seat: "BB", stack: 100 }],
    buttonIndex: 0,
    deck,
  });
  s = applyAction(s, { type: "call" });
  s = applyAction(s, { type: "check" });
  while (!s.complete) s = applyAction(s, { type: "check" });

  ok("set of aces wins", s.winners.length === 1 && s.winners[0] === 0, JSON.stringify(s.winners));
  near("winner collects the pot", s.players[0].stack, 101);
  near("loser is down the big blind", s.players[1].stack, 99);
  near("chips conserved", totalChips(s), 200);

  const expected = evaluate([...strong, ...board], 7);
  ok("recorded hand score matches the evaluator", s.players[0].handScore === expected);
}

// ---------------------------------------------------------------------------
console.log("\n8. Random-play soak: chips conserved after every action");
// ---------------------------------------------------------------------------

{
  const rng = makeRng(0xC0FFEE);
  let hands = 0;
  let actions = 0;
  let violations = 0;
  let unterminated = 0;
  const streetCounts = {};
  const reasons = {};
  let worstDrift = 0;

  for (let h = 0; h < 3000; h += 1) {
    const count = 2 + Math.floor(rng() * 5);           // 2..6 players
    const players = Array.from({ length: count }, (_, i) => ({
      seat: seats6[i],
      // Mix deep and very short stacks so all-ins and side pots happen often.
      stack: Math.round((2 + rng() * 120) * 2) / 2,
    }));
    const startingTotal = players.reduce((sum, p) => sum + p.stack, 0);

    let s;
    try {
      s = createHand({ players, buttonIndex: Math.floor(rng() * count), deck: shuffled(rng) });
    } catch (error) {
      violations += 1;
      if (violations <= 3) console.log(`  FAIL createHand: ${error.message}`);
      continue;
    }
    hands += 1;

    let guard = 0;
    while (!s.complete && guard < 400) {
      guard += 1;
      const options = legalActions(s);
      if (options.length === 0) { violations += 1; break; }
      const choice = options[Math.floor(rng() * options.length)];
      const action = { type: choice.type };
      if (choice.type === "bet" || choice.type === "raise") {
        // Random legal size, biased toward the extremes.
        const roll = rng();
        action.amount = roll < 0.3 ? choice.min
          : roll > 0.8 ? choice.max
          : Math.round((choice.min + rng() * (choice.max - choice.min)) * 100) / 100;
      }
      try {
        s = applyAction(s, action);
      } catch (error) {
        violations += 1;
        if (violations <= 3) {
          console.log(`  FAIL legal action rejected (${JSON.stringify(action)}): ${error.message}`);
        }
        break;
      }
      actions += 1;

      const drift = Math.abs(totalChips(s) - startingTotal);
      if (drift > worstDrift) worstDrift = drift;
      if (drift > 0.005) {
        violations += 1;
        if (violations <= 3) {
          console.log(`  FAIL chips drifted by ${drift.toFixed(4)} in hand ${h}`);
        }
        break;
      }
      if (s.board.length > 5) { violations += 1; break; }
      if (s.players.some((p) => p.stack < -1e-9)) { violations += 1; break; }
    }

    if (!s.complete) unterminated += 1;
    else {
      streetCounts[STREET_NAMES[s.street]] = (streetCounts[STREET_NAMES[s.street]] ?? 0) + 1;
      reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
      const finalTotal = s.players.reduce((sum, p) => sum + p.stack, 0);
      if (Math.abs(finalTotal - startingTotal) > 0.005) {
        violations += 1;
        if (violations <= 3) {
          console.log(`  FAIL final chips ${finalTotal} vs ${startingTotal} in hand ${h}`);
        }
      }
    }
  }

  console.log(`       ${hands} hands, ${actions} actions`);
  console.log(`       ended on: ${Object.entries(streetCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`       reasons:  ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`       worst chip drift: ${worstDrift.toFixed(6)}`);
  ok("no rule or conservation violations", violations === 0, `${violations}`);
  ok("every hand terminated", unterminated === 0, `${unterminated} stuck`);
  ok("hands reached showdown sometimes", (streetCounts.Showdown ?? 0) > 100, `${streetCounts.Showdown ?? 0}`);
}

console.log(
  failures === 0 ? "\nAll table checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
