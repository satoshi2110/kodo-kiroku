/**
 * できたこと（6.4.4、決定51、ワイヤーフレーム 21、Phase 2）。これまでの小さな成果を、日付と場所つきで見返す。
 * 文は記録の集計から決まった形で作る（AI は使わない）。ホームの「できたこと」と支援会議メモから開く。
 */
import { useState } from 'react';
import { useApp } from '../state';
import { formatDateJa, toLocalDate } from '../lib/date';
import { useRecordSet } from '../lib/series';
import { computeWins } from '../lib/wins';
import { usePlanData } from '../lib/usePlan';
import { Chip, TopBar } from '../components/ui';

export default function Wins() {
  const { person, behaviors } = useApp();
  const rs = useRecordSet(person?.id);
  const planData = usePlanData(person?.id);
  const [place, setPlace] = useState<string | null>(null);
  if (!person || !rs || planData === undefined) return null;
  const wins = computeWins(behaviors, rs, planData.plan?.activeContent ?? null, toLocalDate());
  const places = [...new Set(wins.map((w) => w.place).filter((p): p is string => !!p))];
  const shown = wins.filter((w) => !place || w.place === place);
  const months = [...new Set(shown.map((w) => w.date.slice(0, 7)))];

  return (
    <div className="page page--no-nav wins-page">
      <TopBar title="できたこと" sub="これまでの小さな成果を見返す" back="/" />
      {places.length > 0 && (
        <div className="section chips">
          <Chip on={!place} onClick={() => setPlace(null)}>すべて</Chip>
          {places.map((p) => <Chip key={p} on={place === p} onClick={() => setPlace(p)}>{p}</Chip>)}
        </div>
      )}
      {shown.length === 0 && <p className="empty">記録がたまると、ここに小さな成果が出ます。</p>}
      {months.map((m) => (
        <div key={m} className="section">
          <div className="card stack">
            <h2 className="card__title">{Number(m.slice(5))}月</h2>
            {shown.filter((w) => w.date.startsWith(m)).map((w, i) => (
              <div key={i} className="today-row stack win-item" style={{ gap: 2 }}>
                <span className="win-text">{w.text}</span>
                <span className="muted">{formatDateJa(w.date)}{w.place ? ` ・ ${w.place}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="section help">文は記録の集計から決まった形で作ります（AI は使いません）。支援会議メモからも開けます。</p>
    </div>
  );
}
