/**
 * 時間帯の図（スキャッタープロット、6.4.2、ワイヤーフレーム 20、Phase 2）。グラフ画面の「時間帯」から開く。
 * 横に日付（1週間）、縦に時刻（30分ごと）。起きた時間帯のマスに、強度（強度を記録しない行動は回数）を色と数字で出す。
 * 観察しなかった日（記録のない日・「観察していなかった」日）は灰色にする。
 */
import { useState } from 'react';
import { useApp } from '../state';
import { addDays, dateRange, formatShortDate, parseLocalDate, toLocalDate } from '../lib/date';
import { useRecordSet } from '../lib/series';
import { TopBar } from '../components/ui';
import GraphTabs from '../components/GraphTabs';

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export default function Scatter() {
  const { person, behaviors } = useApp();
  const rs = useRecordSet(person?.id);
  const choices = behaviors.filter((b) => b.method !== 'interval' && b.method !== 'sampling');
  const [behaviorId, setBehaviorId] = useState<string | null>(null);
  const [end, setEnd] = useState(toLocalDate());
  if (!person || !rs) return null;
  const b = choices.find((x) => x.id === behaviorId) ?? choices[0];
  const days = dateRange(addDays(end, -6), end);
  const today = toLocalDate();

  const events = b ? rs.events.filter((e) => e.behaviorId === b.id) : [];
  const slotOf = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
  };
  // 表示する時刻の範囲: この行動の記録がある時間帯（なければ 8時〜18時）
  const slots = events.map((e) => slotOf(e.occurredAt));
  const first = Math.min(16, ...slots);
  const last = Math.max(35, ...slots);
  const rows = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const cell = new Map<string, { n: number; max: number | null }>();
  for (const e of events) {
    if (!days.includes(e.localDate)) continue;
    const k = `${e.localDate}|${slotOf(e.occurredAt)}`;
    const c = cell.get(k) ?? { n: 0, max: null };
    c.n += e.count;
    if (e.intensity != null) c.max = Math.max(c.max ?? 0, e.intensity);
    cell.set(k, c);
  }
  const observed = (d: string) => rs.recordedDays.has(d) && !(b && rs.notObserved.has(`${b.id}|${d}`));
  const levels = b?.intensity?.levels ?? 3;

  return (
    <div className="page">
      <TopBar title="時間帯の図" sub={b ? `${b.name} ・ 30分ごと` : person.displayName} />
      <GraphTabs />
      {!b ? (
        <p className="empty">回数・時間で記録する行動を登録すると、ここに時間帯の図が出ます。</p>
      ) : (
        <>
          <div className="section stack">
            <label className="field">
              行動
              <select value={b.id} onChange={(e) => setBehaviorId(e.target.value)}>
                {choices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <div className="row row--between">
              <button type="button" className="btn btn--sm" onClick={() => setEnd(addDays(end, -7))}>‹ 前の週</button>
              <span className="label">{formatShortDate(days[0])}〜{formatShortDate(days[6])}</span>
              <button type="button" className="btn btn--sm" disabled={end >= today} onClick={() => setEnd(addDays(end, 7) > today ? today : addDays(end, 7))}>次の週 ›</button>
            </div>
          </div>
          <div className="section">
            <div className="card">
              <div className="scatter" role="table" aria-label={`${b.name}の時間帯の図`}>
                <div className="scatter__row" role="row">
                  <span className="scatter__time" role="columnheader" />
                  {days.map((d) => {
                    const dt = parseLocalDate(d);
                    return (
                      <span key={d} className={`scatter__day${dt.getDay() === 0 ? ' scatter__day--sun' : ''}`} role="columnheader">
                        {formatShortDate(d)}
                        <br />
                        {WEEKDAY[dt.getDay()]}
                      </span>
                    );
                  })}
                </div>
                {rows.map((slot) => (
                  <div key={slot} className="scatter__row" role="row">
                    <span className="scatter__time" role="rowheader">{slot % 2 === 0 ? `${slot / 2}:00` : ''}</span>
                    {days.map((d) => {
                      const c = cell.get(`${d}|${slot}`);
                      if (!observed(d)) return <span key={d} className="scatter__cell scatter__cell--none" role="cell" aria-label="観察なし" />;
                      if (!c) return <span key={d} className="scatter__cell" role="cell" aria-label="なし" />;
                      const v = c.max ?? c.n;
                      const lv = c.max != null ? Math.min(3, Math.ceil((c.max / levels) * 3)) : 2;
                      return (
                        <span key={d} className={`scatter__cell scatter__cell--l${lv}`} role="cell" aria-label={c.max != null ? `強度${c.max}` : `${c.n}回`}>
                          {v}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="scatter__legend">
                <span><i className="scatter__cell" />なし</span>
                {b.intensity ? (
                  [1, 2, 3].map((l) => <span key={l}><i className={`scatter__cell scatter__cell--l${l}`} />{levels === 3 ? `強度${l}` : l === 1 ? '軽い' : l === 2 ? '中' : '重い'}</span>)
                ) : (
                  <span><i className="scatter__cell scatter__cell--l2" />起きた</span>
                )}
                <span><i className="scatter__cell scatter__cell--none" />観察なし</span>
              </div>
              <p className="help">
                {b.intensity ? '数字はその30分でいちばん強かった強度です（未評価のときは回数）。' : '数字はその30分の回数です。'}
                ABC記録と合わせて見ると、きっかけを絞り込めます。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
