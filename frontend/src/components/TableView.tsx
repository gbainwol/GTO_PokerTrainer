import { useTrainerState } from '../state/TrainerStateProvider';

const TableView = () => {
  const { state } = useTrainerState();

  return (
    <section className="card table-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Current Scenario</p>
          <h2>{state.stage} Decision</h2>
        </div>
        <div className="hand-info">
          <span className="pill">Hero: {state.heroHand}</span>
          <span className="pill secondary">Pot: {state.pot.toFixed(1)} bb</span>
        </div>
      </div>
      <div className="table-grid">
        {state.seats.map((seat) => (
          <div
            key={seat.id}
            className={`seat ${seat.isHero ? 'hero' : ''} ${seat.focus ? 'focused' : ''}`}
          >
            <div className="seat-label">{seat.label}</div>
            <div className="seat-stack">{seat.stack.toFixed(1)} bb</div>
            {seat.action ? <div className="seat-action">{seat.action}</div> : null}
          </div>
        ))}
      </div>
      <div className="board-display">
        <div className="board-cards">
          {state.board.length > 0 ? state.board.map((card) => <span key={card}>{card}</span>) : <span>Board pending</span>}
        </div>
        <div className="board-meta">
          <span className="pill subtle">Last action: {state.lastDecision}</span>
        </div>
      </div>
    </section>
  );
};

export default TableView;
