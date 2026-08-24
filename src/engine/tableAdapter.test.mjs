/**
 * Adapter validation: the engine keeps its guarantees when driven the way the
 * UI drives it - hero actions interleaved with bot responses.
 */
import { startHand, heroAction, toView, runBots } from "./tableAdapter.js";
import { totalChips, STREET_NAMES } from "./table.js";

let failures = 0;
const ok = (l, p, d = "") => { if (!p) failures += 1; console.log(`  ${p ? "ok  " : "FAIL"} ${l.padEnd(50)} ${d}`); };

const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const makeRng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s<<13; s>>>=0; s ^= s>>>17; s ^= s<<5; s>>>=0; return s/0x100000000; }; };

const rng = makeRng(0xBEEF);
const moves = ["Check", "Call", "Bet", "Check", "Call", "Raise"];
let hands = 0, showdowns = 0, violations = 0, stuck = 0, botActions = 0;
const streetsReached = {};

for (let h = 0; h < 500; h += 1) {
  const stacks = Object.fromEntries(seats.map((s) => [s, 100]));
  let view = startHand({
    id: 0, seats, stacks, buttonSeat: "BTN",
    heroSeat: "UTG", villainSeat: "BB", style: "tag", rng,
  });
  hands += 1;
  const start = totalChips(view.engine);

  let guard = 0;
  while (!view.engine.complete && guard < 60) {
    guard += 1;
    streetsReached[STREET_NAMES[view.engine.street]] = (streetsReached[STREET_NAMES[view.engine.street]] ?? 0) + 1;
    const before = view.engine;
    // Pick from what the engine says is legal - the same contract the UI
    // honours by disabling buttons for unavailable actions.
    const label = { fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise" };
    const choices = view.legal.map((a) => label[a.type]).filter(Boolean);
    const preferred = moves[guard % moves.length];
    const move = choices.includes(preferred) ? preferred : choices[choices.length - 1];
    const sizing = view.legal.find((a) => a.type === "bet" || a.type === "raise");
    view = heroAction(view, move, sizing ? sizing.min : 5, { heroSeat: "UTG", style: "tag", rng });
    if (view.engine === before) { violations += 1; break; }  // no progress
    if (Math.abs(totalChips(view.engine) - start) > 0.005) {
      violations += 1;
      if (violations <= 3) console.log(`  FAIL chips drifted in hand ${h}`);
      break;
    }
    if (view.engine.players.some((p) => p.stack < -1e-9)) { violations += 1; break; }
    if (view.boardCards.length > 5) { violations += 1; break; }
  }
  if (!view.engine.complete) stuck += 1;
  else {
    if (view.revealAll) showdowns += 1;
    botActions += view.engine.log.length;
    const final = view.engine.players.reduce((s, p) => s + p.stack, 0);
    if (Math.abs(final - 600) > 0.005) { violations += 1; if (violations <= 3) console.log(`  FAIL final ${final} hand ${h}`); }
  }
}

console.log(`       ${hands} hands, ${botActions} logged actions`);
console.log(`       streets: ${Object.entries(streetsReached).map(([k,v])=>`${k} ${v}`).join(", ")}`);
console.log(`       showdowns: ${showdowns}`);
ok("no violations driving through the adapter", violations === 0, `${violations}`);
ok("every hand completed", stuck === 0, `${stuck} stuck`);
ok("hands reach showdown", showdowns > 20, `${showdowns}`);

// The hero must never be skipped: when it is the hero's turn the view says so.
const v = startHand({ id: 0, seats, stacks: Object.fromEntries(seats.map(s=>[s,100])),
  buttonSeat: "BTN", heroSeat: "UTG", villainSeat: "BB", style: "tag", rng });
ok("hero is to act after bots run", v.toActSeat === "UTG" || v.engine.complete, `${v.toActSeat}`);
ok("legal actions are exposed", v.legal.length > 0, v.legal.map(a=>a.type).join(","));
ok("view exposes pot and toCall", typeof v.pot === "number" && typeof v.toCall === "number", `pot ${v.pot} toCall ${v.toCall}`);

console.log(failures === 0 ? "\nAll adapter checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
