import ControlPanel from '../components/ControlPanel';
import StatsPanel from '../components/StatsPanel';
import TableView from '../components/TableView';

const TrainingDashboard = () => (
  <div className="dashboard-grid">
    <div className="primary-column">
      <TableView />
    </div>
    <div className="secondary-column">
      <ControlPanel />
      <StatsPanel />
    </div>
  </div>
);

export default TrainingDashboard;
