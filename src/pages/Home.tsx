/**
 * ホーム（6.3.1、ワイヤーフレーム 1・14）。
 * 1タップで +1、右上の「−1」（タイマー型は「取消」）で押し間違いを取り消す。
 * 振動は対応端末だけの上乗せで、色と表示で必ず知らせる（5章）。強度を付けた行動は直後に強度シートを出す。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditSleep, canRecord, createEvent, lastUndoableEvent, observedRatio, restoreEvent, setPlaceChoice, undoEvent, updateEvent } from '../db/repo';
import { getPositionOnce, matchPlace } from '../lib/place';
import { useApp } from '../state';
import { formatDateJa, formatDateTimeJa, formatDuration, formatTime, toLocalDate } from '../lib/date';
import { INTENSITY_NAMES, METHOD_LABEL, type Behavior, type Event, type Observation } from '../db/types';
import { Chip, KindBadge, Sheet, TopBar } from '../components/ui';
import { formatSleep, sleepMinutes } from '../lib/sleep';
import { useRecordSet } from '../lib/series';
import { computeWins } from '../lib/wins';
import { usePlanData } from '../lib/usePlan';
import { needsMyAnswer, useOwnerTransfers } from '../lib/ownerTransfer';
import { addDays, formatShortDate } from '../lib/date';

type Timer = { behaviorId: string; startedAt: number };

/**
 * 計っている途中のタイマー（持続時間・潜時）。画面を移っても、アプリを開き直しても続くように、
 * 始めた時刻だけをこの端末に覚えておく（経過時間は開いたときに計算する）。覚えるのは行動の ID と時刻だけ
 */
