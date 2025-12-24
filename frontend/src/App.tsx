import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import TrainingDashboard from './pages/TrainingDashboard';

const App = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route index element={<TrainingDashboard />} />
    </Route>
  </Routes>
);

export default App;
