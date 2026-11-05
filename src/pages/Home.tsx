/**
 * ホーム（6.3.1、ワイヤーフレーム 1・14）。
 * 1タップで +1、右上の「−1」（タイマー型は「取消」）で押し間違いを取り消す。
 * 振動は対応端末だけの上乗せで、色と表示で必ず知らせる（5章）。強度を付けた行動は直後に強度シートを出す。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditBehaviors, canRecord, createEvent, observedRatio, undoLastEvent, updateEvent } from '../db/repo';
import { useApp } from '../state';
import { formatDuration, formatTime, toLocalDate } from '../lib/date';
import { INTENSITY_NAMES, METHOD_LABEL, type Behavior, type Event, type Observation } from '../db/types';
import { KindBadge, Sheet, TopBar } from '../components/ui';

type Timer = { behaviorId: string; startedAt: number };

export default function Home() {
  const { person, behaviors, me, userId } = useApp();
  const today = toLocalDate();
  const personId = person?.id ?? '';
  const now = useNow(30_000);

  const todayEvents = useLiveQuery(
    async () => (personId ? (await db.events.where('[personId+localDate]').equals([personId, today]).toArray()).filter((e) => !e.deletedAt) : []),
    [personId, today],
  );
  const nav = useNavigate();
  const [toast, setToast] = useState<{ text: string; abcEventId?: string } | null>(null);
  const toastTimer = useRef<number>();
  const [flash, setFlash] = useState<{ id: string; good: boolean } | null>(null);
  const [intensityFor, setIntensityFor] = useState<{ event: Event; behavior: Behavior } | null>(null);
  const [timers, setTimers] = useState<Record<string, Timer>>({});
  useNow(Object.keys(timers).length ? 1000 : null);

  const abcIds = new Set(
    useLiveQuery(
      async () => (personId ? (await db.abcDetails.where('personId').equals(personId).filter((d) => !d.deletedAt).toArray()).map((d) => d.eventId) : []),
      [personId],
    ) ?? [],
  );
  const todayObs =
    useLiveQuery(
      async () => (personId ? (await db.observations.where('[personId+localDate]').equals([personId, today]).toArray()).filter((o) => !o.deletedAt) : []),
      [personId, today],
    ) ?? [];
  const events = useMemo(() => [...(todayEvents ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [todayEvents]);
  const rows = useMemo(() => pairRows(behaviors), [behaviors]);
  if (!person || !userId) return null;
  const recordable = canRecord(me?.role);

  function notify(text: string, abcEventId?: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ text, abcEventId });
    toastTimer.current = window.setTimeout(() => setToast(null), abcEventId ? 5000 : 3000);
  }

  function feedback(b: Behavior) {
    const good = b.kind !== 'problem';
    setFlash({ id: b.id, good });
    window.setTimeout(() => setFlash(null), 500);
    // 問題行動は強め、代替行動・望ましい行動は「成功」の短い振動（対応端末のみ。iPhone の PWA は振動しない）
    navigator.vibrate?.(good ? [15, 60, 15] : [60]);
  }

  async function record(b: Behavior, extra: Partial<Pick<Event, 'durationSec' | 'latencySec'>> = {}) {
    if (!person || !userId) return;
    const e = await createEvent({ personId: person.id, behaviorId: b.id, ...extra }, userId);
    feedback(b);
    notify(
      b.method === 'duration' ? `「${b.name}」${formatDuration(extra.durationSec ?? 0)} を記録しました`
      : b.method === 'latency' ? `「${b.name}」待ち時間 ${formatDuration(extra.latencySec ?? 0)} を記録しました`
      : `「${b.name}」+1 を記録しました`,
      e.id,
    );
    if (b.intensity) setIntensityFor({ event: e, behavior: b });
  }

  async function tap(b: Behavior) {
    if (!recordable) return;
    if (b.method === 'frequency') return record(b);
    if (b.method === 'interval' || b.method === 'sampling') return nav(`/observe/${b.id}`);
    if (b.method === 'duration' || b.method === 'latency') {
      const t = timers[b.id];
      if (!t) {
        setTimers({ ...timers, [b.id]: { behaviorId: b.id, startedAt: Date.now() } });
        notify(b.method === 'duration' ? `「${b.name}」の計測を始めました` : `「${b.name}」指示を出した時刻を記録しました`);
        return;
      }
      const sec = Math.max(1, Math.round((Date.now() - t.startedAt) / 1000));
      const rest = { ...timers };
      delete rest[b.id];
      setTimers(rest);
      return record(b, b.method === 'duration' ? { durationSec: sec } : { latencySec: sec });
    }
  }

  async function undo(b: Behavior) {
    if (!person || !userId) return;
    if (timers[b.id]) {
      const rest = { ...timers };
      delete rest[b.id];
      setTimers(rest);
      return notify(`「${b.name}」の計測を取り消しました`);
    }
    const last = await undoLastEvent(person.id, b.id, today, userId);
    if (intensityFor?.event.id === last?.id) setIntensityFor(null);
    notify(last ? `「${b.name}」の記録を1件取り消しました` : '取り消せる今日の記録がありません');
  }

  async function setIntensity(level: number | null) {
    if (!intensityFor || !userId) return;
    if (level != null) await updateEvent(intensityFor.event.id, { intensity: level }, userId);
    notify(level != null ? `強度 ${level} を記録しました` : '強度は未評価のままにしました', intensityFor.event.id);
    setIntensityFor(null);
  }

  const byBehavior = (id: string) => events.filter((e) => e.behaviorId === id);
  const nameOf = (id: string) => behaviors.find((b) => b.id === id)?.name ?? '（非表示の行動）';

  return (
    <div className="page">
      <TopBar
        title={person.displayName}
        sub={<>{formatTime(new Date(now).toISOString())} ・ 場所: 未設定</>}
        right={canEditBehaviors(me?.role) ? <Link to="/behaviors/new" className="btn btn--sm">＋ 行動</Link> : undefined}
      />

      {person.isSample && <p className="section sample-note">これは架空の「サンプル」です。自由に押して試せます。</p>}
      {!recordable && <p className="section help">閲覧者は記録を見るだけです。</p>}

      <div className="section stack">
        {rows.map((row) => (
          <div key={row.map((b) => b.id).join()} className="grid-2">
            {row.map((b) => (
              <BehaviorCard
                key={b.id}
                b={b}
                events={byBehavior(b.id)}
                observations={todayObs.filter((o) => o.behaviorId === b.id)}
                timer={timers[b.id]}
                flash={flash?.id === b.id ? (flash.good ? 'good' : 'problem') : null}
                disabled={!recordable}
                onTap={() => tap(b)}
                onUndo={() => undo(b)}
              />
            ))}
          </div>
        ))}
        {behaviors.length === 0 && <p className="empty">まだ行動がありません。</p>}
      </div>

      <div className="section">
        <div className="card">
          <h2 className="card__title">今日の記録（{events.length}件）</h2>
          {events.length === 0 && <p className="muted">まだ記録はありません。</p>}
          {events.length > 0 && <p className="help">記録を押すと、ABC（前後のようす）を詳しく書けます。</p>}
          {events.slice(0, 20).map((e) => (
            <Link key={e.id} to={`/abc/${e.id}`} className="row row--between today-row today-row--link">
              <span className="muted">{formatTime(e.occurredAt)}</span>
              <span style={{ flex: 1 }}>{nameOf(e.behaviorId)}</span>
              <span className="muted">
                {e.durationSec != null ? formatDuration(e.durationSec) : e.latencySec != null ? `待ち ${formatDuration(e.latencySec)}` : `+${e.count}`}
                {e.intensity != null && ` ・ 強度${e.intensity}`}
                {abcIds.has(e.id) ? ' ・ ABC' : ''}
              </span>
              <span className="today-row__go" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.abcEventId && !intensityFor && (
            <button type="button" className="btn btn--sm" onClick={() => nav(`/abc/${toast.abcEventId}`)}>詳しく書く</button>
          )}
        </div>
      )}

      {intensityFor?.behavior.intensity && (
        <Sheet title={`「${intensityFor.behavior.name}」の強度`} onClose={() => setIntensity(null)}>
          <p className="help">いちばん近いものを選んでください。あとで選ぶと「未評価」のまま残ります。</p>
          {INTENSITY_NAMES[intensityFor.behavior.intensity.levels].map((label, i) => (
            <button key={i} type="button" className="btn btn--block intensity-option" onClick={() => setIntensity(i + 1)}>
              <strong>強度 {i + 1}</strong>
              <span>{intensityFor.behavior.intensity!.criteria[i] || `${label}（基準未設定）`}</span>
            </button>
          ))}
          <button type="button" className="btn btn--block" onClick={() => setIntensity(null)}>あとで</button>
        </Sheet>
      )}
    </div>
  );
}

function BehaviorCard({
  b,
  events,
  observations,
  timer,
  flash,
  disabled,
  onTap,
  onUndo,
}: {
  b: Behavior;
  events: Event[];
  observations: Observation[];
  timer?: Timer;
  flash: 'good' | 'problem' | null;
  disabled: boolean;
  onTap: () => void;
  onUndo: () => void;
}) {
  const total = events.reduce((s, e) => s + e.count, 0);
  const totalSec = events.reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const lastLatency = events.find((e) => e.latencySec != null)?.latencySec;
  const timerType = b.method === 'duration' || b.method === 'latency';
  const sessionType = b.method === 'interval' || b.method === 'sampling';
  const running = timer ? Math.round((Date.now() - timer.startedAt) / 1000) : 0;

  let action: string;
  if (b.method === 'frequency') action = 'タップで +1';
  else if (b.method === 'duration') action = timer ? `終了（${formatDuration(running)}）` : '開始';
  else if (b.method === 'latency') action = timer ? `始まった（${formatDuration(running)}）` : '指示を出した';
  else action = '観察を始める';
  const ratio = observedRatio(observations);

  return (
    <div className={`bcard bcard--${b.kind === 'problem' ? 'problem' : 'good'}${flash ? ` bcard--flash-${flash}` : ''}`}>
      <button type="button" className="bcard__tap" disabled={disabled} onClick={onTap} aria-label={`${b.name}: ${action}`}>
        <KindBadge kind={b.kind} />
        <span className="bcard__name">{b.name}</span>
        <span className="bcard__count">
          {b.method === 'frequency' && <>今日 <strong>{total}</strong> 回</>}
          {b.method === 'duration' && <>今日 <strong>{formatDuration(totalSec)}</strong></>}
          {b.method === 'latency' && <>{lastLatency != null ? <>最後 <strong>{formatDuration(lastLatency)}</strong></> : '今日はまだ'}</>}
          {sessionType && (ratio != null ? <>今日 <strong>{ratio}</strong> %</> : METHOD_LABEL[b.method])}
        </span>
        <span className={`bcard__action${timer ? ' bcard__action--running' : ''}`}>{action}</span>
      </button>
      {!disabled && !sessionType && (
        <button type="button" className="undo-badge" onClick={onUndo} aria-label={`${b.name} の${timerType ? '直前の計測' : '最後の記録'}を取り消す`}>
          <span>{timerType ? '取消' : '−1'}</span>
        </button>
      )}
    </div>
  );
}

/** 代替行動を、対応する問題行動の右隣に並べる（決定29）。2列に収まらない分は次の行へ */
function pairRows(behaviors: Behavior[]): Behavior[][] {
  const used = new Set<string>();
  const ordered: Behavior[] = [];
  for (const p of behaviors.filter((b) => b.kind === 'problem')) {
    ordered.push(p);
    used.add(p.id);
    for (const a of behaviors.filter((b) => b.replacesBehaviorId === p.id)) {
      ordered.push(a);
      used.add(a.id);
    }
  }
  for (const b of behaviors) if (!used.has(b.id)) ordered.push(b);
  const rows: Behavior[][] = [];
  for (let i = 0; i < ordered.length; i += 2) rows.push(ordered.slice(i, i + 2));
  return rows;
}

function useNow(ms: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (ms == null) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
