import { NavLink } from 'react-router-dom';
import { useApp } from '../state';

const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" /></svg>
);
const GraphIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 20h18M4 16l5-6 4 3 7-8" /></svg>
);
const TeamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0112 0M14 20a4.5 4.5 0 017 0" /></svg>
);

const AiIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9z" /></svg>
);

/** Phase 1 のタブ: ホーム / グラフ / チーム（計画のタブは Phase 2、決定70）。AI「あり」のチームだけ AI のタブを出す（9章） */
export default function BottomNav() {
  const { aiEnabled } = useApp();
  return (
    <nav className="nav" aria-label="メイン" style={{ gridTemplateColumns: `repeat(${aiEnabled ? 4 : 3}, minmax(0, 1fr))` }}>
      <NavLink to="/" end><HomeIcon />ホーム</NavLink>
      <NavLink to="/graph"><GraphIcon />グラフ</NavLink>
      <NavLink to="/team"><TeamIcon />チーム</NavLink>
      {aiEnabled && <NavLink to="/ai"><AiIcon />AI</NavLink>}
    </nav>
  );
}
