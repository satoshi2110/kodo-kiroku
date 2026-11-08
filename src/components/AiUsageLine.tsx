/** AI の残り回数（決定60・63）。使いすぎないよう、AI のボタンの近くに出す */
type Usage = { dayLeft: number; monthLeft: number; limit: { day: number; month: number } };

export function AiUsageLine({ mine, team }: { mine?: Usage | null; team?: Usage | null }) {
  if (!mine && !team) return null;
  const row = (label: string, u: Usage) => (
    <span className={`muted${u.dayLeft === 0 || u.monthLeft === 0 ? ' ai-usage__out' : ''}`}>
      {label}: <span className="nowrap">今日 {u.dayLeft}/{u.limit.day}回</span> ・ <span className="nowrap">今月 {u.monthLeft}/{u.limit.month}回</span>
    </span>
  );
  return (
    <div className="stack ai-usage" style={{ gap: 2 }}>
      {mine && row('あなたの残り', mine)}
      {team && row('チームの残り', team)}
    </div>
  );
}
