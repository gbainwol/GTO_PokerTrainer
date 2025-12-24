import { useTrainerState } from '../state/TrainerStateProvider';

const StatsPanel = () => {
  const { state } = useTrainerState();

  const statBlocks = [
    { label: 'Hands', value: state.stats.handsPlayed },
    { label: 'EV Delta', value: `${state.stats.ev.toFixed(1)} bb` },
    { label: 'Win Rate', value: `${state.stats.winRate}%` },
    { label: 'Folds', value: state.stats.folds },
  ];

  return (
    <section className="card stats-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Session Metrics</p>
          <h2>Quick Stats</h2>
        </div>
        <span className="pill subtle">Auto-updates</span>
      </div>
      <div className="stats-grid">
        {statBlocks.map((stat) => (
          <div key={stat.label} className="stat-block">
            <p className="eyebrow">{stat.label}</p>
            <p className="stat-value">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="note">
        Use this area to visualize training progress, show solver deltas, or highlight exploitability targets.
      </div>
    </section>
  );
};

export default StatsPanel;
