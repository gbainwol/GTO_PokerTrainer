import { PropsWithChildren, createContext, useContext, useMemo, useReducer } from 'react';

type TableSeat = {
  id: number;
  label: string;
  stack: number;
  isHero?: boolean;
  action?: string;
  focus?: boolean;
};

type TrainingStats = {
  handsPlayed: number;
  ev: number;
  winRate: number;
  folds: number;
};

type TrainerState = {
  stage: 'Preflop' | 'Flop' | 'Turn' | 'River';
  pot: number;
  heroHand: string;
  board: string[];
  seats: TableSeat[];
  stats: TrainingStats;
  lastDecision: string;
};

type TrainerAction =
  | { type: 'setStage'; payload: TrainerState['stage'] }
  | { type: 'recordAction'; payload: string }
  | { type: 'setFocus'; payload: number }
  | { type: 'nextHand' };

const initialState: TrainerState = {
  stage: 'Flop',
  pot: 13.5,
  heroHand: 'AsKd',
  board: ['Ah', 'Ts', '4c'],
  seats: [
    { id: 1, label: 'UTG', stack: 94.5 },
    { id: 2, label: 'HJ', stack: 112 },
    { id: 3, label: 'CO', stack: 102 },
    { id: 4, label: 'BTN', stack: 88, action: 'Bet 6.5' },
    { id: 5, label: 'SB', stack: 120 },
    { id: 6, label: 'BB', stack: 110, isHero: true, focus: true },
  ],
  stats: {
    handsPlayed: 42,
    ev: 3.2,
    winRate: 58,
    folds: 19,
  },
  lastDecision: 'Awaiting hero action',
};

const TrainerStateContext = createContext<
  | {
      state: TrainerState;
      dispatch: React.Dispatch<TrainerAction>;
    }
  | undefined
>(undefined);

const trainerReducer = (state: TrainerState, action: TrainerAction): TrainerState => {
  switch (action.type) {
    case 'setStage':
      return { ...state, stage: action.payload };
    case 'recordAction':
      return {
        ...state,
        lastDecision: action.payload,
        pot: action.payload.includes('Bet') ? state.pot + 6.5 : state.pot,
      };
    case 'setFocus':
      return {
        ...state,
        seats: state.seats.map((seat) => ({
          ...seat,
          focus: seat.id === action.payload,
        })),
      };
    case 'nextHand':
      return {
        ...state,
        stage: 'Preflop',
        pot: 1.5,
        board: [],
        heroHand: 'JhTd',
        seats: state.seats.map((seat) => ({ ...seat, action: undefined, focus: seat.isHero })),
        stats: {
          ...state.stats,
          handsPlayed: state.stats.handsPlayed + 1,
        },
        lastDecision: 'New hand started',
      };
    default:
      return state;
  }
};

export const TrainerStateProvider = ({ children }: PropsWithChildren) => {
  const [state, dispatch] = useReducer(trainerReducer, initialState);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <TrainerStateContext.Provider value={value}>{children}</TrainerStateContext.Provider>;
};

export const useTrainerState = () => {
  const context = useContext(TrainerStateContext);

  if (!context) {
    throw new Error('useTrainerState must be used within a TrainerStateProvider');
  }

  return context;
};
