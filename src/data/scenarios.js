const POSITIONS_BY_PLAYERS = {
  2: ["SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["CO", "BTN", "SB", "BB"],
  5: ["HJ", "CO", "BTN", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  7: ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"],
  8: ["UTG", "UTG+1", "UTG+2", "HJ", "CO", "BTN", "SB", "BB"],
  9: ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
};

const STACK_BANDS = [
  { label: "Short", min: 20, max: 50 },
  { label: "Medium", min: 55, max: 90 },
  { label: "Standard", min: 100, max: 167 },
  { label: "Deep", min: 150, max: 1000 },
];

const STREET = ["Preflop", "Flop", "Turn", "River"];
const POT_TYPE = ["Single-raised", "3-bet", "4-bet", "Limped", "Squeeze"];
const ACTION_TEMPLATES = [
  { label: "Open", type: "open", unit: "x" },
  { label: "Open", type: "open", unit: "x" },
  { label: "3-bet", type: "raise", unit: "x" },
  { label: "4-bet", type: "raise", unit: "x" },
  { label: "Iso-raise", type: "raise", unit: "x" },
  { label: "Flat call", type: "static" },
  { label: "Check back", type: "static" },
  { label: "Limp", type: "static" },
  { label: "C-bet", type: "bet", unit: "%" },
  { label: "Bet", type: "bet", unit: "%" },
  { label: "Overbet", type: "bet", unit: "%" },
  { label: "Probe", type: "bet", unit: "%" },
  { label: "Delay c-bet", type: "bet", unit: "%" },
  { label: "Check-raise", type: "raise", unit: "%" },
  { label: "Raise", type: "raise", unit: "%" },
  { label: "Jam", type: "static" },
  { label: "Fold to aggression", type: "static" },
];

const FLOP_TEXTURES = [
  "A-high dry",
  "K-high dry",
  "Q-high dry",
  "Ace-high two-tone",
  "King-high two-tone",
  "Queen-high two-tone",
  "Low connected",
  "Low disconnected",
  "Middle coordinated",
  "Middle paired",
  "High paired",
  "Paired low",
  "Paired high",
  "Two-pair board",
  "Two-tone Broadway",
  "Rainbow Broadway",
  "Double Broadway",
  "Monotone",
  "Two-tone low",
  "Two-tone middle",
  "Low straight on board",
  "Broadway straight on board",
  "Wheel-heavy",
  "Wheel draw heavy",
  "Single gap straight draw",
  "Double gutshot potential",
  "Flush draw + straight draw",
  "Overcard-heavy",
  "Trips on board",
  "Dry monotone",
  "Wet monotone",
  "Three broadway cards",
  "Ace-high with wheel draw",
  "King-high with gutshot",
  "Paired and flush draw",
  "Paired and straight draw",
  "Paired and double flush draw",
  "Connected and double flush draw",
  "Low paired with straight draw",
  "High paired with straight draw",
];

const TURN_TEXTURES = [
  "Brick turn",
  "Overcard turn",
  "Board pair turn",
  "Flush completes",
  "Flush draw bricks",
  "Second flush draw appears",
  "Open-ended completes",
  "Gutshot completes",
  "Double-pair board",
  "Two pair on board",
  "Trips appear",
  "Straightening turn",
  "Turn brings wheel",
  "Turn brings Broadway",
  "Turn locks in low straight",
  "Turn pairs top card",
  "Turn pairs middle card",
  "Turn pairs low card",
  "Turn completes four-straight",
  "Turn completes four-flush",
  "Turn puts straight on board",
  "Turn puts flush on board",
];

const RIVER_TEXTURES = [
  "Brick river",
  "Overcard river",
  "Board pairs river",
  "Flush completes river",
  "Flush misses river",
  "Straight completes river",
  "Straight misses river",
  "Four-straight on board",
  "Four-flush on board",
  "Straight on board",
  "Flush on board",
  "Full house on board",
  "Trips on board",
  "Low straight river",
  "Broadway river",
  "River brings second pair",
  "River brings top pair",
  "River double-pairs board",
  "River makes two pair on board",
  "River makes quads on board",
  "River pairs both side cards",
  "River completes wheel",
  "River completes Broadway",
  "River completes backdoor flush",
];

const VILLAIN_STYLES = [
  "Aggro reg",
  "Tight grinder",
  "Loose passive",
  "Solver-balanced",
  "Over-bluffer",
  "Under-defender",
  "Station",
];

const HAND_GROUPS = [
  "Top pair weak kicker",
  "Top pair strong kicker",
  "Nut flush draw",
  "Second pair + backdoor",
  "Middle pair + gutshot",
  "Overpair",
  "Two overcards",
  "Open-ended straight draw",
  "Missed draw bluff",
  "Backdoor bluff",
  "Pure air bluff",
  "Blocker-based bluff",
  "Overcard + backdoor bluff",
  "River polar bluff",
  "Air with blockers",
  "Made straight",
  "Set",
];

const BET_SIZES = ["25", "33", "50", "66", "75", "90", "110", "130", "150"];
const RAISE_SIZES = ["2.1", "2.3", "2.5", "2.8", "3.2", "3.8", "4.5", "6", "7.5", "9"];

const randomPick = (list) => list[Math.floor(Math.random() * list.length)];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const estimateEffectiveStack = ({ stack, gameType, cashCap }) => {
  const base = Number(stack);
  const cap = gameType === "cash" ? Number(cashCap) || base : base;
  const upper = clamp(cap, 20, 1000);
  const lower = clamp(Math.round(base * 0.35), 15, upper);
  const skew = Math.random() ** 0.6;
  return Math.round(lower + (upper - lower) * skew);
};

const getRandomDistinct = (list, fallback) => {
  if (list.length < 2) return fallback || list[0];
  const first = randomPick(list);
  let second = randomPick(list);
  let tries = 0;
  while (second === first && tries < 6) {
    second = randomPick(list);
    tries += 1;
  }
  return [first, second];
};

const buildSpotSummary = ({ street, potType, action, betSize }) => {
  if (street === "Preflop") {
    return `${potType} pot · ${action}`;
  }
  if (action.includes("bet") || action.includes("Probe")) {
    return `${street} · ${action} (${betSize})`;
  }
  return `${street} · ${action}`;
};

const buildAction = (template, street) => {
  if (template.type === "static") {
    return { action: template.label, actionSize: null };
  }

  if (template.type === "open" || template.type === "raise") {
    const size = randomPick(RAISE_SIZES);
    if (street !== "Preflop" && template.unit === "x") {
      const percent = randomPick(BET_SIZES);
      return {
        action: template.label,
        actionSize: `${percent}%`,
      };
    }
    return { action: template.label, actionSize: `${size}x` };
  }

  const size = randomPick(BET_SIZES);
  return { action: template.label, actionSize: `${size}%` };
};

export const createScenario = ({ players, stack, gameType = "cash", cashCap }) => {
  const positions = POSITIONS_BY_PLAYERS[players] || POSITIONS_BY_PLAYERS[6];
  const [heroPosition, villainPosition] = getRandomDistinct(positions, [
    positions[0],
    positions[1] || positions[0],
  ]);
  const effectiveStack = estimateEffectiveStack({ stack, gameType, cashCap });
  const stackBand = STACK_BANDS.find(
    (band) => effectiveStack >= band.min && effectiveStack <= band.max
  );
  const street = randomPick(STREET);
  const potType = randomPick(POT_TYPE);
  const actionTemplate = randomPick(ACTION_TEMPLATES);
  const { action, actionSize } = buildAction(actionTemplate, street);
  const betSize = actionSize || `${randomPick(BET_SIZES)}%`;
  const board =
    street === "Flop"
      ? randomPick(FLOP_TEXTURES)
      : street === "Turn"
      ? randomPick(TURN_TEXTURES)
      : street === "River"
      ? randomPick(RIVER_TEXTURES)
      : randomPick(FLOP_TEXTURES);
  const villainStyle = randomPick(VILLAIN_STYLES);
  const handGroup = randomPick(HAND_GROUPS);

  return {
    players,
    stack,
    heroPosition,
    villainPosition,
    stackSpot: stackBand
      ? `${stackBand.label} stack (${stackBand.min}-${stackBand.max} bb)`
      : "Mixed stack depth",
    effectiveStack,
    action: actionSize ? `${action} ${actionSize}` : action,
    board,
    villainStyle,
    handGroup,
    street,
    potType,
    betSize,
    spotSummary: buildSpotSummary({ street, potType, action, betSize }),
  };
};
