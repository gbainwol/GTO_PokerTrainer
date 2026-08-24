import { useEffect, useMemo, useRef, useState } from "react";
import { createScenario } from "./data/scenarios";
import { PREFLOP_CHARTS } from "./data/preflopCharts";
import {
  calculateBetEV,
  calculateCallEV,
  calculateFoldEV,
  calculateRaiseEV,
  calculateKellyFraction,
} from "./utils/ev";
import {
  buildDeck,
  shuffleDeck,
  dealCards,
  formatCard,
  evaluateHand,
} from "./utils/poker";
import { createApiClient, createSolverClient } from "./utils/api";

const formatChips = (value) => `${value.toFixed(2)} bb`;

const defaultScenario = createScenario({ players: 6, stack: 100 });

const STREET_OPTIONS = ["Preflop", "Flop", "Turn", "River"];
const HAND_STREETS = ["Preflop", "Flop", "Turn", "River", "Showdown"];
const POT_TYPE_OPTIONS = [
  "Single-raised",
  "3-bet",
  "4-bet",
  "Limped",
  "Squeeze",
];

const TABLE_THEMES = [
  { id: "felt-emerald", label: "Emerald Felt" },
  { id: "felt-midnight", label: "Midnight Felt" },
  { id: "felt-ruby", label: "Ruby Felt" },
  { id: "felt-sand", label: "Sandstone Felt" },
];

const CARD_THEMES = [
  { id: "card-classic", label: "Classic Ivory" },
  { id: "card-minimal", label: "Minimal Slate" },
  { id: "card-neon", label: "Neon Edge" },
];

const TABLE_DESIGNS = [
  {
    name: "Classic Green",
    felt: "linear-gradient(135deg, #2d5f3f 0%, #1a4d2e 100%)",
    rail: "linear-gradient(180deg, #f5e6d3 0%, #d4b896 100%)",
    border: "#2c2c2c",
    pattern:
      "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.05) 0%, transparent 50%)",
    background:
      "radial-gradient(circle at 20% 20%, #2a2c32, #0b0c10 70%)",
  },
  {
    name: "Midnight Blue",
    felt: "linear-gradient(135deg, #1e3a5f 0%, #0f1e3a 100%)",
    rail: "linear-gradient(180deg, #4a5568 0%, #2d3748 100%)",
    border: "#1a1a2e",
    pattern:
      "radial-gradient(circle at 80% 30%, rgba(100,150,255,0.1) 0%, transparent 50%)",
    background:
      "radial-gradient(circle at 20% 20%, #1a202c, #0b0c10 70%)",
  },
  {
    name: "Royal Red",
    felt: "linear-gradient(135deg, #8b1a1a 0%, #5a0f0f 100%)",
    rail: "linear-gradient(180deg, #d4af37 0%, #b8941e 100%)",
    border: "#2c1810",
    pattern:
      "radial-gradient(circle at 50% 50%, rgba(255,215,0,0.08) 0%, transparent 60%)",
    background:
      "radial-gradient(circle at 20% 20%, #2b1515, #0b0c10 70%)",
  },
  {
    name: "Ocean Teal",
    felt: "linear-gradient(135deg, #1a6d6d 0%, #0f4444 100%)",
    rail: "linear-gradient(180deg, #e8dcc4 0%, #c9b896 100%)",
    border: "#1e3333",
    pattern:
      "radial-gradient(circle at 30% 70%, rgba(0,255,255,0.06) 0%, transparent 50%)",
    background:
      "radial-gradient(circle at 20% 20%, #1a2b2b, #0b0c10 70%)",
  },
  {
    name: "Vegas Purple",
    felt: "linear-gradient(135deg, #4a1a5f 0%, #2d0f3a 100%)",
    rail: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)",
    border: "#0f0f0f",
    pattern:
      "radial-gradient(circle at 60% 40%, rgba(200,100,255,0.1) 0%, transparent 55%)",
    background:
      "radial-gradient(circle at 20% 20%, #211226, #0b0c10 70%)",
  },
  {
    name: "Carbon Fiber",
    felt: "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)",
    rail: "linear-gradient(180deg, #3a3a3a 0%, #1f1f1f 100%)",
    border: "#0a0a0a",
    pattern:
      "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
    background:
      "radial-gradient(circle at 20% 20%, #1a1a1a, #0b0c10 70%)",
  },
  {
    name: "Emerald Casino",
    felt: "linear-gradient(135deg, #0f5f3a 0%, #083d24 100%)",
    rail: "linear-gradient(180deg, #8b4513 0%, #654321 100%)",
    border: "#1a1a1a",
    pattern:
      "radial-gradient(ellipse at 50% 50%, rgba(50,205,50,0.08) 0%, transparent 70%)",
    background:
      "radial-gradient(circle at 20% 20%, #1b261f, #0b0c10 70%)",
  },
  {
    name: "High Roller Black",
    felt: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
    rail: "linear-gradient(180deg, #ffd700 0%, #daa520 100%)",
    border: "#000000",
    pattern:
      "radial-gradient(circle at 40% 60%, rgba(255,255,255,0.04) 0%, transparent 50%)",
    background:
      "radial-gradient(circle at 20% 20%, #0f0f0f, #0b0c10 70%)",
  },
];

const METRICS = [
  {
    id: "cumEv",
    label: "Cumulative EV",
    description: "Total EV across decisions.",
  },
  {
    id: "evPerDecision",
    label: "EV / Decision",
    description: "EV for each recorded move.",
  },
  {
    id: "evLoss",
    label: "EV Loss",
    description: "How far below best EV each move lands.",
  },
  {
    id: "bestRate",
    label: "Best Decision Rate",
    description: "Cumulative % of best-available moves.",
  },
  {
    id: "aggRate",
    label: "Aggression Rate",
    description: "Cumulative % of bets and raises.",
  },
  {
    id: "evPer100",
    label: "EV / 100",
    description: "Projected EV per 100 decisions.",
  },
];

const STORAGE_KEYS = {
  auth: "gto.admin.auth",
  profile: "gto.user.profile",
  settings: "gto.user.settings",
  moves: "gto.user.moves",
  history: "gto.user.history",
  saved: "gto.user.saved",
  drill: "gto.user.drill",
  metrics: "gto.user.metrics",
  themes: "gto.ui.themes",
  sessions: "gto.user.sessions",
};

const DEFAULT_ADMIN = {
  email: "admin@gto.dev",
  password: "letmein",
};

