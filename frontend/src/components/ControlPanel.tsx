import { useTrainerState } from '../state/TrainerStateProvider';

const ControlPanel = () => {
  const { dispatch } = useTrainerState();

  const handleAction = (action: string) => {
    dispatch({ type: 'recordAction', payload: action });
  };

  return (
    <section className="card control-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Decision Controls</p>
          <h2>Choose Your Line</h2>
        </div>
        <div className="pill-group">
          <button type="button" className="pill subtle" onClick={() => dispatch({ type: 'nextHand' })}>
            Next hand
          </button>
          <button type="button" className="pill" onClick={() => dispatch({ type: 'setStage', payload: 'Turn' })}>
            Advance street
          </button>
        </div>
      </div>
      <div className="control-grid">
        <button type="button" className="action-btn" onClick={() => handleAction('Check / Call')}>
          Check / Call
        </button>
        <button type="button" className="action-btn accent" onClick={() => handleAction('Bet 50%')}>
          Bet 50%
        </button>
        <button type="button" className="action-btn" onClick={() => handleAction('Overbet 125%')}>
          Overbet 125%
        </button>
        <button type="button" className="action-btn muted" onClick={() => handleAction('Fold')}>{'Fold'}</button>
      </div>
      <div className="control-meta">
        <p className="eyebrow">Notes</p>
        <p className="supporting-text">
          This panel mirrors the trainer controls: sequencing actions, shifting between streets, and quickly restarting
          the scenario for rapid iteration.
        </p>
      </div>
    </section>
  );
};

export default ControlPanel;
