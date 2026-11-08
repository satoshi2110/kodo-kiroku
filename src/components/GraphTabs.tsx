import { NavLink } from 'react-router-dom';

/** グラフ画面の切りかえ: 折れ線 / 時間帯 / ABC分析（ワイヤーフレーム 3） */
export default function GraphTabs() {
  return (
    <nav className="tabs" aria-label="グラフの種類">
      <NavLink to="/graph" end>折れ線</NavLink>
      <NavLink to="/graph/scatter">時間帯</NavLink>
      <NavLink to="/graph/abc">ABC分析</NavLink>
    </nav>
  );
}