const readStoredJson = (key, fallback) => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse ${key} from storage`, error);
    return fallback;
  }
};

const SEAT_LABELS = {
  2: ["SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["CO", "BTN", "SB", "BB"],
  5: ["HJ", "CO", "BTN", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  7: ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"],
  8: ["UTG", "UTG+1", "UTG+2", "HJ", "CO", "BTN", "SB", "BB"],
  9: ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
};

const PLAYER_NAMES = [
  "Stawko",
  "LuckyBelly",
  "Fensters",
  "Mookie11",
  "DotDashCAT",
  "Ballistic",
  "BanhMi",
  "SydPuker",
  "popcap",
  "IAmINE",
  "LOGIII",
  "kamstackz",
  "KingMe",
  "PokerStar",
];

const DRILL_PRESETS = [
  { label: "2 min sprint", value: 120 },
  { label: "5 min focus", value: 300 },
  { label: "10 min endurance", value: 600 },
];

const SKILL_MODES = ["Beginner", "Intermediate", "Pro"];
const TOURNAMENT_FORMATS = [
  "Standard",
  "Bounty",
  "PKO",
  "Turbo",
  "Hyper",
  "Satellite",
];

const SOLVER_ENGINES = [
  "MCCFR (External Sampling)",
  "CFR",
  "CFR+",
  "Deep CFR",
  "MCCFR",
  "Chance Sampling",
  "External Sampling",
  "Discounted CFR",
  "Outcome Sampling",
  "Public Sampling",
];

const ACTION_ORDER_MODES = [
  { id: "perStreet", label: "Per-street (BTN/SB first postflop)" },
  { id: "heroFirst", label: "Hero always first" },
];

const SEAT_LAYOUTS = {
  2: [
    { x: 50, y: 90 },
    { x: 50, y: 10 },
  ],
  3: [
    { x: 50, y: 90 },
    { x: 15, y: 55 },
    { x: 85, y: 55 },
  ],
  4: [
    { x: 50, y: 8 },
    { x: 50, y: 90 },
    { x: 12, y: 55 },
    { x: 88, y: 55 },
  ],
  5: [
    { x: 50, y: 8 },
    { x: 75, y: 18 },
    { x: 50, y: 90 },
    { x: 18, y: 80 },
    { x: 10, y: 45 },
  ],
  6: [
    { x: 50, y: 8 },
    { x: 80, y: 18 },
    { x: 90, y: 45 },
    { x: 50, y: 90 },
    { x: 10, y: 60 },
    { x: 12, y: 30 },
  ],
  7: [
    { x: 50, y: 6 },
    { x: 75, y: 14 },
    { x: 90, y: 32 },
    { x: 90, y: 60 },
    { x: 60, y: 92 },
    { x: 20, y: 85 },
    { x: 10, y: 45 },
  ],
  8: [
    { x: 50, y: 5 },
    { x: 72, y: 10 },
    { x: 90, y: 25 },
    { x: 94, y: 52 },
    { x: 70, y: 92 },
    { x: 30, y: 92 },
    { x: 6, y: 55 },
    { x: 12, y: 28 },
  ],
  9: [
    { x: 50, y: 4 },
    { x: 70, y: 8 },
    { x: 88, y: 18 },
    { x: 95, y: 38 },
    { x: 92, y: 62 },
    { x: 70, y: 92 },
    { x: 50, y: 96 },
    { x: 25, y: 90 },
    { x: 8, y: 60 },
  ],
};

const PAGES = [
  { id: "home", label: "Home" },
  { id: "play", label: "Play" },
  { id: "review", label: "Review" },
  { id: "learn", label: "Learn" },
  { id: "settings", label: "Settings" },
];

const PAGE_INTROS = {
  home: {
    title: "A high-fidelity trainer that builds instinctive EV.",
    text: "Run real scenarios, validate your lines, and study the math behind every decision.",
  },
  play: {
    title: "Live play mode",
    text: "Generate hands, choose actions, and keep the drill timer running.",
  },
  review: {
    title: "Review your session",
    text: "Track EV performance, streaks, and decision history over time.",
  },
  learn: {
    title: "Learn the patterns",
    text: "Study preflop charts and structured lessons by street.",
  },
  settings: {
    title: "Customize your rig",
    text: "Set profiles, themes, and saved scenario libraries.",
  },
};

const buildSpotSummary = ({ street, potType, action, actionSize }) => {
  if (street === "Preflop") {
    return `${potType} pot · ${action}`;
  }
  if (action.toLowerCase().includes("bet") || action.toLowerCase().includes("probe")) {
    return `${street} · ${action}${actionSize ? ` (${actionSize})` : ""}`;
  }
  return `${street} · ${action}`;
};

const parseAction = (actionText) => {
  const trimmed = actionText.trim();
  const match = trimmed.match(/^(.*?)(?:\s+(\d+(?:\.\d+)?x|\d+%))?$/);
  if (!match) {
    return { action: trimmed, actionSize: "" };
  }
  return { action: match[1].trim(), actionSize: match[2] || "" };
};

const App = () => {
  const apiBase =
    import.meta.env.VITE_API_URL?.trim() || "http://localhost:5174";
  const solverBase =
    import.meta.env.VITE_SOLVER_URL?.trim() || "http://localhost:5175";
  const api = useMemo(() => createApiClient(apiBase), [apiBase]);
  const solverApi = useMemo(
    () => createSolverClient(solverBase),
    [solverBase]
  );
  const [players, setPlayers] = useState(6);
  const [stack, setStack] = useState(100);
  const [gameType, setGameType] = useState("cash");
  const [cashCap, setCashCap] = useState(200);
  const [scenario, setScenario] = useState(defaultScenario);
  const [tableLayout, setTableLayout] = useState(1);
  const [activeTableIndex, setActiveTableIndex] = useState(0);
  const [tables, setTables] = useState([]);
  const [hasAntes, setHasAntes] = useState(false);
  const [hasStraddles, setHasStraddles] = useState(false);
  const [solverEngine, setSolverEngine] = useState(
    "MCCFR (External Sampling)"
  );
  const [actionOrderMode, setActionOrderMode] = useState("perStreet");
  const [skillMode, setSkillMode] = useState("Beginner");
  const [enableAdvancedMetrics, setEnableAdvancedMetrics] = useState(false);
  const [enableSolverSelect, setEnableSolverSelect] = useState(false);
  const [tournamentFormat, setTournamentFormat] = useState("Standard");
  const [customScenario, setCustomScenario] = useState(() => {
    const parsed = parseAction(defaultScenario.action);
    return {
      heroPosition: defaultScenario.heroPosition,
      villainPosition: defaultScenario.villainPosition,
      street: defaultScenario.street,
      potType: defaultScenario.potType,
      action: parsed.action,
      actionSize: parsed.actionSize,
      board: defaultScenario.board,
      villainStyle: defaultScenario.villainStyle,
      handGroup: defaultScenario.handGroup,
      stackSpot: defaultScenario.stackSpot,
    };
  });
  const [chartPosition, setChartPosition] = useState("BTN");
  const [potSize, setPotSize] = useState(6.5);
  const [callSize, setCallSize] = useState(4.5);
  const [betSize, setBetSize] = useState(5.5);
  const [raiseSize, setRaiseSize] = useState(12);
  const [equity, setEquity] = useState(42);
  const [foldEquity, setFoldEquity] = useState(38);
  const [moveHistory, setMoveHistory] = useState([]);
  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [metricSelection, setMetricSelection] = useState(() => ({
    cumEv: true,
    evLoss: true,
    bestRate: true,
    evPer100: false,
    evPerDecision: false,
    aggRate: false,
  }));
  const [tableTheme, setTableTheme] = useState(TABLE_THEMES[0].id);
  const [cardTheme, setCardTheme] = useState(CARD_THEMES[0].id);
  const [useCustomTheme, setUseCustomTheme] = useState(false);
  const [customTheme, setCustomTheme] = useState({
    felt: "#1f6b4f",
    rail: "#2a1a12",
    cardBg: "#f7f3ea",
    cardInk: "#1a1b1f",
    accent: "#f27b53",
  });
  const [tableDesignIndex, setTableDesignIndex] = useState(0);
  const [profile, setProfile] = useState({
    name: "Beta Player",
    role: "Player",
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
  });
  const [activePage, setActivePage] = useState("home");
  const [scenarioHistory, setScenarioHistory] = useState([]);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [drillActive, setDrillActive] = useState(false);
  const [drillDuration, setDrillDuration] = useState(DRILL_PRESETS[0].value);
  const [drillRemaining, setDrillRemaining] = useState(
    DRILL_PRESETS[0].value
  );
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [dealTick, setDealTick] = useState(0);
  const [betInput, setBetInput] = useState(String(betSize));
  const [decisionStart, setDecisionStart] = useState(Date.now());
  const [actionPulse, setActionPulse] = useState(null);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  const [drillStats, setDrillStats] = useState({
    decisions: 0,
    best: 0,
    evTotal: 0,
  });
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [expandedPanels, setExpandedPanels] = useState({
    trainer: true,
    charts: true,
    ev: true,
    metrics: true,
  });
  const [sessionEvents, setSessionEvents] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [solverAdvice, setSolverAdvice] = useState(null);
  const [solverError, setSolverError] = useState(null);
  const [solverLoading, setSolverLoading] = useState(false);
  const sessionIdRef = useRef(null);

  const chart = PREFLOP_CHARTS.find(
    (item) => item.position === chartPosition
  );

  const evResults = useMemo(() => {
    const base = {
      pot: Number(potSize),
      callSize: Number(callSize),
      betSize: Number(betSize),
      raiseSize: Number(raiseSize),
      equity: Number(equity),
      foldEquity: Number(foldEquity),
    };

    return {
      call: calculateCallEV(base),
      bet: calculateBetEV(base),
      raise: calculateRaiseEV(base),
      fold: calculateFoldEV(),
    };
  }, [potSize, callSize, betSize, raiseSize, equity, foldEquity]);

  useEffect(() => {
    const storedAuth = localStorage.getItem(STORAGE_KEYS.auth);
    const storedProfile = readStoredJson(STORAGE_KEYS.profile, null);
    const storedSettings = readStoredJson(STORAGE_KEYS.settings, null);
    const storedMoves = readStoredJson(STORAGE_KEYS.moves, []);
    const storedHistory = readStoredJson(STORAGE_KEYS.history, []);
    const storedSaved = readStoredJson(STORAGE_KEYS.saved, []);
    const storedDrill = readStoredJson(STORAGE_KEYS.drill, null);
    const storedMetrics = readStoredJson(STORAGE_KEYS.metrics, null);
    const storedThemes = readStoredJson(STORAGE_KEYS.themes, null);
    const storedSessions = readStoredJson(STORAGE_KEYS.sessions, []);
    if (storedAuth) {
      setIsAdmin(storedAuth === "true");
    }
    if (storedProfile) {
      setProfile(storedProfile);
    }
    if (storedSettings) {
      setPlayers(storedSettings.players ?? 6);
      setStack(storedSettings.stack ?? 100);
      setGameType(storedSettings.gameType ?? "cash");
      setCashCap(storedSettings.cashCap ?? 200);
      setActionOrderMode(storedSettings.actionOrderMode ?? "perStreet");
    }
    if (storedMoves) {
      setMoveHistory(storedMoves);
    }
    if (storedHistory) {
      setScenarioHistory(storedHistory);
    }
    if (storedSaved) {
      setSavedScenarios(storedSaved);
    }
    if (storedDrill) {
      setDrillDuration(storedDrill.drillDuration ?? DRILL_PRESETS[0].value);
      setDrillRemaining(storedDrill.drillRemaining ?? DRILL_PRESETS[0].value);
      setDrillStats(
        storedDrill.drillStats ?? { decisions: 0, best: 0, evTotal: 0 }
      );
    }
    if (storedMetrics) {
      setMetricSelection(storedMetrics);
    }
    if (storedThemes) {
      setTableTheme(storedThemes.tableTheme ?? TABLE_THEMES[0].id);
      setCardTheme(storedThemes.cardTheme ?? CARD_THEMES[0].id);
      setUseCustomTheme(storedThemes.useCustomTheme ?? false);
      setTableDesignIndex(storedThemes.tableDesignIndex ?? 0);
      setCustomTheme(
        storedThemes.customTheme ?? {
          felt: "#1f6b4f",
          rail: "#2a1a12",
          cardBg: "#f7f3ea",
          cardInk: "#1a1b1f",
          accent: "#f27b53",
        }
      );
    }
    if (storedSessions) {
      setSessionEvents(storedSessions);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ players, stack, gameType, cashCap, actionOrderMode })
    );
  }, [players, stack, gameType, cashCap, actionOrderMode]);

  useEffect(() => {
    if (!drillActive) {
      setDrillRemaining(drillDuration);
    }
  }, [drillDuration, drillActive]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.moves, JSON.stringify(moveHistory));
  }, [moveHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(scenarioHistory));
  }, [scenarioHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(savedScenarios));
  }, [savedScenarios]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.drill,
      JSON.stringify({
        drillDuration,
        drillRemaining,
        drillStats,
      })
    );
  }, [drillDuration, drillRemaining, drillStats]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessionEvents));
  }, [sessionEvents]);

  useEffect(() => {
    sessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.metrics, JSON.stringify(metricSelection));
  }, [metricSelection]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.themes,
      JSON.stringify({
        tableTheme,
        cardTheme,
        useCustomTheme,
        tableDesignIndex,
        customTheme,
      })
    );
  }, [tableTheme, cardTheme, useCustomTheme, tableDesignIndex, customTheme]);

  useEffect(() => {
    setBetInput(String(betSize));
  }, [betSize]);

  useEffect(() => {
    setSolverAdvice(null);
    setSolverError(null);
  }, [dealTick, activeTableIndex]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (skillMode === "Beginner") {
      setAutoAdvance(true);
      setEnableAdvancedMetrics(false);
      setEnableSolverSelect(false);
    } else if (skillMode === "Intermediate") {
      setAutoAdvance(true);
      setEnableAdvancedMetrics(true);
      setEnableSolverSelect(false);
    } else {
      setEnableAdvancedMetrics(true);
      setEnableSolverSelect(true);
    }
  }, [skillMode]);

  useEffect(() => {
    setTables(
      Array.from({ length: tableLayout }, (_, index) => buildNewHandState(index))
    );
    setActiveTableIndex((prev) => Math.min(prev, tableLayout - 1));
  }, [players, scenario, tableLayout, actionOrderMode]);

  const handleScenario = () => {
    const nextScenario = createScenario({ players, stack, gameType, cashCap });
    const parsed = parseAction(nextScenario.action);
    setScenario(nextScenario);
    setDealTick((prev) => prev + 1);
    setDecisionStart(Date.now());
    setCustomScenario({
      heroPosition: nextScenario.heroPosition,
      villainPosition: nextScenario.villainPosition,
      street: nextScenario.street,
      potType: nextScenario.potType,
      action: parsed.action,
      actionSize: parsed.actionSize,
      board: nextScenario.board,
      villainStyle: nextScenario.villainStyle,
      handGroup: nextScenario.handGroup,
      stackSpot: nextScenario.stackSpot,
    });
    api
      .postScenario({ data: nextScenario, createdAt: new Date().toISOString() })
      .catch((error) => {
        console.warn("Scenario sync failed", error);
      });
  };

  useEffect(() => {
    if (!drillActive) return;
    if (drillRemaining <= 0) {
      setDrillActive(false);
      return;
    }
    const timer = setInterval(() => {
      setDrillRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [drillActive, drillRemaining]);

  const handleCustomChange = (field, value) => {
    setCustomScenario((prev) => ({ ...prev, [field]: value }));
  };

  const applyCustomScenario = () => {
    const actionLabel = (customScenario.action || "").trim();
    const actionSize = (customScenario.actionSize || "").trim();
    const combinedAction = actionSize ? `${actionLabel} ${actionSize}` : actionLabel;
    const nextScenario = {
      players,
      stack,
      heroPosition: customScenario.heroPosition,
      villainPosition: customScenario.villainPosition,
      street: customScenario.street,
      potType: customScenario.potType,
      action: combinedAction,
      board: customScenario.board,
      villainStyle: customScenario.villainStyle,
      handGroup: customScenario.handGroup,
      stackSpot: customScenario.stackSpot,
      betSize: actionSize,
      spotSummary: buildSpotSummary({
        street: customScenario.street,
        potType: customScenario.potType,
        action: actionLabel,
        actionSize,
      }),
    };
    setScenario(nextScenario);
  };

  const togglePanel = (id) => {
    setExpandedPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startDrill = () => {
    setDrillActive(true);
    setDrillRemaining(drillDuration);
    setDrillStats({ decisions: 0, best: 0, evTotal: 0 });
    handleScenario();
    ensureSession();
  };

  const stopDrill = () => {
    setDrillActive(false);
    endSession();
  };

  const resetDrill = () => {
    setDrillActive(false);
    setDrillRemaining(drillDuration);
    setDrillStats({ decisions: 0, best: 0, evTotal: 0 });
    endSession();
  };

  const logScenarioDecision = (entry) => {
    const snapshot = {
      id: entry.id,
      timestamp: entry.timestamp,
      move: entry.move,
      ev: entry.ev,
      bestMove: entry.bestMove,
      delta: entry.delta,
      heroPosition: scenario.heroPosition,
      villainPosition: scenario.villainPosition,
      board: scenario.board,
      street: scenario.street,
      potType: scenario.potType,
      action: scenario.action,
      handGroup: scenario.handGroup,
      effectiveStack: scenario.effectiveStack ?? scenario.stack,
    };
    setScenarioHistory((prev) => [snapshot, ...prev].slice(0, 30));
  };

  const logSessionEvent = (entry) => {
    const payload = {
      id: entry.id,
      timestamp: entry.timestamp,
      move: entry.move,
      ev: entry.ev,
      bestMove: entry.bestMove,
      delta: entry.delta,
      street: currentStreet,
      table: activeTableIndex + 1,
      pot: activeTable.pot,
      solver: solverEngine,
      status: entry.isBest ? "Best" : "Off",
      players,
      gameType,
      tournamentFormat: gameType === "tournament" ? tournamentFormat : "N/A",
    };
    setSessionEvents((prev) => [payload, ...prev].slice(0, 50));
    sendSessionEvent(payload);
  };

  const ensureSession = async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const response = await api.createSession({
        mode: "play",
        startedAt: new Date().toISOString(),
        settings: {
          players,
          stack,
          gameType,
          cashCap,
          solverEngine,
          skillMode,
          tournamentFormat,
          hasAntes,
          hasStraddles,
          tableLayout,
        },
      });
      setActiveSessionId(response.id);
      setSessionStartedAt(response.startedAt);
      return response.id;
    } catch (error) {
      console.warn("Session start failed", error);
      return null;
    }
  };

  const endSession = async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      await api.endSession(sessionId, {
        endedAt: new Date().toISOString(),
      });
      setActiveSessionId(null);
      setSessionStartedAt(null);
    } catch (error) {
      console.warn("Session end failed", error);
    }
  };

  const sendSessionEvent = async (payload) => {
    const sessionId = await ensureSession();
    if (!sessionId) return;
    api.postSessionEvents(sessionId, [payload]).catch((error) => {
      console.warn("Event sync failed", error);
    });
  };

  const clearHistory = () => {
    setScenarioHistory([]);
    setMoveHistory([]);
    setStreak({ current: 0, best: 0 });
    setSessionEvents([]);
  };

  const saveCurrentScenario = () => {
    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      label: `${scenario.heroPosition} vs ${scenario.villainPosition} · ${scenario.street}`,
      scenario: {
        ...scenario,
        players,
        stack,
        gameType,
        cashCap,
      },
    };
    setSavedScenarios((prev) => [snapshot, ...prev].slice(0, 50));
  };

  const loadSavedScenario = (item) => {
    const nextScenario = item.scenario;
    const parsed = parseAction(nextScenario.action || "");
    setScenario(nextScenario);
    setPlayers(nextScenario.players ?? players);
    setStack(nextScenario.stack ?? stack);
    setGameType(nextScenario.gameType ?? gameType);
    setCashCap(nextScenario.cashCap ?? cashCap);
    setCustomScenario({
      heroPosition: nextScenario.heroPosition,
      villainPosition: nextScenario.villainPosition,
      street: nextScenario.street,
      potType: nextScenario.potType,
      action: parsed.action,
      actionSize: parsed.actionSize,
      board: nextScenario.board,
      villainStyle: nextScenario.villainStyle,
      handGroup: nextScenario.handGroup,
      stackSpot: nextScenario.stackSpot,
    });
  };

  const deleteSavedScenario = (id) => {
    setSavedScenarios((prev) => prev.filter((item) => item.id !== id));
  };

  const exportHandHistory = () => {
    const payload = {
      profile,
      settings: { players, stack, gameType, cashCap },
      history: scenarioHistory,
      savedScenarios,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gto-trainer-history.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const advanceScenario = () => {
    handleScenario();
  };

  const handleAuthSubmit = (event) => {
    event.preventDefault();
    const isValid =
      authForm.email.trim().toLowerCase() === DEFAULT_ADMIN.email &&
      authForm.password.trim() === DEFAULT_ADMIN.password;
    setIsAdmin(isValid);
    localStorage.setItem(STORAGE_KEYS.auth, String(isValid));
    setShowAuth(false);
  };

  const handleSignOut = () => {
    setIsAdmin(false);
    localStorage.setItem(STORAGE_KEYS.auth, "false");
  };

  const toAmount = (value, fallback = 0) => {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Number(num.toFixed(2)));
  };

  const kellyRecommendation = useMemo(() => {
    const currentPot =
      activePage === "play"
        ? Number(tables[activeTableIndex]?.pot ?? potSize)
        : Number(potSize);
    const plannedBet = toAmount(betInput || betSize, toAmount(betSize));
    const eq = Number(equity) / 100;
    const fraction = calculateKellyFraction({
      pot: currentPot,
      bet: plannedBet,
      equity: eq,
    });
    const stackSize = Number(scenario.effectiveStack ?? stack);
    return {
      fraction,
      recommended: Number((fraction * stackSize).toFixed(2)),
    };
  }, [activePage, tables, activeTableIndex, potSize, betInput, betSize, equity, scenario.effectiveStack, stack]);

  const recordMove = (move) => {
    const decisionTime = Math.max(0, (Date.now() - decisionStart) / 1000);
    const options = [
      { label: "Check", value: evResults.call },
      { label: "Call", value: evResults.call },
      { label: "Bet", value: evResults.bet },
      { label: "Raise", value: evResults.raise },
      { label: "Fold", value: evResults.fold },
    ];
    const best = options.reduce((max, current) =>
      current.value > max.value ? current : max
    );
    const chosen = options.find((option) => option.label === move);
    const isBest = chosen.value >= best.value - 0.01;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      move,
      ev: chosen.value,
      bestMove: best.label,
      bestEv: best.value,
      delta: chosen.value - best.value,
      isBest,
      decisionTime,
      street: scenario.street,
      potType: scenario.potType,
      heroPosition: scenario.heroPosition,
      stackSpot: scenario.stackSpot,
      betSize: toAmount(betSize, 0),
      timestamp: new Date().toLocaleTimeString(),
    };
    setMoveHistory((prev) => [entry, ...prev].slice(0, 20));
    logScenarioDecision(entry);
    logSessionEvent(entry);
    setActionPulse(move);
    setTimeout(() => setActionPulse(null), 350);
    setStreak((prev) => {
      const nextCurrent = isBest ? prev.current + 1 : 0;
      return {
        current: nextCurrent,
        best: Math.max(prev.best, nextCurrent),
      };
    });
    if (drillActive) {
      setDrillStats((prev) => ({
        decisions: prev.decisions + 1,
        best: prev.best + (isBest ? 1 : 0),
        evTotal: prev.evTotal + entry.ev,
      }));
    }
    if (activePage === "play") {
      let shouldAdvance = false;
      updateTable(activeTableIndex, (table) => {
        let staged = runNpcActions({ ...table }, heroSeat);
        if (staged.showdown) return staged;
        const seatToAct = staged.actionQueue[staged.actionIndex];
        if (seatToAct !== heroSeat) return staged;

        if (move === "Fold") {
          let burned = staged.burnPile || [];
          const nextPlayers = staged.handPlayers.map((player) => {
            if (!player.isHero) return player;
            burned = [...burned, ...player.cards];
            return { ...player, inHand: false, mucked: true, cards: [] };
          });
          return resolveShowdown({
            ...staged,
            handPlayers: nextPlayers,
            burnPile: burned,
          });
        }

        const betAmount =
          move === "Bet" || move === "Raise"
            ? toAmount(betInput || betSize, toAmount(betSize))
            : move === "Call"
            ? toAmount(callSize, 0)
            : 0;
        const nextPot = Number((staged.pot + betAmount).toFixed(2));
        const nextIndex = staged.actionIndex + 1;
        let nextTable = {
          ...staged,
          pot: nextPot,
          actionIndex: nextIndex,
        };
        nextTable = runNpcActions(nextTable, null);
        if (
          autoAdvance &&
          !nextTable.showdown &&
          nextTable.actionIndex >= nextTable.actionQueue.length
        ) {
          shouldAdvance = true;
        }
        return nextTable;
      });
      if (autoAdvance && shouldAdvance) {
        advanceStreet(activeTableIndex);
      }
    } else if (drillActive && autoAdvance) {
      advanceScenario();
    }
    setDecisionStart(Date.now());
  };

  const trackerSummary = useMemo(() => {
    if (!moveHistory.length) return { total: 0, best: 0 };
    const best = moveHistory.filter((move) => move.delta >= -0.01).length;
    return { total: moveHistory.length, best };
  }, [moveHistory]);

  const orderedHistory = useMemo(
    () => [...moveHistory].reverse(),
    [moveHistory]
  );

  const metricSeries = useMemo(() => {
    if (!orderedHistory.length) return {};
    let cumulativeEv = 0;
    let bestCount = 0;
    let aggressiveCount = 0;
    return orderedHistory.reduce((acc, entry, index) => {
      const i = index + 1;
      cumulativeEv += entry.ev;
      if (entry.isBest) bestCount += 1;
      if (entry.move === "Bet" || entry.move === "Raise") aggressiveCount += 1;
      acc.cumEv.push(cumulativeEv);
      acc.evPerDecision.push(entry.ev);
      acc.evLoss.push(Math.max(0, -entry.delta));
      acc.bestRate.push((bestCount / i) * 100);
      acc.aggRate.push((aggressiveCount / i) * 100);
      acc.evPer100.push((cumulativeEv / i) * 100);
      return acc;
    }, {
      cumEv: [],
      evPerDecision: [],
      evLoss: [],
      bestRate: [],
      aggRate: [],
      evPer100: [],
    });
  }, [orderedHistory]);

  const toggleMetric = (id) => {
    setMetricSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const metricsSnapshot = useMemo(() => {
    if (!moveHistory.length) {
      return {
        exploitability: [],
        rangeAccuracy: 0,
        evHeatmap: [],
        sizingEfficiency: [],
        confidenceEv: 0,
        timeStats: { avg: 0, slowCount: 0 },
      };
    }

    const nodeMap = new Map();
    const heatmap = new Map();
    const sizing = new Map();
    let totalAggro = 0;
    let totalDecisions = 0;
    let weightedEv = 0;
    let totalWeight = 0;
    let totalTime = 0;
    let slowCount = 0;

    const difficultyWeight = (entry) => {
      const pot = entry.potType || "";
      const stack = entry.stackSpot || "";
      let weight = 1;
      if (pot.includes("4-bet")) weight += 0.6;
      if (pot.includes("3-bet")) weight += 0.3;
      if (stack.includes("Short")) weight += 0.2;
      if (stack.includes("Deep")) weight += 0.25;
      return weight;
    };

    const stackBand = (spot) => {
      if (!spot) return "Mixed";
      if (spot.includes("Short")) return "Short";
      if (spot.includes("Medium")) return "Medium";
      if (spot.includes("Standard")) return "Standard";
      if (spot.includes("Deep")) return "Deep";
      return "Mixed";
    };

    moveHistory.forEach((entry) => {
      const nodeKey = `${entry.street} · ${entry.heroPosition} · ${entry.potType}`;
      const evLoss = Math.max(0, -entry.delta);
      const node = nodeMap.get(nodeKey) || { count: 0, loss: 0 };
      node.count += 1;
      node.loss += evLoss;
      nodeMap.set(nodeKey, node);

      const heatKey = `${entry.street}|${stackBand(entry.stackSpot)}`;
      const heat = heatmap.get(heatKey) || { count: 0, loss: 0 };
      heat.count += 1;
      heat.loss += evLoss;
      heatmap.set(heatKey, heat);

      if (entry.move === "Bet" || entry.move === "Raise") {
        const sizeBucket =
          entry.betSize <= 30
            ? "Small (<=30bb)"
            : entry.betSize <= 60
            ? "Mid (31-60bb)"
            : "Large (60bb+)";
        const bucket = sizing.get(sizeBucket) || { count: 0, ev: 0 };
        bucket.count += 1;
        bucket.ev += entry.ev;
        sizing.set(sizeBucket, bucket);
      }

      totalAggro += entry.move === "Bet" || entry.move === "Raise" ? 1 : 0;
      totalDecisions += 1;
      const weight = difficultyWeight(entry);
      weightedEv += entry.ev * weight;
      totalWeight += weight;
      totalTime += entry.decisionTime || 0;
      if ((entry.decisionTime || 0) > 8) slowCount += 1;
    });

    const exploitability = Array.from(nodeMap.entries())
      .map(([node, data]) => ({
        node,
        avgLoss: data.loss / data.count,
      }))
      .sort((a, b) => b.avgLoss - a.avgLoss)
      .slice(0, 6);

    const evHeatmap = Array.from(heatmap.entries()).map(([key, data]) => {
      const [street, band] = key.split("|");
      return {
        street,
        band,
        avgLoss: data.loss / data.count,
      };
    });

    const sizingEfficiency = Array.from(sizing.entries()).map(
      ([bucket, data]) => ({
        bucket,
        avgEv: data.ev / data.count,
      })
    );

    const targetAggro = 0.55;
    const actualAggro = totalDecisions ? totalAggro / totalDecisions : 0;
    const rangeAccuracy = Math.max(0, 1 - Math.abs(actualAggro - targetAggro));

    return {
      exploitability,
      rangeAccuracy,
      evHeatmap,
      sizingEfficiency,
      confidenceEv: totalWeight ? weightedEv / totalWeight : 0,
      timeStats: {
        avg: totalDecisions ? totalTime / totalDecisions : 0,
        slowCount,
      },
    };
  }, [moveHistory]);

  const appStyle = useMemo(() => {
    const design = TABLE_DESIGNS[tableDesignIndex] || TABLE_DESIGNS[0];
    const felt = useCustomTheme
      ? `radial-gradient(circle at 30% 30%, ${customTheme.felt}, #0b0d12)`
      : design.felt;
    const rail = useCustomTheme ? customTheme.rail : design.rail;
    return {
      "--table-bg": design.background,
      "--table-border": design.border,
      "--table-felt": felt,
      "--table-rail": rail,
      "--table-pattern": design.pattern,
      "--card-bg": useCustomTheme ? customTheme.cardBg : undefined,
      "--card-ink": useCustomTheme ? customTheme.cardInk : undefined,
      "--accent": useCustomTheme ? customTheme.accent : undefined,
    };
  }, [useCustomTheme, customTheme, tableDesignIndex]);

  const seats = SEAT_LABELS[players] || SEAT_LABELS[6];
  const heroSeat = useMemo(() => {
    if (seats.includes(scenario.heroPosition)) return scenario.heroPosition;
    return seats[0];
  }, [seats, scenario.heroPosition]);
  const villainSeat = useMemo(() => {
    if (seats.includes(scenario.villainPosition)) return scenario.villainPosition;
    return seats[1] || seats[0];
  }, [seats, scenario.villainPosition]);

  const seatPositions = useMemo(() => {
    const count = seats.length;
    const orderedSeats = [
      heroSeat,
      ...seats.filter((seat) => seat !== heroSeat),
    ];
    const rx = 46;
    const ry = 38;
    const step = (Math.PI * 2) / count;
    return orderedSeats.map((seat, index) => {
      const angle = Math.PI / 2 + index * step;
      return {
        seat,
        x: 50 + rx * Math.cos(angle),
        y: 50 + ry * Math.sin(angle),
      };
    });
  }, [seats, heroSeat]);
  const activeTable = tables[activeTableIndex] || tables[0] || {
    handPlayers: [],
    boardCards: [],
    burnPile: [],
    pot: 0,
    streetIndex: 0,
    showdown: false,
    handWinners: [],
    winningHand: "",
  };
  const handPlayers = activeTable.handPlayers || [];
  const boardCards = activeTable.boardCards || [];
  const burnPile = activeTable.burnPile || [];
  const showdown = activeTable.showdown;
  const handWinners = activeTable.handWinners || [];
  const winningHand = activeTable.winningHand || "";
  const handPlayersBySeat = useMemo(() => {
    return handPlayers.reduce((acc, player) => {
      acc[player.seat] = player;
      return acc;
    }, {});
  }, [handPlayers]);

  const requestSolverAdvice = async () => {
    const heroPlayer = handPlayers.find((player) => player.isHero);
    if (!heroPlayer || heroPlayer.cards.length < 2) {
      setSolverError("Need hero cards to query solver.");
      return;
    }
    setSolverLoading(true);
    setSolverError(null);
    try {
      const payload = {
        hand_id: activeTable.id ? String(activeTable.id) : undefined,
        street: currentStreet,
        pot: Number(activeTable.pot || 0),
        board: boardCards,
        hero_cards: heroPlayer.cards,
        villain_count: Math.max(
          0,
          handPlayers.filter((player) => player.inHand && !player.isHero).length
        ),
        players,
      };
      const response = await solverApi.solve(payload);
      setSolverAdvice(response);
    } catch (error) {
      setSolverError(error.message);
    } finally {
      setSolverLoading(false);
    }
  };

  const setBetSizePreset = (value) => {
    const tablePot = Number(activeTable.pot ?? potSize);
    if (value === "pot") {
      setBetSize(tablePot);
      return;
    }
    if (value === "allin") {
      setBetSize(Number(scenario.effectiveStack ?? stack));
      return;
    }
    const percent = Number(value);
    if (!Number.isNaN(percent)) {
      setBetSize(Number((tablePot * (percent / 100)).toFixed(2)));
      return;
    }
    setBetSize(Number(value));
  };

  const buildSeatStacks = () => {
    const base = scenario.effectiveStack ?? stack;
    return seats.reduce((acc, seat) => {
      if (seat === heroSeat || seat === villainSeat) {
        acc[seat] = base;
      } else {
        const spread = base * 0.35;
        acc[seat] = Math.max(
          10,
          Math.round(base + (Math.random() - 0.5) * spread)
        );
      }
      return acc;
    }, {});
  };

  const basePot = () => {
    const blinds = 1.5;
    const anteTotal = hasAntes ? seats.length * 0.1 : 0;
    const straddle = hasStraddles ? 1 : 0;
    return Number((blinds + anteTotal + straddle).toFixed(2));
  };

  const npcProfile = () => {
    if (skillMode === "Beginner") {
      return { fold: 0.15, call: 0.6, bet: 0.25, raise: 0 };
    }
    if (skillMode === "Intermediate") {
      return { fold: 0.25, call: 0.5, bet: 0.2, raise: 0.05 };
    }
    return { fold: 0.28, call: 0.35, bet: 0.25, raise: 0.12 };
  };

  const buildActionQueue = (streetName = "Preflop") => {
    const rotateToSeat = (list, startSeat) => {
      const idx = list.indexOf(startSeat);
      if (idx === -1) return [...list];
      return [...list.slice(idx), ...list.slice(0, idx)];
    };

    if (actionOrderMode === "heroFirst") {
      return rotateToSeat(seats, heroSeat);
    }

    const bbStart = () => {
      const idx = seats.indexOf("BB");
      if (idx === -1) return seats[0];
      return seats[(idx + 1) % seats.length];
    };

    const btnStart = () => {
      const btnIdx = seats.indexOf("BTN");
      if (btnIdx !== -1) return seats[(btnIdx + 1) % seats.length] || seats[0];
      const sbIdx = seats.indexOf("SB");
      if (sbIdx !== -1) return seats[sbIdx];
      return seats[0];
    };

    const startSeat = streetName === "Preflop" ? bbStart() : btnStart();
    return rotateToSeat(seats, startSeat);
  };

  const buildNewHandState = (tableId) => {
    const deck = shuffleDeck(buildDeck());
    const seatStacks = buildSeatStacks();
    const names = [...PLAYER_NAMES].sort(() => Math.random() - 0.5);
    const playersList = seats.map((seat, index) => ({
      seat,
      name: names[index % names.length],
      stack: seatStacks[seat],
      cards: [],
      inHand: true,
      isHero: seat === heroSeat,
      isVillain: seat === villainSeat,
    }));
    const { dealt, remaining } = dealCards(deck, playersList.length * 2);
    const withCards = playersList.map((player, index) => ({
      ...player,
      cards: dealt.slice(index * 2, index * 2 + 2),
    }));
    return {
      id: tableId,
      handPlayers: withCards,
      boardCards: [],
      burnPile: [],
      pot: basePot(),
      actionQueue: buildActionQueue("Preflop"),
      actionIndex: 0,
      streetIndex: 0,
      showdown: false,
      handWinners: [],
      winningHand: "",
      deck: remaining,
    };
  };

  const updateTable = (tableIndex, updater) => {
    setTables((prev) =>
      prev.map((table, index) => {
        if (index !== tableIndex) return table;
        return updater(table);
      })
    );
  };

  const resolveShowdown = (table) => {
    let nextBoard = table.boardCards;
    let nextDeck = table.deck;
    const needed = Math.max(0, 5 - nextBoard.length);
    if (needed > 0) {
      const { dealt, remaining } = dealCards(nextDeck, needed);
      nextDeck = remaining;
      nextBoard = [...nextBoard, ...dealt];
    }
    const activePlayers = table.handPlayers.filter((player) => player.inHand);
    if (!activePlayers.length) {
      return {
        ...table,
        boardCards: nextBoard,
        deck: nextDeck,
        showdown: true,
        streetIndex: 4,
        handWinners: [],
        winningHand: "",
      };
    }
    const ranked = activePlayers.map((player) => ({
      seat: player.seat,
      result: evaluateHand([...nextBoard, ...player.cards]),
    }));
    const bestScore = Math.max(...ranked.map((item) => item.result.score));
    const winners = ranked.filter((item) => item.result.score === bestScore);
    return {
      ...table,
      boardCards: nextBoard,
      deck: nextDeck,
      showdown: true,
      streetIndex: 4,
      handWinners: winners.map((winner) => winner.seat),
      winningHand: winners[0]?.result.name || "",
    };
  };

  const endHandIfSingle = (table) => {
    const remaining = table.handPlayers.filter((player) => player.inHand);
    if (remaining.length <= 1) {
      const winner = remaining[0]?.seat;
      return {
        ...table,
        showdown: true,
        streetIndex: 4,
        handWinners: winner ? [winner] : [],
        winningHand: winner ? "Uncontested" : "",
      };
    }
    return table;
  };

  const runNpcActions = (table, untilSeat) => {
    let nextTable = { ...table };
    let index = nextTable.actionIndex;
    let iterations = 0;
    const profile = npcProfile();
    while (
      index < nextTable.actionQueue.length &&
      iterations < nextTable.actionQueue.length
    ) {
      const seat = nextTable.actionQueue[index];
      if (untilSeat && seat === untilSeat) break;
      const player = nextTable.handPlayers.find((p) => p.seat === seat);
      if (!player || !player.inHand || player.isHero) {
        index += 1;
        iterations += 1;
        continue;
      }
      const roll = Math.random();
      if (roll < profile.fold) {
        const updatedPlayers = nextTable.handPlayers.map((p) =>
          p.seat === seat ? { ...p, inHand: false, cards: [] } : p
        );
        nextTable = { ...nextTable, handPlayers: updatedPlayers };
      } else if (roll < profile.fold + profile.call) {
        nextTable = {
          ...nextTable,
          pot: Number(
            (nextTable.pot + toAmount(callSize, 0)).toFixed(2)
          ),
        };
      } else if (roll < profile.fold + profile.call + profile.bet) {
        nextTable = {
          ...nextTable,
          pot: Number(
            (nextTable.pot + toAmount(betSize, 0)).toFixed(2)
          ),
        };
      } else {
        nextTable = {
          ...nextTable,
          pot: Number(
            (nextTable.pot + toAmount(raiseSize, 0)).toFixed(2)
          ),
        };
      }
      index += 1;
      iterations += 1;
      nextTable = endHandIfSingle(nextTable);
      if (nextTable.showdown) break;
    }
    return { ...nextTable, actionIndex: index };
  };

  const startNewHand = (tableIndex) => {
    updateTable(tableIndex, (table) => buildNewHandState(table.id));
    setDealTick((prev) => prev + 1);
    setDecisionStart(Date.now());
  };

  const advanceStreet = (tableIndex) => {
    updateTable(tableIndex, (table) => {
      if (table.showdown) return table;
      let nextDeck = table.deck;
      let nextBoard = table.boardCards;
      let nextStreet = table.streetIndex;
      if (table.streetIndex === 0) {
        const { dealt, remaining } = dealCards(nextDeck, 3);
        nextDeck = remaining;
        nextBoard = [...nextBoard, ...dealt];
        nextStreet = 1;
      } else if (table.streetIndex === 1) {
        const { dealt, remaining } = dealCards(nextDeck, 1);
        nextDeck = remaining;
        nextBoard = [...nextBoard, ...dealt];
        nextStreet = 2;
      } else if (table.streetIndex === 2) {
        const { dealt, remaining } = dealCards(nextDeck, 1);
        nextDeck = remaining;
        nextBoard = [...nextBoard, ...dealt];
        nextStreet = 3;
      } else if (table.streetIndex === 3) {
        return resolveShowdown(table);
      }
      return {
        ...table,
        boardCards: nextBoard,
        deck: nextDeck,
        actionQueue: buildActionQueue(HAND_STREETS[nextStreet] || "Preflop"),
        actionIndex: 0,
        streetIndex: nextStreet,
      };
    });
    setDealTick((prev) => prev + 1);
  };

  const currentStreet =
    HAND_STREETS[tables[activeTableIndex]?.streetIndex || 0] || "Preflop";
  const solverMix = solverAdvice?.action_mix || [];
  const formatClock = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, "0")}`;
  };

  const pageIntro = PAGE_INTROS[activePage];
  const showTrainerConsole = activePage === "settings";

  return (
    <div className={`app ${tableTheme} ${cardTheme}`} style={appStyle}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">GTO</span>
          <div>
            <p className="brand-title">Game Theory Oracle</p>
            <p className="brand-sub">Max EV. Real patterns.</p>
          </div>
        </div>
        <nav className="nav">
          {PAGES.map((page) => (
            <button
              key={page.id}
              className={activePage === page.id ? "nav-tab active" : "nav-tab"}
              onClick={() => setActivePage(page.id)}
              type="button"
            >
              {page.label}
            </button>
          ))}
        </nav>
        {isAdmin ? (
          <div className="auth-chip">
            <span>Admin</span>
            <button className="ghost-button" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        ) : (
          <button className="ghost-button" onClick={() => setShowAuth(true)}>
            Admin Sign In
          </button>
        )}
      </header>

      <main>
        {activePage !== "play" && activePage !== "review" ? (
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Competitive GTO training</p>
            <h1>
              {activePage === "home" ? (
                <>
                  Game Theory Oracle builds
                  <span className="accent"> instinctive EV</span>.
                </>
              ) : (
                pageIntro?.title
              )}
            </h1>
            <p className="lead">{pageIntro?.text}</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={handleScenario}>
                Generate Scenario
              </button>
              <button className="secondary-button">Explore Lessons</button>
            </div>
            {activePage === "home" ? (
              <div className="hero-metrics">
                <div>
                  <span className="metric-value">2,100+</span>
                  <span className="metric-label">Spots</span>
                </div>
                <div>
                  <span className="metric-value">8</span>
                  <span className="metric-label">Game formats</span>
                </div>
                <div>
                  <span className="metric-value">EV+</span>
                  <span className="metric-label">Driven</span>
                </div>
              </div>
            ) : null}
          </div>
          {showTrainerConsole ? (
            <div className="hero-panel">
            <div className="panel-header">
              <h2>Trainer Console</h2>
              <span className="pill">Live</span>
            </div>
            <div className="panel-grid">
              <div className="panel-card">
                <h3>Player Profile</h3>
                <div className="custom-form">
                  <label className="field">
                    Display name
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Role
                    <select
                      value={profile.role}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          role: event.target.value,
                        }))
                      }
                    >
                      <option value="Player">Player</option>
                      <option value="Coach">Coach</option>
                      <option value="Analyst">Analyst</option>
                    </select>
                  </label>
                </div>
                <div className="profile-chip">
                  <span>{profile.name}</span>
                  <span className="pill subtle">{profile.role}</span>
                </div>
              </div>
              <div className="panel-card">
                <h3>Game Settings</h3>
                <label className="field">
                  Table size
                  <select
                    value={players}
                    onChange={(event) => setPlayers(Number(event.target.value))}
                  >
                    <option value={2}>Heads Up (2)</option>
                    <option value={3}>3 Players</option>
                    <option value={4}>4 Players</option>
                    <option value={5}>5 Players</option>
                    <option value={6}>6-Max</option>
                    <option value={7}>7 Players</option>
                    <option value={8}>8 Players</option>
                    <option value={9}>Full Ring (9)</option>
                  </select>
                </label>
                <label className="field">
                  Game type
                  <select
                    value={gameType}
                    onChange={(event) => setGameType(event.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="tournament">Tournament</option>
                  </select>
                </label>
                {gameType === "cash" ? (
                  <label className="field">
                    Cash game cap
                    <input
                      type="number"
                      min="20"
                      max="1000"
                      step="10"
                      value={cashCap}
                      onChange={(event) => setCashCap(event.target.value)}
                    />
                  </label>
                ) : null}
                <label className="field">
                  Starting Stack
                  <input
                    type="range"
                    min="20"
                    max="1000"
                    step="5"
                    value={stack}
                    onChange={(event) => setStack(Number(event.target.value))}
                  />
                  <span className="field-value">{stack} bb</span>
                </label>
                <button className="ghost-button" onClick={handleScenario}>
                  Refresh Scenario
                </button>
              </div>
              <div className="panel-card">
                <h3>Custom Scenario</h3>
                <div className="custom-form">
                  <label className="field">
                    Hero position
                    <input
                      type="text"
                      value={customScenario.heroPosition}
                      onChange={(event) =>
                        handleCustomChange("heroPosition", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Villain position
                    <input
                      type="text"
                      value={customScenario.villainPosition}
                      onChange={(event) =>
                        handleCustomChange("villainPosition", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Street
                    <select
                      value={customScenario.street}
                      onChange={(event) =>
                        handleCustomChange("street", event.target.value)
                      }
                    >
                      {STREET_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Pot type
                    <select
                      value={customScenario.potType}
                      onChange={(event) =>
                        handleCustomChange("potType", event.target.value)
                      }
                    >
                      {POT_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Action
                    <input
                      type="text"
                      value={customScenario.action}
                      onChange={(event) =>
                        handleCustomChange("action", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Action size (optional)
                    <input
                      type="text"
                      value={customScenario.actionSize}
                      onChange={(event) =>
                        handleCustomChange("actionSize", event.target.value)
                      }
                      placeholder="33% or 2.5x"
                    />
                  </label>
                  <label className="field">
                    Board texture
                    <input
                      type="text"
                      value={customScenario.board}
                      onChange={(event) =>
                        handleCustomChange("board", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Villain style
                    <input
                      type="text"
                      value={customScenario.villainStyle}
                      onChange={(event) =>
                        handleCustomChange("villainStyle", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Hand group
                    <input
                      type="text"
                      value={customScenario.handGroup}
                      onChange={(event) =>
                        handleCustomChange("handGroup", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Stack spot note
                    <input
                      type="text"
                      value={customScenario.stackSpot}
                      onChange={(event) =>
                        handleCustomChange("stackSpot", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="custom-actions">
                  <button
                    className="secondary-button"
                    onClick={applyCustomScenario}
                  >
                    Apply Scenario
                  </button>
                  <button className="ghost-button" onClick={handleScenario}>
                    Fill With Random
                  </button>
                </div>
              </div>
              <div className="panel-card">
                <h3>Table & Cards</h3>
                <div className="custom-form">
                  <div className="design-switcher">
                    <button
                      className="ghost-button"
                      onClick={() =>
                        setTableDesignIndex(
                          (prev) =>
                            (prev - 1 + TABLE_DESIGNS.length) %
                            TABLE_DESIGNS.length
                        )
                      }
                    >
                      Prev
                    </button>
                    <div className="design-title">
                      <span className="scenario-label">Table design</span>
                      <p>{TABLE_DESIGNS[tableDesignIndex].name}</p>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() =>
                        setTableDesignIndex(
                          (prev) => (prev + 1) % TABLE_DESIGNS.length
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                  <div className="design-grid">
                    {TABLE_DESIGNS.map((design, index) => (
                      <button
                        key={design.name}
                        className={
                          tableDesignIndex === index
                            ? "design-chip active"
                            : "design-chip"
                        }
                        onClick={() => setTableDesignIndex(index)}
                      >
                        {design.name}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    Table style
                    <select
                      value={tableTheme}
                      onChange={(event) => setTableTheme(event.target.value)}
                    >
                      {TABLE_THEMES.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Card style
                    <select
                      value={cardTheme}
                      onChange={(event) => setCardTheme(event.target.value)}
                    >
                      {CARD_THEMES.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field toggle-field">
                  <input
                    type="checkbox"
                    checked={useCustomTheme}
                    onChange={(event) => setUseCustomTheme(event.target.checked)}
                  />
                  Enable custom palette
                </label>
                {useCustomTheme ? (
                  <div className="custom-form">
                    <label className="field">
                      Felt color
                      <input
                        type="color"
                        value={customTheme.felt}
                        onChange={(event) =>
                          setCustomTheme((prev) => ({
                            ...prev,
                            felt: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      Rail color
                      <input
                        type="color"
                        value={customTheme.rail}
                        onChange={(event) =>
                          setCustomTheme((prev) => ({
                            ...prev,
                            rail: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      Card background
                      <input
                        type="color"
                        value={customTheme.cardBg}
                        onChange={(event) =>
                          setCustomTheme((prev) => ({
                            ...prev,
                            cardBg: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      Card ink
                      <input
                        type="color"
                        value={customTheme.cardInk}
                        onChange={(event) =>
                          setCustomTheme((prev) => ({
                            ...prev,
                            cardInk: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      Accent color
                      <input
                        type="color"
                        value={customTheme.accent}
                        onChange={(event) =>
                          setCustomTheme((prev) => ({
                            ...prev,
                            accent: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
                <div className="table-preview">
                  <div className="table-felt">
                    <div className="table-rail"></div>
                    <div className="table-cards">
                      <div className="table-card">A♠</div>
                      <div className="table-card">K♥</div>
                      <div className="table-card">Q♦</div>
                      <div className="table-card">7♣</div>
                      <div className="table-card">2♠</div>
                    </div>
                  </div>
                </div>
                <div className="spot-strip">
                  <div>
                    <span>Hero</span>
                    <strong>{heroSeat}</strong>
                  </div>
                  <div>
                    <span>Villain</span>
                    <strong>{villainSeat}</strong>
                  </div>
                  <div>
                    <span>Stack</span>
                    <strong>{scenario.effectiveStack ?? scenario.stack} bb</strong>
                  </div>
                  <div>
                    <span>Street</span>
                    <strong>{currentStreet}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{showdown ? "Showdown" : "In hand"}</strong>
                  </div>
                  <div>
                    <span>Board</span>
                    <strong>
                      {boardCards.length
                        ? boardCards.map((card) => formatCard(card)).join(" ")
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="panel-card">
                <h3>Scenario Library</h3>
                <div className="library-list">
                  {savedScenarios.length === 0 ? (
                    <p className="tracker-empty">No saved scenarios yet.</p>
                  ) : (
                    savedScenarios.map((item) => (
                      <div key={item.id} className="library-item">
                        <div>
                          <span className="library-title">{item.label}</span>
                          <span className="library-meta">
                            {item.scenario.board} · {item.scenario.action}
                          </span>
                        </div>
                        <div className="library-actions">
                          <button
                            className="ghost-button"
                            onClick={() => loadSavedScenario(item)}
                          >
                            Load
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => deleteSavedScenario(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button
                  className="secondary-button"
                  onClick={exportHandHistory}
                >
                  Export Hand History
                </button>
              </div>
            </div>
            <div className="panel-footer">
              <span>
                Player pool: {players}-max / {stack} bb · {profile.name}
              </span>
              <button
                className="primary-button small"
                onClick={drillActive ? stopDrill : startDrill}
              >
                {drillActive ? "Pause Drill" : "Start Drill"}
              </button>
            </div>
          </div>
          ) : null}
        </section>
        ) : null}

        {activePage === "play" ? (
          <section className="section play-section">
            <div className="play-grid">
              <div className="play-table">
                <div className="session-banner session-top">
                  <div>
                    <span>Session</span>
                    <strong>
                      {drillActive ? "Live" : "Idle"} · {formatClock(drillRemaining)}
                    </strong>
                  </div>
                  <div>
                    <span>Decisions</span>
                    <strong>{drillStats.decisions}</strong>
                  </div>
                  <div>
                    <span>Best %</span>
                    <strong>
                      {drillStats.decisions
                        ? Math.round(
                            (drillStats.best / drillStats.decisions) * 100
                          )
                        : 0}
                      %
                    </strong>
                  </div>
                  <div>
                    <span>EV Total</span>
                    <strong>
                      {formatChips(
                        moveHistory.reduce((sum, entry) => sum + entry.ev, 0)
                      )}
                    </strong>
                  </div>
                  <div className="session-menu">
                    <button
                      className="menu-toggle"
                      onClick={() => setShowTableMenu((prev) => !prev)}
                    >
                      ☰
                    </button>
                    {showTableMenu ? (
                      <div className="menu-panel">
                        <label>
                          Table size
                          <select
                            value={players}
                            onChange={(event) =>
                              setPlayers(Number(event.target.value))
                            }
                          >
                            <option value={2}>Heads Up (2)</option>
                            <option value={3}>3 Players</option>
                            <option value={4}>4 Players</option>
                            <option value={5}>5 Players</option>
                            <option value={6}>6-Max</option>
                            <option value={7}>7 Players</option>
                            <option value={8}>8 Players</option>
                            <option value={9}>Full Ring (9)</option>
                          </select>
                        </label>
                        <label>
                          Table layout
                          <select
                            value={tableLayout}
                            onChange={(event) =>
                              setTableLayout(Number(event.target.value))
                            }
                          >
                            <option value={1}>Single</option>
                            <option value={2}>Two tables (stacked)</option>
                            <option value={4}>Four tables</option>
                          </select>
                        </label>
                        <label>
                          Action order
                          <select
                            value={actionOrderMode}
                            onChange={(event) =>
                              setActionOrderMode(event.target.value)
                            }
                          >
                            {ACTION_ORDER_MODES.map((mode) => (
                              <option key={mode.id} value={mode.id}>
                                {mode.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          NPC skill
                          <select
                            value={skillMode}
                            onChange={(event) =>
                              setSkillMode(event.target.value)
                            }
                          >
                            {SKILL_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {mode}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={hasAntes}
                            onChange={(event) =>
                              setHasAntes(event.target.checked)
                            }
                          />
                          Antes
                        </label>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={hasStraddles}
                            onChange={(event) =>
                              setHasStraddles(event.target.checked)
                            }
                          />
                          Straddles
                        </label>
                        <button
                          className="ghost-button"
                          onClick={handleScenario}
                        >
                          New Hand
                        </button>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={autoAdvance}
                            onChange={(event) =>
                              setAutoAdvance(event.target.checked)
                            }
                          />
                          Auto-advance streets
                        </label>
                        <label>
                          Session time
                          <select
                            value={drillDuration}
                            onChange={(event) =>
                              setDrillDuration(Number(event.target.value))
                            }
                          >
                            {DRILL_PRESETS.map((preset) => (
                              <option key={preset.value} value={preset.value}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Solver engine
                          <select
                            value={solverEngine}
                            onChange={(event) =>
                              setSolverEngine(event.target.value)
                            }
                          >
                            {SOLVER_ENGINES.map((engine) => (
                              <option key={engine} value={engine}>
                                {engine}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="ghost-button"
                          onClick={saveCurrentScenario}
                        >
                          Save Spot
                        </button>
                        <button className="ghost-button" onClick={startDrill}>
                          Start Drill
                        </button>
                        <button className="ghost-button" onClick={stopDrill}>
                          Pause Session
                        </button>
                        <button className="ghost-button" onClick={resetDrill}>
                          End Session
                        </button>
                        <button
                          className="ghost-button"
                          onClick={exportHandHistory}
                        >
                          Log Session
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="table-sim">
                  <div
                    className={`table-grid ${
                      tableLayout === 1
                        ? "single"
                        : tableLayout === 2
                        ? "stack"
                        : "quad"
                    }`}
                  >
                    {tables.map((table, index) => {
                      const tablePlayers = table.handPlayers.reduce(
                        (acc, player) => {
                          acc[player.seat] = player;
                          return acc;
                        },
                        {}
                      );
                      const isActive = index === activeTableIndex;
                      return (
                        <div
                          key={table.id}
                          className={`table-stage ${
                            isActive ? "active-table" : ""
                          }`}
                          onClick={() => setActiveTableIndex(index)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="table-oval" key={`${table.id}-${dealTick}`}>
                            <div className="table-rail"></div>
                            <div className="table-felt large">
                              <div className="table-center">
                                <div className="table-board">
                                  {Array.from({ length: 5 }).map((_, slot) => {
                                    const card = table.boardCards[slot];
                                    const animationClass =
                                      table.boardCards.length <= 3
                                        ? "deal-flop"
                                        : table.boardCards.length === 4 &&
                                          slot === 3
                                        ? "deal-turn"
                                        : table.boardCards.length === 5 &&
                                          slot === 4
                                        ? "deal-river"
                                        : "deal-static";
                                    return (
                                      <div
                                        key={`board-${slot}`}
                                        className={`table-card deal-card ${
                                          card ? animationClass : "deal-static"
                                        } ${card ? "" : "card-placeholder"}`}
                                        style={{
                                          animationDelay:
                                            card && animationClass !== "deal-static"
                                              ? `${0.2 + slot * 0.15}s`
                                              : "0s",
                                        }}
                                      >
                                        {card ? formatCard(card) : ""}
                                      </div>
                                    );
                                  })}
                                  <div className="table-card back deal-static burn-slot">
                                    {Array.from({
                                      length: Math.min(table.burnPile.length, 3),
                                    }).map((_, burnIndex) => (
                                      <span
                                        key={`burn-${burnIndex}`}
                                        className="burn-stack-card"
                                        style={{
                                          transform: `translate(${
                                            burnIndex * 3
                                          }px, ${burnIndex * -2}px)`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="table-pot">
                                  <span>Pot</span>
                                  <strong>
                                    {(table.pot ?? potSize).toFixed(2)} bb
                                  </strong>
                                  {table.showdown && table.winningHand ? (
                                    <span className="pot-result">
                                      {table.winningHand}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="seat-ring">
                              {seatPositions.map((item) => {
                                const player = tablePlayers[item.seat];
                                const showCards =
                                  player?.inHand &&
                                  (player?.isHero || table.showdown);
                                return (
                                  <div
                                    key={item.seat}
                                    className="seat-wrap"
                                    style={{
                                      "--seat-x": `${item.x}%`,
                                      "--seat-y": `${item.y}%`,
                                    }}
                                  >
                                    <div className="seat-cards">
                                      {player?.inHand ? (
                                        (player?.cards || []).map(
                                          (card, cardIndex) => (
                                            <span
                                              key={`${card}-${cardIndex}`}
                                              className={
                                                showCards
                                                  ? "mini-card"
                                                  : "mini-card back"
                                              }
                                            >
                                              {showCards ? formatCard(card) : ""}
                                            </span>
                                          )
                                        )
                                      ) : (
                                        <span className="seat-folded">
                                          Folded
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className={`seat-chip ${
                                        player?.isHero ? "hero" : ""
                                      } ${
                                        player?.isVillain ? "villain" : ""
                                      } ${
                                        table.handWinners.includes(item.seat)
                                          ? "winner"
                                          : ""
                                      }`}
                                    >
                                      <div className="seat-avatar">
                                        <span>{item.seat.slice(0, 2)}</span>
                                      </div>
                                      <div className="seat-meta">
                                        <span className="seat-name">
                                          {player?.name || item.seat}
                                        </span>
                                        <span className="seat-stack">
                                          {player?.stack ?? stack} bb
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="spot-strip">
                  <div>
                    <span>Hero</span>
                    <strong>{heroSeat}</strong>
                  </div>
                  <div>
                    <span>Villain</span>
                    <strong>{villainSeat}</strong>
                  </div>
                  <div>
                    <span>Stack</span>
                    <strong>{scenario.effectiveStack ?? scenario.stack} bb</strong>
                  </div>
                  <div>
                    <span>Street</span>
                    <strong>{currentStreet}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{showdown ? "Showdown" : "In hand"}</strong>
                  </div>
                  <div>
                    <span>Board</span>
                    <strong>
                      {boardCards.length
                        ? boardCards.map((card) => formatCard(card)).join(" ")
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="table-console panel-card action-console tight">
                  <h3>Action Console</h3>
                  <div className="action-row">
                    <button
                      className={
                        actionPulse === "Fold"
                          ? "ghost-button action-button active"
                          : "ghost-button action-button"
                      }
                      onClick={() => recordMove("Fold")}
                    >
                      Fold
                    </button>
                    <button
                      className={
                        actionPulse === "Call"
                          ? "ghost-button action-button active"
                          : "ghost-button action-button"
                      }
                      onClick={() => recordMove("Call")}
                    >
                      Call
                    </button>
                    <button
                      className={
                        actionPulse === "Bet"
                          ? "ghost-button action-button active"
                          : "ghost-button action-button"
                      }
                      onClick={() => recordMove("Bet")}
                    >
                      Bet
                    </button>
                    <button
                      className={
                        actionPulse === "Raise"
                          ? "ghost-button action-button active"
                          : "ghost-button action-button"
                      }
                      onClick={() => recordMove("Raise")}
                    >
                      Raise
                    </button>
                    <button
                      className={
                        actionPulse === "Check"
                          ? "ghost-button action-button active"
                          : "ghost-button action-button"
                      }
                      onClick={() => recordMove("Check")}
                    >
                      Check
                    </button>
                  </div>
                  <div className="bet-input-row">
                    <label className="field compact-field">
                      Bet size (bb)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={betInput}
                        onChange={(event) => setBetInput(event.target.value)}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      onClick={() => setBetSize(Number(betInput))}
                    >
                      Set Bet
                    </button>
                  </div>
                <div className="bet-presets">
                  {["25", "33", "50", "75"].map((size) => (
                    <button
                      key={size}
                      className="ghost-button"
                        onClick={() => setBetSizePreset(size)}
                      >
                        {size}%
                      </button>
                    ))}
                    <button
                      className="ghost-button"
                      onClick={() => setBetSizePreset("pot")}
                    >
                      Pot
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => setBetSizePreset("allin")}
                    >
                      All-in
                    </button>
                  </div>
                  <div className="kelly-hint">
                    <span>Kelly fraction</span>
                    <strong>{Math.round(kellyRecommendation.fraction * 100)}%</strong>
                    <span>≈ {kellyRecommendation.recommended} bb of stack</span>
                  </div>
                  <label className="field">
                    Bet size ({betSize} bb)
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="5"
                      value={Number(betSize)}
                      onChange={(event) =>
                        setBetSize(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <div className="panel-card solver-card table-console">
                  <div className="solver-head">
                    <h3>Solver Advice</h3>
                    <span className="pill subtle">{solverEngine}</span>
                  </div>
                  <p className="solver-copy">
                    Query the local solver for the active hand and street.
                  </p>
                  <div className="solver-actions">
                    <button
                      className="secondary-button"
                      onClick={requestSolverAdvice}
                      disabled={solverLoading}
                    >
                      {solverLoading ? "Solving..." : "Request Mix"}
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => setSolverAdvice(null)}
                      disabled={solverLoading}
                    >
                      Clear
                    </button>
                  </div>
                  {solverError ? (
                    <div className="solver-error">{solverError}</div>
                  ) : null}
                  {solverAdvice ? (
                    <>
                      <div className="solver-best">
                        <div>
                          <span className="scenario-label">Best Action</span>
                          <p>{solverAdvice.best_action}</p>
                        </div>
                        <div>
                          <span className="scenario-label">EV</span>
                          <p>{formatChips(solverAdvice.ev ?? 0)}</p>
                        </div>
                      </div>
                      <div className="solver-mix">
                        {solverMix.map((item) => (
                          <div key={item.action} className="solver-row">
                            <div className="solver-row-head">
                              <span>{item.action}</span>
                              <span>{Math.round(item.frequency * 100)}%</span>
                              <span>{formatChips(item.ev ?? 0)}</span>
                            </div>
                            <div className="solver-bar">
                              <div
                                className="solver-bar-fill"
                                style={{
                                  width: `${Math.round(item.frequency * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="solver-notes">{solverAdvice.notes}</p>
                    </>
                  ) : (
                    <p className="solver-empty">
                      Get a quick equilibrium-inspired mix for this spot.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activePage === "review" ? (
        <section className="section feed-section">
          <div className="section-title">
            <div className="section-head">
              <h2>Session Feed</h2>
              <button className="ghost-button" onClick={clearHistory}>
                Clear Feed
              </button>
            </div>
            <p>Every decision you make is logged like an online hand history.</p>
          </div>
          <div className="feed-grid">
            <div className="feed-panel">
              <h3>Recent Decisions</h3>
              <div className="feed-list">
                {sessionEvents.length === 0 ? (
                  <p className="tracker-empty">No decisions recorded yet.</p>
                ) : (
                  sessionEvents.map((entry) => (
                    <div key={entry.id} className="feed-item">
                      <div>
                        <span className="feed-action">{entry.move}</span>
                        <span className="feed-meta">
                          Table {entry.table} · {entry.street}
                        </span>
                      </div>
                      <div>
                        <span className="feed-ev">{formatChips(entry.ev)}</span>
                        <span className="feed-meta">
                          Best: {entry.bestMove} · {entry.solver}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="feed-panel">
              <h3>Session Snapshot</h3>
              <div className="session-stats wide">
                <div>
                  <span className="scenario-label">Player</span>
                  <p>{profile.name}</p>
                </div>
                <div>
                  <span className="scenario-label">Role</span>
                  <p>{profile.role}</p>
                </div>
                <div>
                  <span className="scenario-label">Decisions</span>
                  <p>{moveHistory.length}</p>
                </div>
                <div>
                  <span className="scenario-label">Best EV %</span>
                  <p>
                    {trackerSummary.total
                      ? Math.round(
                          (trackerSummary.best / trackerSummary.total) * 100
                        )
                      : 0}
                    %
                  </p>
                </div>
                <div>
                  <span className="scenario-label">EV total</span>
                  <p>
                    {formatChips(
                      moveHistory.reduce((sum, entry) => sum + entry.ev, 0)
                    )}
                  </p>
                </div>
              </div>
              <button className="secondary-button" onClick={advanceScenario}>
                Deal Next Hand
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {activePage === "learn" ? (
        <section id="trainer" className="section">
          <div className="section-title">
            <div className="section-head">
              <h2>Decision Labs</h2>
              <button
                className="ghost-button"
                onClick={() => togglePanel("trainer")}
              >
                {expandedPanels.trainer ? "Collapse" : "Expand"}
              </button>
            </div>
            <p>
              Drill through weighted lines, track accuracy, and study solver
              outputs as you go.
            </p>
          </div>
          {expandedPanels.trainer ? (
            <div className="lab-grid">
              <div className="lab-card">
                <h3>Frequency Trainer</h3>
                <p>Lock in the correct mix for bet sizes and checks.</p>
                <button className="ghost-button">Launch</button>
              </div>
              <div className="lab-card">
                <h3>Range Builder</h3>
                <p>Build, color-code, and test preflop trees quickly.</p>
                <button className="ghost-button">Launch</button>
              </div>
              <div className="lab-card">
                <h3>Leak Scanner</h3>
                <p>Spot patterns where your EV drops the fastest.</p>
                <button className="ghost-button">Launch</button>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {activePage === "learn" ? (
        <section id="charts" className="section split">
          <div className="chart-panel">
            <div className="section-head">
              <h2>Preflop Charts</h2>
              <button
                className="ghost-button"
                onClick={() => togglePanel("charts")}
              >
                {expandedPanels.charts ? "Collapse" : "Expand"}
              </button>
            </div>
            <p>
              Study position-based ranges, then test your recall with random
              spot checks.
            </p>
            {expandedPanels.charts ? (
              <>
                <div className="position-tabs">
                  {PREFLOP_CHARTS.map((item) => (
                    <button
                      key={item.position}
                      className={
                        chartPosition === item.position ? "tab active" : "tab"
                      }
                      onClick={() => setChartPosition(item.position)}
                    >
                      {item.position}
                    </button>
                  ))}
                </div>
                <div className="chart-card">
                  <h3>{chart.position} Open Range</h3>
                  <p>{chart.openRange}</p>
                  <div className="chart-row">
                    <span>3-Bet</span>
                    <span>{chart.threeBet}</span>
                  </div>
                  <div className="chart-row">
                    <span>Mix</span>
                    <span>{chart.mix}</span>
                  </div>
                  <button className="secondary-button">View Full Chart</button>
                </div>
              </>
            ) : null}
          </div>
          {expandedPanels.charts ? (
            <div className="lesson-panel">
              <h3>Lesson Queue</h3>
              <div className="lesson-card">
                <h4>Why equity shifts preflop</h4>
                <p>Connect stack depth with raise sizing and range width.</p>
                <span>6 min read</span>
              </div>
              <div className="lesson-card">
                <h4>Range vs range EV</h4>
                <p>Understand how folds and calls balance in equilibrium.</p>
                <span>12 min read</span>
              </div>
              <div className="lesson-card">
                <h4>Bluff math in 3-bet pots</h4>
                <p>Compute minimum defense frequencies on the fly.</p>
                <span>9 min read</span>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {activePage === "review" ? (
        <section id="ev" className="section ev-section">
          <div className="section-title">
            <div className="section-head">
              <h2>EV Calculator</h2>
              <button
                className="ghost-button"
                onClick={() => togglePanel("ev")}
              >
                {expandedPanels.ev ? "Collapse" : "Expand"}
              </button>
            </div>
            <p>
              Use quick math to validate your line. All values in big blinds.
            </p>
          </div>
          {expandedPanels.ev ? (
            <div className="ev-grid">
              <div className="ev-inputs">
                <label className="field">
                  Pot size
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={potSize}
                    onChange={(event) => setPotSize(event.target.value)}
                  />
                </label>
                <label className="field">
                  Call size
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={callSize}
                    onChange={(event) => setCallSize(event.target.value)}
                  />
                </label>
                <label className="field">
                  Bet size
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={betSize}
                    onChange={(event) => setBetSize(event.target.value)}
                  />
                </label>
                <label className="field">
                  Raise size
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={raiseSize}
                    onChange={(event) => setRaiseSize(event.target.value)}
                  />
                </label>
                <label className="field">
                  Equity (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={equity}
                    onChange={(event) => setEquity(event.target.value)}
                  />
                </label>
                <label className="field">
                  Fold equity (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={foldEquity}
                    onChange={(event) => setFoldEquity(event.target.value)}
                  />
                </label>
                <div className="tracker-actions">
                  <p className="tracker-title">Record your move</p>
                  <div className="tracker-buttons">
                    <button
                      className="ghost-button"
                      onClick={() => recordMove("Call")}
                    >
                      Call
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => recordMove("Bet")}
                    >
                      Bet
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => recordMove("Raise")}
                    >
                      Raise
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => recordMove("Fold")}
                    >
                      Fold
                    </button>
                  </div>
                  <p className="tracker-summary">
                    Best EV picks: {trackerSummary.best}/{trackerSummary.total}
                  </p>
                  <div className="tracker-streaks">
                    <span>Current streak: {streak.current}</span>
                    <span>Best streak: {streak.best}</span>
                  </div>
                </div>
              </div>
              <div className="ev-results">
                <div className="ev-card">
                  <h3>Call EV</h3>
                  <p>{formatChips(evResults.call)}</p>
                  <span>Eq * (pot + call) - (1 - Eq) * call</span>
                </div>
                <div className="ev-card">
                  <h3>Bet EV</h3>
                  <p>{formatChips(evResults.bet)}</p>
                  <span>FE * pot + (1 - FE) * EV when called</span>
                </div>
                <div className="ev-card">
                  <h3>Raise EV</h3>
                  <p>{formatChips(evResults.raise)}</p>
                  <span>FE * pot + (1 - FE) * EV when called</span>
                </div>
                <div className="ev-note">
                  <h4>Maximizing EV</h4>
                  <p>
                    Increase fold equity with better blockers and board coverage.
                    Push value when your equity rises above the breakeven
                    threshold, and cut bluffs when villains under-fold.
                  </p>
                </div>
                <div className="tracker-log">
                  <div className="tracker-head">
                    <h4>Move Tracker</h4>
                    <span>Last 20 decisions</span>
                  </div>
                  <div className="tracker-list">
                    {moveHistory.length === 0 ? (
                      <p className="tracker-empty">No moves recorded yet.</p>
                    ) : (
                      moveHistory.map((entry) => (
                        <div key={entry.id} className="tracker-item">
                          <div>
                            <span className="tracker-move">{entry.move}</span>
                            <span className="tracker-time">{entry.timestamp}</span>
                          </div>
                          <div>
                            <span className="tracker-ev">
                              {formatChips(entry.ev)}
                            </span>
                            <span className="tracker-best">
                              Best: {entry.bestMove} {formatChips(entry.bestEv)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {activePage === "review" ? (
        <section className="section metrics-section">
          <div className="section-title">
            <div className="section-head">
              <h2>Performance Tracker</h2>
              <button
                className="ghost-button"
                onClick={() => togglePanel("metrics")}
              >
                {expandedPanels.metrics ? "Collapse" : "Expand"}
              </button>
            </div>
            <p>Toggle metrics to graph long-run improvement and winrate EV.</p>
          </div>
          <div className="metrics-advanced panel-card">
            <h3>Advanced Metrics</h3>
            <div className="metrics-snapshot">
              <div>
                <span className="scenario-label">Exploitability Δ</span>
                <p>
                  {metricsSnapshot.exploitability.length
                    ? `${metricsSnapshot.exploitability[0].avgLoss.toFixed(2)} bb`
                    : "0.00 bb"}
                </p>
                <span className="metric-caption">Highest EV loss node</span>
              </div>
              <div>
                <span className="scenario-label">Range Accuracy vs Frequency</span>
                <p>{Math.round(metricsSnapshot.rangeAccuracy * 100)}%</p>
                <span className="metric-caption">Aggression mix vs target</span>
              </div>
              <div>
                <span className="scenario-label">Confidence‑Adjusted EV</span>
                <p>{formatChips(metricsSnapshot.confidenceEv)}</p>
                <span className="metric-caption">Weighted by difficulty</span>
              </div>
              <div>
                <span className="scenario-label">Time‑to‑Decision</span>
                <p>{metricsSnapshot.timeStats.avg.toFixed(1)}s avg</p>
                <span className="metric-caption">
                  {metricsSnapshot.timeStats.slowCount} slow decisions
                </span>
              </div>
            </div>
            <div className="metrics-subgrid">
              <div>
                <h4>Exploitability Delta</h4>
                {metricsSnapshot.exploitability.length ? (
                  metricsSnapshot.exploitability.map((item) => (
                    <div key={item.node} className="metric-row">
                      <span>{item.node}</span>
                      <span>{item.avgLoss.toFixed(2)} bb</span>
                    </div>
                  ))
                ) : (
                  <p className="tracker-empty">No data yet.</p>
                )}
              </div>
              <div>
                <h4>EV Loss Heatmap</h4>
                {metricsSnapshot.evHeatmap.length ? (
                  metricsSnapshot.evHeatmap.map((item) => (
                    <div
                      key={`${item.street}-${item.band}`}
                      className="metric-row"
                    >
                      <span>
                        {item.street} · {item.band}
                      </span>
                      <span>{item.avgLoss.toFixed(2)} bb</span>
                    </div>
                  ))
                ) : (
                  <p className="tracker-empty">No data yet.</p>
                )}
              </div>
              <div>
                <h4>Action EV Efficiency</h4>
                {metricsSnapshot.sizingEfficiency.length ? (
                  metricsSnapshot.sizingEfficiency.map((item) => (
                    <div key={item.bucket} className="metric-row">
                      <span>{item.bucket}</span>
                      <span>{item.avgEv.toFixed(2)} bb</span>
                    </div>
                  ))
                ) : (
                  <p className="tracker-empty">No data yet.</p>
                )}
              </div>
            </div>
          </div>
          {expandedPanels.metrics ? (
            <div className="metrics-grid">
              <div className="metrics-panel">
                <h3>Tracked Metrics</h3>
                <div className="metrics-list">
                  {METRICS.map((metric) => (
                    <label key={metric.id} className="metric-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(metricSelection[metric.id])}
                        onChange={() => toggleMetric(metric.id)}
                      />
                      <span>
                        {metric.label}
                        <em>{metric.description}</em>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="metrics-chart">
                <div className="metrics-chart-head">
                  <h3>Trend Graph</h3>
                  <span>{moveHistory.length} decisions</span>
                </div>
                <div className="chart-canvas" role="img" aria-label="Metric trends">
                  {moveHistory.length === 0 ? (
                    <p className="tracker-empty">
                      Record moves to populate the graph.
                    </p>
                  ) : (
                    <svg viewBox="0 0 600 220" preserveAspectRatio="none">
                      {METRICS.filter((metric) => metricSelection[metric.id]).map(
                        (metric, index) => {
                          const values = metricSeries[metric.id];
                          if (!values || values.length < 2) return null;
                          const min = Math.min(...values);
                          const max = Math.max(...values);
                          const range = max - min || 1;
                          const points = values
                            .map((value, i) => {
                              const x = (i / (values.length - 1)) * 600;
                              const y = 200 - ((value - min) / range) * 180;
                              return `${x},${y}`;
                            })
                            .join(" ");
                          return (
                            <polyline
                              key={metric.id}
                              fill="none"
                              stroke={`var(--chart-${index + 1})`}
                              strokeWidth="2"
                              points={points}
                            />
                          );
                        }
                      )}
                    </svg>
                  )}
                </div>
                <div className="metrics-legend">
                  {METRICS.filter((metric) => metricSelection[metric.id]).map(
                    (metric, index) => (
                      <span key={metric.id} className="legend-item">
                        <span
                          className="legend-swatch"
                          style={{ background: `var(--chart-${index + 1})` }}
                        />
                        {metric.label}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}
      </main>

      <footer className="footer">
        <div>
          <span className="brand-mark">GTO</span>
          <span className="footer-title">Poker Trainer</span>
        </div>
        <p>Train harder. Print EV into muscle memory.</p>
        <button className="primary-button">Build My Study Plan</button>
      </footer>

      {showAuth ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <h3>Admin Sign In</h3>
              <button className="ghost-button" onClick={() => setShowAuth(false)}>
                Close
              </button>
            </div>
            <form className="modal-body" onSubmit={handleAuthSubmit}>
              <label className="field">
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="primary-button" type="submit">
                Sign In
              </button>
              <p className="modal-hint">
                Demo credentials: {DEFAULT_ADMIN.email} / {DEFAULT_ADMIN.password}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
