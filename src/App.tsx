import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppStateProvider, useApp } from './state';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Graph from './pages/Graph';
import Team from './pages/Team';
import Setup from './pages/Setup';
import BehaviorAdd from './pages/BehaviorAdd';
import ABC from './pages/ABC';

const NO_NAV = ['/setup', '/behaviors/new'];
const hideNav = (path: string) => NO_NAV.includes(path) || path.startsWith('/abc/');

function Shell() {
  const { loading, userId, person } = useApp();
  const loc = useLocation();
  if (loading) return <div className="empty">読み込み中…</div>;
  if ((!userId || !person) && loc.pathname !== '/setup') return <Navigate to="/setup" replace />;
  return (
    <div className="app">
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/" element={<Home />} />
        <Route path="/behaviors/new" element={<BehaviorAdd />} />
        <Route path="/abc/:eventId" element={<ABC />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/team" element={<Team />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav(loc.pathname) && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
