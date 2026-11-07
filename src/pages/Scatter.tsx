/**
 * 時間帯の図（スキャッタープロット、6.4.2、ワイヤーフレーム 20、Phase 2）。グラフ画面の「時間帯」から開く。
 * 横に日付（1週間）、縦に時刻（30分ごと）。起きた時間帯のマスに、強度（強度を記録しない行動は回数）を色と数字で出す。
 * 観察しなかった日（記録のない日・「観察していなかった」日）は灰色にする。
 */
import { useState } from 'react';
import { useApp } from '../state';
import { addDays, dateRange, formatShortDate, parseLocalDate, toLocalDate } from '../lib/date';
import { useRecordSet, zeroFrom } from '../lib/series';
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
  const from = b ? zeroFrom(b, events) : '';
  const observed = (d: string) => d >= from && rs.recordedDays.has(d) && !(b && rs.notObserved.has(`${b.id}|${d}`));
  const trend = trendSentence(cell, days);
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
              <p className="scatter__trend">{trend}</p>
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

const hm = (slot: number) => `${Math.floor(slot / 2)}:${slot % 2 ? '30' : '00'}`;

/**
 * この週の傾向の一文（ワイヤーフレーム 20）。
 * 【暫定】（2026-11-07 の試作）30分のマスを2つ続けた「1時間」のうち、回数がいちばん多いところを出す。
 * 合計が3回より少ないときと、いちばん多い1時間でも全体の3割に届かないときは、時間帯の偏りを言わない。
 * 理由（なぜその時間か）は書かない。きっかけは ABC記録で確かめる。
 */
function trendSentence(cell: Map<string, { n: number }>, days: string[]): string {
  const bySlot = new Map<number, number>();
  const daysBySlot = new Map<number, Set<string>>();
  let total = 0;
  for (const [k, c] of cell) {
    const [d, s] = k.split('|');
    if (!days.includes(d)) continue;
    const slot = Number(s);
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + c.n);
    if (!daysBySlot.has(slot)) daysBySlot.set(slot, new Set());
    daysBySlot.get(slot)!.add(d);
    total += c.n;
  }
  if (total === 0) return 'この週は、この行動の記録がありません。';
  if (total < 3) return `この週は ${total}回です。回数が少ないので、時間帯の傾向はまだ分かりません。`;
  let best = -1;
  let bestN = 0;
  for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
    const n = (bySlot.get(slot) ?? 0) + (bySlot.get(slot + 1) ?? 0);
    if (n > bestN) {
      best = slot;
      bestN = n;
    }
  }
  if (bestN / total < 0.3) return `この週は ${total}回です。決まった時間帯に偏ってはいません。`;
  const nDays = new Set([...(daysBySlot.get(best) ?? []), ...(daysBySlot.get(best + 1) ?? [])]).size;
  return `この週は ${hm(best)}〜${hm(best + 2)} に多く、${total}回のうち ${bestN}回（${nDays}日）です。`;
}
