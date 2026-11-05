import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppStateProvider, useApp } from './state';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Graph from './pages/Graph';
import Team from './pages/Team';
import Setup from './pages/Setup';
import BehaviorAdd from './pages/BehaviorAdd';
import BehaviorList from './pages/BehaviorList';
import BehaviorEdit from './pages/BehaviorEdit';
import ABC from './pages/ABC';
import Observe from './pages/Observe';
import Sleep from './pages/Sleep';
import Backfill from './pages/Backfill';
import Reinforcers from './pages/Reinforcers';
import Places from './pages/Places';
import TeamSettings from './pages/TeamSettings';
import ABCSummary from './pages/ABCSummary';
import AI from './pages/AI';

const NO_NAV = ['/setup', '/behaviors/new', '/graph/abc', '/sleep', '/backfill', '/reinforcers', '/places', '/team/settings'];
const hideNav = (path: string) => NO_NAV.includes(path) || path.startsWith('/behaviors') || path.startsWith('/abc/') || path.startsWith('/observe/');

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
        <Route path="/behaviors" element={<BehaviorList />} />
        <Route path="/behaviors/new" element={<BehaviorAdd />} />
        <Route path="/behaviors/:behaviorId" element={<BehaviorEdit />} />
        <Route path="/abc/:eventId" element={<ABC />} />
        <Route path="/observe/:behaviorId" element={<Observe />} />
        <Route path="/sleep" element={<Sleep />} />
        <Route path="/backfill" element={<Backfill />} />
        <Route path="/reinforcers" element={<Reinforcers />} />
        <Route path="/places" element={<Places />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/graph/abc" element={<ABCSummary />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/settings" element={<TeamSettings />} />
        <Route path="/ai" element={<AI />} />
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