const TIMERS_KEY = 'kodo.runningTimers';
function loadTimers(): Record<string, Timer> {
  try {
    const v = JSON.parse(localStorage.getItem(TIMERS_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function useStoredTimers() {
  const [timers, setState] = useState<Record<string, Timer>>(loadTimers);
  const setTimers = (next: Record<string, Timer>) => {
    setState(next);
    try {
      localStorage.setItem(TIMERS_KEY, JSON.stringify(next));
    } catch {
      // 保存できない端末（プライベートモードなど）では、この画面にいるあいだだけ計る
    }
  };
  return [timers, setTimers] as const;
}

export default function Home() {
  const { person, persons, setCurrentPerson, behaviors, me, members, userId, places, place, placeOutside, placeAuto, useLocation } = useApp();
  const today = toLocalDate();
  const personId = person?.id ?? '';
  const now = useNow(30_000);
  const handover = useOwnerTransfers(person?.id)?.pending;

  const todayEvents = useLiveQuery(
    async () => (personId ? (await db.events.where('[personId+localDate]').equals([personId, today]).toArray()).filter((e) => !e.deletedAt) : []),
    [personId, today],
  );
  const nav = useNavigate();
  const [toast, setToast] = useState<{ text: string; abcEventId?: string; restoreEventId?: string; placeBack?: string | null } | null>(null);
  const toastTimer = useRef<number>();
  const lastToastEvent = useRef<string | undefined>();
  const [flash, setFlash] = useState<{ id: string; good: boolean } | null>(null);
  const [intensityFor, setIntensityFor] = useState<{ event: Event; behavior: Behavior } | null>(null);
  const [timers, setTimers] = useStoredTimers();
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
  const lastNight = useLiveQuery(
    async () => (personId ? (await db.sleepLogs.where('[personId+wakeDate]').equals([personId, today]).toArray()).find((l) => !l.deletedAt) ?? null : null),
    [personId, today],
  );
  const events = useMemo(() => [...(todayEvents ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [todayEvents]);
  const rows = useMemo(() => pairRows(behaviors), [behaviors]);
  const [pickingPlace, setPickingPlace] = useState(false);
  const rs = useRecordSet(personId);
  const planData = usePlanData(personId);
  const wins = useMemo(
    () => (rs && planData !== undefined ? computeWins(behaviors, rs, planData.plan?.activeContent ?? null, today).filter((w) => w.date >= addDays(today, -6)) : []),
    [rs, planData, behaviors, today],
  );
  // 合意の依頼（決定75）: 自分が合意者で、まだ返事をしていない変更
  const signRequest = planData?.changes.find(
    (c) => (c.status === 'pending' || c.status === 'active') && me && c.signerMemberIds.includes(me.id) && !planData.signoffs.some((s) => s.changeId === c.id && s.memberId === me.id),
  );

  // 場所の自動判定（6.3.3）: 開いたときと前面に戻ったときに1回だけ位置を取り、端末の中で照らし合わせる
  const placeRef = useRef({ places, placeId: place?.id, outside: placeOutside, auto: placeAuto });
  placeRef.current = { places, placeId: place?.id, outside: placeOutside, auto: placeAuto };
  useEffect(() => {
    if (!useLocation || !personId) return;
    let alive = true;
    const detect = async () => {
      const pos = await getPositionOnce();
      if (!alive || !pos) return; // 取れなければ前の場所のまま
      const { places: list, placeId, outside } = placeRef.current;
      const hit = matchPlace(list, pos);
      await setPlaceChoice(personId, hit?.id ?? 'outside', true);
      // 切りかえたことを3秒出し、違っていたら「元に戻す」で前の場所に戻せる（6.3.3）
      if (hit && hit.id !== placeId) notify(`場所を「${hit.name}」に切りかえました`, undefined, undefined, placeId ?? (outside ? 'outside' : null));
    };
    detect();
    const onVisible = () => document.visibilityState === 'visible' && detect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLocation, personId]);

  if (!person || !userId) return null;
  const recordable = canRecord(me?.role);

  function notify(text: string, abcEventId?: string, restoreEventId?: string, placeBack?: string | null) {
    lastToastEvent.current = abcEventId;
    window.clearTimeout(toastTimer.current);
    setToast({ text, abcEventId, restoreEventId, placeBack });
    toastTimer.current = window.setTimeout(() => setToast(null), abcEventId || restoreEventId ? 5000 : 3000);
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
    const e = await createEvent({ personId: person.id, behaviorId: b.id, placeName: place?.name ?? null, ...extra }, userId);
    feedback(b);
    const msg =
      b.method === 'duration' ? `「${b.name}」${formatDuration(extra.durationSec ?? 0)} を記録しました`
      : b.method === 'latency' ? `「${b.name}」待ち時間 ${formatDuration(extra.latencySec ?? 0)} を記録しました`
      : `「${b.name}」+1 を記録しました`;
    notify(msg, e.id);
    if (b.intensity) setIntensityFor({ event: e, behavior: b });
    void recheckPlace(e, msg);
  }

  /**
   * 記録を保存した瞬間にも、場所を1回だけ判定する（6.3.3「記録に付く場所を最新にする」）。
   * 記録はすぐに保存し（押してから待たせない）、位置が取れて場所が変わっていたら、その記録の場所と、いまの場所を直す。
   * 手で選んだ場所のときは、選んだ人の判断を優先して変えない。
   */
  async function recheckPlace(e: Event, msg: string) {
    if (!useLocation || !personId || !userId) return;
    const { places: list, auto, placeId } = placeRef.current;
    if (!auto && placeId) return;
    const pos = await getPositionOnce();
    if (!pos) return;
    const hit = matchPlace(list, pos);
    if (!hit || hit.name === e.placeName) return;
    await updateEvent(e.id, { placeName: hit.name }, userId);
    await setPlaceChoice(personId, hit.id, true);
    // まだこの記録の知らせが出ているときだけ、場所を足して出し直す（あとの記録の知らせは消さない）
    if (lastToastEvent.current === e.id) notify(`${msg}（場所: ${hit.name}）`, e.id);
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
    // 日付では区切らない（時間制限なし）。ほかの人の記録か今日より前の記録なら、取り消す前に確かめる
    const last = await lastUndoableEvent(person.id, b.id, me?.role, userId);
    if (!last) return notify(`「${b.name}」に取り消せる記録がありません`);
    const others = last.recorderId !== userId;
    if (others || last.localDate !== today) {
      const who = others ? `${members.find((m) => m.userId === last.recorderId)?.displayName ?? '退会したメンバー'}がつけた、` : '';
      if (!window.confirm(`${who}${formatDateTimeJa(last.occurredAt)} の「${b.name}」の記録を取り消しますか？`)) return;
    }
    await undoEvent(last.id, userId);
    if (intensityFor?.event.id === last.id) setIntensityFor(null);
    notify(`「${b.name}」の記録（${last.localDate === today ? formatTime(last.occurredAt) : formatDateTimeJa(last.occurredAt)}）を取り消しました`, undefined, last.id);
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
        title={
          persons.length > 1 ? (
            <select className="person-select" value={person.id} aria-label="対象者を切りかえる" onChange={(e) => setCurrentPerson(e.target.value)}>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          ) : (
            person.displayName
          )
        }
        sub={
          <>
            {formatDateJa(toLocalDate(new Date(now)))} {formatTime(new Date(now).toISOString())} ・{' '}
            <button type="button" className="place-btn" onClick={() => setPickingPlace(true)}>
              場所: {place ? place.name : placeOutside ? '登録場所の外' : '未設定'}
              {(place || placeOutside) && <span className="muted">（{placeAuto ? '自動判定' : '手で選んだ'}）</span>}
            </button>
          </>
        }
        right={
          <>
            <Link to="/reinforcers" className="btn btn--sm nowrap">好きなもの</Link>
            <Link to="/behaviors" className="btn btn--sm nowrap">行動</Link>
          </>
        }
      />

      {person.isSample && <p className="section sample-note">これは架空の「サンプル」です。自由に押して試せます。</p>}
      {!recordable && <p className="section help">閲覧者は記録を見るだけです。</p>}
      {signRequest && (
        <div className="section">
          <Link to="/plan/signoff" className="card row row--between notice-card">
            <span className="stack" style={{ gap: 2 }}>
              <strong>支援計画の確認の依頼があります</strong>
              <span className="muted">{formatShortDate(signRequest.createdAt.slice(0, 10))} の変更 ・ 内容を見て返事をしてください</span>
            </span>
            <span className="today-row__go" aria-hidden="true">›</span>
          </Link>
        </div>
      )}
      {handover && userId && (needsMyAnswer(handover, userId) || ![handover.fromUser, handover.toUser].includes(userId)) && (
        <div className="section">
          <Link to="/team" className="card row row--between notice-card">
            <span className="stack" style={{ gap: 2 }}>
              <strong>{needsMyAnswer(handover, userId) ? '管理者の引き継ぎについて、返事をしてください' : '管理者の引き継ぎが進んでいます'}</strong>
              <span className="muted">チームの画面で内容を見られます</span>
            </span>
            <span className="today-row__go" aria-hidden="true">›</span>
          </Link>
        </div>
      )}
      {recordable && !person.isSample && rs && rs.events.length === 0 && rs.observations.length === 0 && behaviors.length > 0 && (
        <div className="section">
          <div className="card stack first-guide">
            <span className="label">はじめての設定 5 / 5: 最初の記録</span>
            <p className="help">行動のボタンを1回押してみましょう。押し間違えたら、右上の「−1」で取り消せます（取り消しも履歴に残ります）。</p>
          </div>
        </div>
      )}

      <div className="section">
        <Link to="/sleep" className="card sleep-card">
          <span>
            <span className="label">睡眠（昨夜）</span>{' '}
            {lastNight ? (
              <>
                {lastNight.bedTime} → {lastNight.wakeTime} ・ {formatSleep(sleepMinutes(lastNight))} ・ 中途覚醒 {lastNight.wakings}回
                <span className="muted"> ・ {members.find((m) => m.userId === lastNight.recorderId)?.displayName ?? ''} が入力</span>
              </>
            ) : (
              <span className="muted">{canEditSleep(me) ? '睡眠を記録（任意）' : 'まだ記録がありません'}</span>
            )}
          </span>
          <span className="btn btn--sm nowrap">{canEditSleep(me) ? '入力・変更' : '見る'}</span>
        </Link>
      </div>

      <div className="section stack">
        {rows.map((row) => (
          <div key={row.map((b) => b.id).join()} className="grid-2">
            {row.map((b) => (
              <BehaviorCard
                key={b.id}
                b={b}
                replaces={b.kind === 'alternative' && b.replacesBehaviorId ? behaviors.find((x) => x.id === b.replacesBehaviorId)?.name : undefined}
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
        {behaviors.some((b) => b.method === 'frequency' || b.method === 'duration') && (
          <p className="help">回数・時間で記録する行動は、記録を付けた日に記録がなければ、自動で 0 になります。観察していなかった日は「さかのぼって入力」で直せます。</p>
        )}
      </div>

      {wins.length > 0 && (
        <div className="section">
          <div className="card stack wins-card">
            <div className="row row--between">
              <h2 className="card__title" style={{ margin: 0 }}>できたこと</h2>
              <Link to="/wins" className="btn btn--sm">すべて見る</Link>
            </div>
            {wins.slice(0, 3).map((w, i) => (
              <p key={i} className="win-text">{w.text}<span className="muted"> ・ {formatShortDate(w.date)}{w.place ? ` ${w.place}` : ''}</span></p>
            ))}
          </div>
        </div>
      )}

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
                {e.backfilled ? ' ・ あとで入力' : ''}
                {members.length > 1 && ` ・ ${members.find((m) => m.userId === e.recorderId)?.displayName ?? '退会したメンバー'}`}
              </span>
              <span className="today-row__go" aria-hidden="true">›</span>
            </Link>
          ))}
          {recordable && (
            <Link to="/backfill" className="btn btn--sm btn--block" style={{ marginTop: 8 }}>さかのぼって入力</Link>
          )}
        </div>
      </div>

      {pickingPlace && (
        <Sheet title="いまの場所" onClose={() => setPickingPlace(false)}>
          <div className="stack">
            <div className="chips">
              {places.map((p) => (
                <Chip key={p.id} on={place?.id === p.id} onClick={() => { setPlaceChoice(person.id, p.id); setPickingPlace(false); }}>{p.name}</Chip>
              ))}
              <Chip on={placeOutside} onClick={() => { setPlaceChoice(person.id, 'outside'); setPickingPlace(false); }}>登録場所の外</Chip>
            </div>
            {places.length === 0 && <p className="help">まだ場所が登録されていません。</p>}
            <p className="help">記録には、ここで選んだ場所の名前だけが付きます。</p>
            <Link to="/places" className="btn btn--block">場所の登録・編集</Link>
          </div>
        </Sheet>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.abcEventId && !intensityFor && (
            <button type="button" className="btn btn--sm" onClick={() => nav(`/abc/${toast.abcEventId}`)}>詳しく書く</button>
          )}
          {toast.restoreEventId && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => {
                await restoreEvent(toast.restoreEventId!, userId);
                notify('取り消した記録を元に戻しました');
              }}
            >
              元に戻す
            </button>
          )}
          {toast.placeBack !== undefined && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => {
                await setPlaceChoice(person.id, toast.placeBack ?? null);
                notify('場所を元に戻しました');
              }}
            >
              元に戻す
            </button>
          )}
        </div>
      )}

      {intensityFor?.behavior.intensity && (
        <Sheet title={`「${intensityFor.behavior.name}」の強度`} onClose={() => setIntensity(null)}>
          <p className="muted" style={{ margin: 0 }}>
            記録しました ・ {formatTime(intensityFor.event.occurredAt)}{intensityFor.event.placeName ? ` ・ ${intensityFor.event.placeName}` : ''}
          </p>
          <p className="help">いちばん近いものを選んでください。あとで選ぶと「未評価」のまま残ります。</p>
          {INTENSITY_NAMES[intensityFor.behavior.intensity.levels].map((label, i) => (
            <button key={i} type="button" className="btn btn--block intensity-option" onClick={() => setIntensity(i + 1)}>
              <strong>強度 {i + 1}</strong>
              <span>{intensityFor.behavior.intensity!.criteria[i] || `${label}（基準未設定）`}</span>
            </button>
          ))}
          <button type="button" className="btn btn--block" onClick={() => setIntensity(null)}>あとで（未評価）</button>
          <button
            type="button"
            className="btn btn--outline btn--block"
            onClick={() => {
              const id = intensityFor.event.id;
              setIntensityFor(null);
              nav(`/abc/${id}`);
            }}
          >
            詳細を追加（ABC）
          </button>
        </Sheet>
      )}
    </div>
  );
}

function BehaviorCard({
  b,
  replaces,
  events,
  observations,
  timer,
  flash,
  disabled,
  onTap,
  onUndo,
}: {
  b: Behavior;
  replaces?: string;
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
        <KindBadge kind={b.kind} of={replaces} />
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
