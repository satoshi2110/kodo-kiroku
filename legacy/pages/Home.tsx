/** ホーム: クイック記録（1タップで +1）、取り消し、本日なし、観察セッション、今日の記録 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createEvent, endSession, markTodayNoEvents, softDeleteEvent, startSession, unmarkNoEventDay, updateEvent } from '../db/repo';
import { useApp } from '../state';
import { formatDateJa, formatDuration, formatTime, toLocalDate } from '../lib/date';
import { addDays } from '../lib/date';
import type { Behavior, Event } from '../db/types';
import { KindBadge, Sheet } from '../components/ui';

interface Toast {
  text: string;
  eventId?: string;
}

export default function Home() {
  const { person, persons, behaviors, member, members, setCurrentPerson } = useApp();
  const nav = useNavigate();
  const today = toLocalDate();
  const personId = person?.id ?? '';

  const todayEvents = useLiveQuery(
    async () => (personId ? (await db.events.where('[personId+localDate]').equals([personId, today]).toArray()) : []),
    [personId, today],
  );
  const todayNoEvents = useLiveQuery(
    async () => (personId ? (await db.noEventDays.where('[personId+localDate]').equals([personId, today]).toArray()).filter((n) => !n.deletedAt) : []),
    [personId, today],
  );
  const session = useLiveQuery(
    async () => (personId ? (await db.sessions.where('personId').equals(personId).toArray()).find((s) => !s.deletedAt && !s.endedAt) : undefined),
    [personId],
  );
  const abcIds = useLiveQuery(async () => {
    const ids = (todayEvents ?? []).map((e) => e.id);
    if (!ids.length) return new Set<string>();
    const list = await db.abcDetails.where('eventId').anyOf(ids).toArray();
    return new Set(list.filter((a) => !a.deletedAt).map((a) => a.eventId));
  }, [todayEvents]);

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [intensityFor, setIntensityFor] = useState<{ event: Event; behavior: Behavior } | null>(null);
  const [showNoEvent, setShowNoEvent] = useState(false);
  const [showPersons, setShowPersons] = useState(false);
  const [timers, setTimers] = useState<Record<string, number>>({}); // behaviorId -> 開始時刻(ms)
  const [, tick] = useState(0);
  useEffect(() => {
    if (!Object.keys(timers).length) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [timers]);
  const [sessionTick, setSessionTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => setSessionTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, [session]);

  function showToast(t: Toast, ms = 4000) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }

  const activeEvents = useMemo(() => (todayEvents ?? []).filter((e) => !e.deletedAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [todayEvents]);
  const countBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of activeEvents) m.set(e.behaviorId, (m.get(e.behaviorId) ?? 0) + e.count);
    return m;
  }, [activeEvents]);
  const noEventSet = useMemo(() => new Set((todayNoEvents ?? []).map((n) => n.behaviorId)), [todayNoEvents]);

  async function quick(b: Behavior) {
    if (!person || !member) return;
    const e = await createEvent({ personId: person.id, behaviorId: b.id, recorderId: member.id });
    if (noEventSet.has(b.id)) await unmarkNoEventDay(b.id, today, member.id);
    showToast({ text: `「${b.name}」+1 を記録しました`, eventId: e.id });
    if (b.measures.includes('intensity')) setIntensityFor({ event: e, behavior: b });
  }

  async function undo() {
    if (!toast?.eventId || !member) return;
    await softDeleteEvent(toast.eventId, member.id);
    setIntensityFor(null);
    showToast({ text: '取り消しました' }, 2000);
  }

  async function setIntensity(level: number | null) {
    if (!intensityFor || !member) return;
    if (level != null) await updateEvent(intensityFor.event.id, { intensity: level }, member.id);
    setIntensityFor(null);
  }

  async function toggleTimer(b: Behavior) {
    if (!person || !member) return;
    const start = timers[b.id];
    if (!start) {
      setTimers((t) => ({ ...t, [b.id]: Date.now() }));
      return;
    }
    const sec = Math.max(1, Math.round((Date.now() - start) / 1000));
    setTimers((t) => {
      const c = { ...t };
      delete c[b.id];
      return c;
    });
    const e = await createEvent({ personId: person.id, behaviorId: b.id, recorderId: member.id, durationSec: sec, occurredAt: undefined });
    if (noEventSet.has(b.id)) await unmarkNoEventDay(b.id, today, member.id);
    showToast({ text: `「${b.name}」${formatDuration(sec)} を記録しました`, eventId: e.id });
    if (b.measures.includes('intensity')) setIntensityFor({ event: e, behavior: b });
  }

  const sessionMinutes = session ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000) + sessionTick * 0 : 0;

  if (!person) return null;
  const problems = behaviors.filter((b) => b.kind === 'problem');
  const supports = behaviors.filter((b) => b.kind !== 'problem');
  const ordered = [...problems, ...supports];
  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? '';

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar__inner">
          <button type="button" className="btn" aria-label="対象者を切り替える" onClick={() => setShowPersons(true)}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#d9dce1', display: 'inline-block' }} />
            {person.displayName}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <Link to="/settings" className="btn btn--sm">設定</Link>
        </div>
      </header>

      {session ? (
        <div className="observe">
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted">観察中{session.place ? `（${session.place}）` : ''}</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{formatTime(session.startedAt)}〜 {formatDuration(sessionMinutes * 60)}</span>
          </div>
          <button className="btn btn--outline" onClick={() => member && endSession(session.id, member.id)}>終了</button>
        </div>
      ) : (
        <div className="observe">
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted">観察時間を記録すると「1時間あたりの回数」が出せます</span>
          </div>
          <button className="btn btn--outline" onClick={() => member && startSession(person.id, member.id, member.affiliation || undefined)}>観察開始</button>
        </div>
      )}

      <div className="row row--between" style={{ margin: '16px 16px 8px' }}>
        <span className="label">記録する（タップで +1）</span>
        <span className="muted">{formatDateJa(today)}</span>
      </div>

      {ordered.length === 0 ? (
        <div className="section card empty">
          行動がまだ登録されていません。
          <div style={{ marginTop: 12 }}><Link to="/settings/behavior/new" className="btn btn--primary">行動を追加する</Link></div>
        </div>
      ) : (
        <div className="grid-2" style={{ margin: '0 16px' }}>
          {ordered.map((b) => {
            const n = countBy.get(b.id) ?? 0;
            const zero = n === 0 && noEventSet.has(b.id);
            const running = timers[b.id];
            const hasFreq = b.measures.includes('frequency') || !b.measures.includes('duration');
            return (
              <div key={b.id} className={`bcard bcard--${b.kind}`} style={{ padding: 0 }}>
                <button
                  type="button"
                  className={`bcard bcard--${b.kind}`}
                  style={{ border: 'none', minHeight: 96 }}
                  onClick={() => (hasFreq ? quick(b) : toggleTimer(b))}
                  aria-label={`${b.name} を1回記録`}
                >
                  <KindBadge kind={b.kind} />
                  <span className="bcard__name">{b.name}</span>
                  <span className="bcard__count">
                    今日 <strong>{n}</strong> 回{zero && <span className="bcard__zero">（本日なし）</span>}
                  </span>
                </button>
                {b.measures.includes('duration') && hasFreq && (
                  <div className="bcard__sub" style={{ padding: '0 8px 8px' }}>
                    <button type="button" className={`btn btn--sm${running ? ' btn--outline' : ''}`} onClick={() => toggleTimer(b)}>
                      {running ? `停止 ${formatDuration(Math.round((Date.now() - running) / 1000))}` : 'タイマー開始'}
                    </button>
                  </div>
                )}
                {!hasFreq && running && (
                  <div className="bcard__sub" style={{ padding: '0 8px 8px' }}>
                    <span className="muted">計測中 {formatDuration(Math.round((Date.now() - running) / 1000))}（タップで停止）</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="row" style={{ margin: '10px 16px 0' }}>
        <button className="btn btn--dashed" style={{ flex: 1 }} onClick={() => setShowNoEvent(true)} disabled={!behaviors.length}>本日なし（0回）を記録</button>
        <button className="btn" onClick={() => nav('/record')} disabled={!behaviors.length}>さかのぼって入力</button>
      </div>

      <Encouragement personId={person.id} behaviors={behaviors} />

      <div className="section stack" style={{ gap: 6 }}>
        <span className="label">今日の記録</span>
        {activeEvents.length === 0 && <div className="muted">まだ記録はありません。</div>}
        {activeEvents.map((e) => {
          const b = behaviors.find((x) => x.id === e.behaviorId);
          const hasABC = abcIds?.has(e.id);
          return (
            <Link key={e.id} to={`/abc/${e.id}`} className="list-item">
              <span style={{ fontSize: 14 }}>
                <strong>{formatTime(e.occurredAt)}</strong> {b?.name ?? '（削除された行動）'}
                {e.intensity != null && ` 強度${e.intensity}`}
                {e.durationSec != null && ` ${formatDuration(e.durationSec)}`}
                {' ・ '}{memberName(e.recorderId)}
              </span>
              <span className="muted" style={{ color: hasABC ? undefined : 'var(--primary)', whiteSpace: 'nowrap' }}>{hasABC ? 'ABC済' : 'ABCを追加'}</span>
            </Link>
          );
        })}
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.eventId && <button className="btn" onClick={undo}>取り消し</button>}
        </div>
      )}

      {intensityFor && (
        <Sheet title={`「${intensityFor.behavior.name}」の強度（任意）`} onClose={() => setIntensity(null)}>
          <div className="stack">
            {intensityFor.behavior.intensityLevels.map((l) => (
              <button key={l.level} className="btn btn--block" style={{ justifyContent: 'flex-start' }} onClick={() => setIntensity(l.level)}>
                <strong style={{ width: 24 }}>{l.level}</strong> {l.label}
              </button>
            ))}
            <button className="btn btn--block btn--dashed" onClick={() => setIntensity(null)}>スキップ（未評価）</button>
          </div>
        </Sheet>
      )}

      {showNoEvent && (
        <NoEventSheet
          behaviors={behaviors}
          recordedIds={new Set(countBy.keys())}
          alreadyZero={noEventSet}
          onClose={() => setShowNoEvent(false)}
          onConfirm={async (ids) => {
            if (member) await markTodayNoEvents(person.id, ids, member.id);
            setShowNoEvent(false);
            showToast({ text: `${ids.length}件を「本日なし（0回）」として記録しました` }, 2500);
          }}
        />
      )}

      {showPersons && (
        <Sheet title="対象者を切り替える" onClose={() => setShowPersons(false)}>
          <div className="stack">
            {persons.map((p) => (
              <button key={p.id} className={`btn btn--block${p.id === person.id ? ' btn--outline' : ''}`} onClick={async () => { await setCurrentPerson(p.id); setShowPersons(false); }}>
                {p.displayName}
              </button>
            ))}
            <Link to="/settings/person/new" className="btn btn--block btn--dashed" onClick={() => setShowPersons(false)}>+ 対象者を追加</Link>
          </div>
        </Sheet>
      )}
    </main>
  );
}

function NoEventSheet({
  behaviors,
  recordedIds,
  alreadyZero,
  onClose,
  onConfirm,
}: {
  behaviors: Behavior[];
  recordedIds: Set<string>;
  alreadyZero: Set<string>;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const candidates = behaviors.filter((b) => !recordedIds.has(b.id) && !alreadyZero.has(b.id));
  const [sel, setSel] = useState<Set<string>>(new Set(candidates.map((b) => b.id)));
  return (
    <Sheet title="本日なし（0回）を記録" onClose={onClose}>
      <p className="help">「記録していない」と「0回だった」を区別するための記録です。今日1回も起きなかった行動を選んでください。</p>
      {candidates.length === 0 && <div className="muted">今日はすべての行動に記録があるか、すでに「本日なし」が記録されています。</div>}
      <div className="stack">
        {candidates.map((b) => (
          <label key={b.id} className="list-item" style={{ justifyContent: 'flex-start' }}>
            <input type="checkbox" style={{ width: 22, height: 22 }} checked={sel.has(b.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(b.id) : n.delete(b.id); return n; })} />
            <KindBadge kind={b.kind} /> {b.name}
          </label>
        ))}
      </div>
      <button className="btn btn--primary btn--block" disabled={sel.size === 0} onClick={() => onConfirm(Array.from(sel))}>記録する</button>
    </Sheet>
  );
}

/** 「できたこと」: 望ましい行動・代替行動の増加や問題行動のない日を強調する */
function Encouragement({ personId, behaviors }: { personId: string; behaviors: Behavior[] }) {
  const today = toLocalDate();
  const from = addDays(today, -6);
  const events = useLiveQuery(
    async () => (await db.events.where('[personId+localDate]').between([personId, from], [personId, today], true, true).toArray()).filter((e) => !e.deletedAt),
    [personId, from, today],
  );
  const noEvents = useLiveQuery(
    async () => (await db.noEventDays.where('[personId+localDate]').between([personId, from], [personId, today], true, true).toArray()).filter((n) => !n.deletedAt),
    [personId, from, today],
  );
  const msgs: string[] = [];
  if (events && noEvents) {
    for (const b of behaviors) {
      const perDay = new Map<string, number>();
      for (const e of events) if (e.behaviorId === b.id) perDay.set(e.localDate, (perDay.get(e.localDate) ?? 0) + e.count);
      if (b.kind !== 'problem') {
        // 連続して記録がある日数
        let streak = 0;
        for (let d = today; (perDay.get(d) ?? 0) > 0; d = addDays(d, -1)) streak++;
        if (streak >= 2) msgs.push(`「${b.name}」が ${streak}日連続で記録されています。`);
        else if (streak === 1 && (perDay.get(today) ?? 0) >= 2) msgs.push(`今日「${b.name}」が ${perDay.get(today)}回ありました。`);
      } else {
        let zeroStreak = 0;
        for (let d = addDays(today, -1); zeroStreak < 7; d = addDays(d, -1)) {
          const z = noEvents.some((n) => n.behaviorId === b.id && n.localDate === d);
          if (!z || (perDay.get(d) ?? 0) > 0) break;
          zeroStreak++;
        }
        if (zeroStreak >= 1) msgs.push(`「${b.name}」のない日が ${zeroStreak}日続いています。`);
      }
    }
  }
  if (!msgs.length) return null;
  return (
    <section className="section card done-box">
      <p className="card__title">できたこと</p>
      <div style={{ fontSize: 14 }}>{msgs.slice(0, 3).join(' ')}</div>
    </section>
  );
}
