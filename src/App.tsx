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
import Scatter from './pages/Scatter';
import PersonProfile from './pages/PersonProfile';
import Wins from './pages/Wins';
import Plan from './pages/Plan';
import PlanEdit from './pages/PlanEdit';
import PlanHistory from './pages/PlanHistory';
import PlanSignoff from './pages/PlanSignoff';
import Restraint from './pages/Restraint';
import Meetings from './pages/Meetings';
import Report from './pages/Report';
import MeetingEdit from './pages/MeetingEdit';
import RestraintEdit from './pages/RestraintEdit';
import MySettings from './pages/MySettings';
import AuditLog from './pages/AuditLog';
import Login from './pages/Login';
import NewPassword from './pages/NewPassword';
import { serverEnabled } from './server/supabase';
import { useSession } from './server/session';
import { DeviceGuard } from './components/DeviceGuard';
import { MfaCode } from './components/Mfa';

const NO_NAV = ['/setup', '/behaviors/new', '/sleep', '/backfill', '/reinforcers', '/places', '/team/settings', '/team/audit', '/me', '/person', '/wins', '/plan/edit', '/plan/history', '/plan/signoff'];
const hideNav = (path: string) => NO_NAV.includes(path) || path.startsWith('/restraint') || path.startsWith('/meetings') || path === '/report' || path.startsWith('/behaviors') || path.startsWith('/abc/') || path.startsWith('/observe/');

function Shell() {
  const { loading, userId, person } = useApp();
  const { ready, session, recovery, mfaCode } = useSession();
  const loc = useLocation();
  if (loading || !ready) return <div className="empty">読み込み中…</div>;
  // サーバーにつながる設定があるときは、ログインしてから使う（7.4.3）
  if (serverEnabled && !session) return <Login />;
  if (serverEnabled && recovery) return <NewPassword />;
  if (serverEnabled && mfaCode) return <MfaCode />;
  if ((!userId || !person) && loc.pathname !== '/setup') return <Navigate to="/setup" replace />;
  const body = (
    <>
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
        <Route path="/graph/scatter" element={<Scatter />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/settings" element={<TeamSettings />} />
        <Route path="/team/audit" element={<AuditLog />} />
        <Route path="/me" element={<MySettings />} />
        <Route path="/person" element={<PersonProfile />} />
        <Route path="/wins" element={<Wins />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/plan/edit" element={<PlanEdit />} />
        <Route path="/plan/history" element={<PlanHistory />} />
        <Route path="/plan/signoff" element={<PlanSignoff />} />
        <Route path="/restraint" element={<Restraint />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/report" element={<Report />} />
        <Route path="/meetings/:id" element={<MeetingEdit />} />
        <Route path="/restraint/:id" element={<RestraintEdit />} />
        <Route path="/ai" element={<AI />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNav(loc.pathname) && <BottomNav />}
    </>
  );
  // ログインして使うときは、共用の端末のロックと「90日使わなければ再ログイン」をかける（7.4.2 #1・#4）
  if (serverEnabled && session) return <DeviceGuard userId={session.user.id} email={session.user.email ?? ''}>{body}</DeviceGuard>;
  return <div className="app">{body}</div>;
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
