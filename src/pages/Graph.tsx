/**
 * グラフ（6.4、ワイヤーフレーム 3）。行動ごとに、回数・時間・待ち時間と、強度を付けた行動は強度の平均を出す。
 * 自動0（決定19・21）: 回数と時間は、記録を付けた日（その対象者に何か記録がある日）に記録がなければ 0 として描く。
 * 保存はせず、表示のたびに計算する。在席・観察時間の記録ができたら「いた日」の判定をそれに置きかえる。
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { dateRange, formatDuration, toLocalDate } from '../lib/date';
import { METHOD_LABEL, type Behavior, type Event, type Observation } from '../db/types';
import { observedRatio } from '../db/repo';
import { KindBadge, TopBar } from '../components/ui';
import LineChart, { type Series } from '../components/LineChart';

export default function Graph() {
  const { person, behaviors } = useApp();
  const personId = person?.id ?? '';
  const events = useLiveQuery(
    async () => (personId ? (await db.events.where('personId').equals(personId).toArray()).filter((e) => !e.deletedAt) : []),
    [personId],
  );
  const observations = useLiveQuery(
    async () => (personId ? (await db.observations.where('personId').equals(personId).toArray()).filter((o) => !o.deletedAt && o.results.length > 0) : []),
    [personId],
  );

  const today = toLocalDate();
  const { dates, recordedDays } = useMemo(() => {
    const days = [...(events ?? []), ...(observations ?? [])].map((x) => x.localDate);
    const first = days.reduce((m, d) => (d < m ? d : m), today);
    return { dates: dateRange(first, today), recordedDays: new Set(days) };
  }, [events, observations, today]);
  const empty = (events ?? []).length === 0 && (observations ?? []).length === 0;

  if (!person) return null;

  return (
    <div className="page">
      <TopBar title="グラフ" sub={person.displayName} right={<Link to="/graph/abc" className="btn btn--sm">ABC集計</Link>} />
      {empty && <p className="empty">記録がたまると、ここにグラフが出ます。</p>}
      {!empty &&
        behaviors.map((b) => (
          <BehaviorPanels
            key={b.id}
            b={b}
            events={(events ?? []).filter((e) => e.behaviorId === b.id)}
            observations={(observations ?? []).filter((o) => o.behaviorId === b.id)}
            dates={dates}
            recordedDays={recordedDays}
          />
        ))}
    </div>
  );
}

function BehaviorPanels({
  b,
  events,
  observations,
  dates,
  recordedDays,
}: {
  b: Behavior;
  events: Event[];
  observations: Observation[];
  dates: string[];
  recordedDays: Set<string>;
}) {
  const byDate = new Map<string, Event[]>();
  for (const e of events) byDate.set(e.localDate, [...(byDate.get(e.localDate) ?? []), e]);
  const color = b.kind === 'problem' ? 'var(--problem)' : 'var(--primary)';

  const perDay = (fn: (list: Event[]) => number | null, autoZero: boolean): Series => ({
    dates,
    values: dates.map((d) => {
      const list = byDate.get(d);
      if (list?.length) return fn(list);
      return autoZero && recordedDays.has(d) ? 0 : null;
    }),
  });
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null);

  let main: { series: Series; unit: string; format?: (v: number) => string } | null = null;
  if (b.method === 'frequency') main = { series: perDay((l) => l.reduce((s, e) => s + e.count, 0), true), unit: '回数（回）' };
  if (b.method === 'duration')
    main = {
      series: perDay((l) => Math.round((l.reduce((s, e) => s + (e.durationSec ?? 0), 0) / 60) * 10) / 10, true),
      unit: '時間（分）',
    };
  if (b.method === 'latency')
    main = { series: perDay((l) => avg(l.flatMap((e) => (e.latencySec != null ? [e.latencySec] : []))), false), unit: '待ち時間（秒・平均）', format: (v) => formatDuration(Math.round(v)) };

  // インターバル・時間サンプリング: 観察した区間のうち起きた区間の割合。自動0は付けない（決定31）
  if (b.method === 'interval' || b.method === 'sampling')
    main = {
      series: { dates, values: dates.map((d) => observedRatio(observations.filter((o) => o.localDate === d))) },
      unit: '起きた区間の割合（%）',
    };

  const intensity = b.intensity
    ? { series: perDay((l) => avg(l.flatMap((e) => (e.intensity != null ? [e.intensity] : []))), false), max: b.intensity.levels }
    : null;

  return (
    <div className="section">
      <div className="card stack">
        <div className="row">
          <KindBadge kind={b.kind} />
          <strong>{b.name}</strong>
          <span className="muted">{METHOD_LABEL[b.method]}</span>
        </div>
        {main && (
          <LineChart
            series={main.series}
            unit={main.unit}
            color={color}
            format={main.format}
            fixedMax={b.method === 'interval' || b.method === 'sampling' ? 100 : undefined}
          />
        )}
        {intensity && (
          <>
            <span className="label">強度（1日の平均。未評価は除く）</span>
            <LineChart series={intensity.series} unit={`強度（1〜${intensity.max}）`} color={color} fixedMax={intensity.max} />
          </>
        )}
      </div>
    </div>
  );
}
