import { Link, Outlet } from 'react-router-dom';

import Header from './ui/Header';

const Layout = () => (
  <div className="app-shell">
    <Header />
    <nav className="app-nav">
      <Link to="/" className="nav-link">
        Training Table
      </Link>
    </nav>
    <main className="app-content">
      <Outlet />
    </main>
  </div>
);

export default Layout;
