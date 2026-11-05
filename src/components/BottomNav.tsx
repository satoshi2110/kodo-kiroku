import { NavLink } from 'react-router-dom';

const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" /></svg>
);
const GraphIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 20h18M4 16l5-6 4 3 7-8" /></svg>
);
const TeamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0112 0M14 20a4.5 4.5 0 017 0" /></svg>
);

/** Phase 1 のタブ: ホーム / グラフ / チーム（計画のタブは Phase 2、決定70） */
export default function BottomNav() {
  return (
    <nav className="nav" aria-label="メイン">
      <NavLink to="/" end><HomeIcon />ホーム</NavLink>
      <NavLink to="/graph"><GraphIcon />グラフ</NavLink>
      <NavLink to="/team"><TeamIcon />チーム</NavLink>
    </nav>
  );
}
