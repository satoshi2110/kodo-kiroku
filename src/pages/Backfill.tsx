/**
 * さかのぼって入力（6.3.5、画面一覧 6、ワイヤーフレーム 15）。
 * 日時を指定して記録を足す（「あとで入力」の印が付く）。自動で 0 になった日を「観察していなかった（未記録）」に直す。
 * インターバル・時間サンプリングは区間ごとの観察なので、あとから足せない。
 * 取り消した記録（直近14日）もここに並べ、記録の詳細から元に戻せるようにする（6.3.5）。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canRecord, canUndoEvent, createEvent, setNotObserved } from '../db/repo';
import { useApp } from '../state';
import { zeroFrom } from '../lib/series';
import { addDays, formatDateJa, formatDateTimeJa, fromDateTimeLocalInput, toLocalDate } from '../lib/date';
import { METHOD_LABEL, type Event } from '../db/types';
import { Chip, TopBar } from '../components/ui';

const ZERO_DAYS = 14; // 直す対象にする日数

export default function Backfill() {
  const { person, behaviors, me, userId, places, place } = useApp();
  const personId = person?.id ?? '';
  const today = toLocalDate();
  const targets = behaviors.filter((b) => b.method !== 'interval' && b.method !== 'sampling');
  const [picked, setBehaviorId] = useState('');
  const behaviorId = picked || targets[0]?.id || ''; // 行動は後から読み込まれるので、未選択なら先頭
  const [date, setDate] = useState(addDays(today, -1));
  const [time, setTime] = useState('15:00');
  const [count, setCount] = useState(1);
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(10);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [saved, setSaved] = useState<Event | null>(null);
  const [placePick, setPlacePick] = useState<string | null | undefined>(undefined); // undefined = いまの場所
  const placeName = placePick === undefined ? (place?.name ?? null) : placePick;

  const data = useLiveQuery(async () => {
    if (!personId) return null;
    const [events, obs, marks] = await Promise.all([
      db.events.where('personId').equals(personId).filter((e) => !e.deletedAt).toArray(),
      db.observations.where('personId').equals(personId).filter((o) => !o.deletedAt && o.results.length > 0).toArray(),
      db.notObservedDays.where('personId').equals(personId).filter((x) => !x.deletedAt).toArray(),
    ]);
    // 取り消した記録は、元に戻せる人の分だけ並べる
    const undone = (await db.events.where('personId').equals(personId).filter((e) => !!e.deletedAt && e.localDate >= addDays(today, -ZERO_DAYS)).toArray())
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { events, obs, marks, undone };
  }, [personId, today]);

  // グラフと同じ考え方: 何か記録がある日に、その行動の記録がなければ自動で 0（頻度・持続時間だけ）
  const zeroRows = useMemo(() => {
    if (!data) return [];
    const from = addDays(today, -ZERO_DAYS);
    const days = [...new Set([...data.events, ...data.obs].map((x) => x.localDate))].filter((d) => d >= from && d < today).sort().reverse();
    const has = new Set(data.events.map((e) => `${e.behaviorId}|${e.localDate}`));
    const marked = new Set(data.marks.map((m) => `${m.behaviorId}|${m.localDate}`));
    return days.flatMap((d) =>
      behaviors
        .filter((b) => b.method === 'frequency' || b.method === 'duration')
        .filter((b) => !has.has(`${b.id}|${d}`) && d >= zeroFrom(b, data.events))
        .map((b) => ({ date: d, b, notObserved: marked.has(`${b.id}|${d}`) })),
    );
  }, [data, behaviors, today]);

  if (!person || !userId || !data) return null;
  if (!canRecord(me?.role)) return <p className="empty">閲覧者は記録を見るだけです。</p>;
  const undoneRows = data.undone.filter((e) => canUndoEvent(me?.role, e, userId));
  const b = targets.find((x) => x.id === behaviorId);

  async function save() {
    if (!person || !userId || !b) return;
    const e = await createEvent(
      {
        personId: person.id,
        behaviorId: b.id,
        occurredAt: fromDateTimeLocalInput(`${date}T${time}`),
        count: b.method === 'frequency' ? count : 1,
        durationSec: b.method === 'duration' ? Math.round(minutes * 60) : null,
        latencySec: b.method === 'latency' ? seconds : null,
        intensity: b.intensity ? intensity : null,
        placeName,
        backfilled: true,
      },
      userId,
    );
    setSaved(e);
    setCount(1);
    setIntensity(null);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="さかのぼって入力" sub="あとから記録を足す・自動の 0 を直す" back="/" />

      <div className="section">
        <div className="card stack">
          <h2 className="card__title">記録を足す</h2>
          {targets.length === 0 ? (
            <p className="help">あとから足せる行動（頻度・持続時間・潜時）がありません。</p>
          ) : (
            <>
              <div className="chips">
                {targets.map((x) => (
                  <Chip key={x.id} on={behaviorId === x.id} problem={x.kind === 'problem'} onClick={() => { setBehaviorId(x.id); setIntensity(null); setSaved(null); }}>
                    {x.name}
                  </Chip>
                ))}
              </div>
              <div className="grid-2">
                <label className="field">
                  日付
                  <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
                </label>
                <label className="field">
                  時刻
                  <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
                </label>
              </div>
              {b?.method === 'frequency' && (
                <div className="row row--between">
                  <span className="label">回数</span>
                  <span className="row">
                    <button type="button" className="btn btn--sm" aria-label="1回へらす" disabled={count <= 1} onClick={() => setCount(count - 1)}>−</button>
                    <strong style={{ minWidth: 32, textAlign: 'center' }}>{count}</strong>
                    <button type="button" className="btn btn--sm" aria-label="1回ふやす" onClick={() => setCount(count + 1)}>＋</button>
                  </span>
                </div>
              )}
              {b?.method === 'duration' && (
                <label className="field">
                  続いた時間（分）
                  <input type="number" min={0} step={0.5} value={minutes} onChange={(e) => setMinutes(Math.max(0, +e.target.value || 0))} />
                </label>
              )}
              {b?.method === 'latency' && (
                <label className="field">
                  待ち時間（秒）
                  <input type="number" min={0} value={seconds} onChange={(e) => setSeconds(Math.max(0, Math.round(+e.target.value || 0)))} />
                </label>
              )}
              {b?.intensity && (
                <div className="stack">
                  <span className="label">強度（任意）</span>
                  <div className="chips">
                    {Array.from({ length: b.intensity.levels }, (_, i) => i + 1).map((n) => (
                      <Chip key={n} on={intensity === n} onClick={() => setIntensity(intensity === n ? null : n)}>{n}</Chip>
                    ))}
                  </div>
                </div>
              )}
              {places.length > 0 && (
                <div className="stack">
                  <span className="label">場所</span>
                  <div className="chips">
                    {places.map((p) => (
                      <Chip key={p.id} on={placeName === p.name} onClick={() => setPlacePick(placeName === p.name ? null : p.name)}>{p.name}</Chip>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" className="btn btn--primary btn--block" disabled={!b} onClick={save}>保存</button>
              {saved && (
                <p className="help" role="status">
                  保存しました。<Link to={`/abc/${saved.id}`}>この記録の ABC を書く</Link>
                </p>
              )}
              <p className="help">あとから入れた記録には「あとで入力」の印と入力した日時が付き、履歴に残ります。</p>
            </>
          )}
          {behaviors.some((x) => x.method === 'interval' || x.method === 'sampling') && (
            <p className="help">{METHOD_LABEL.interval}・{METHOD_LABEL.sampling}は、区間ごとの観察なので、あとから足せません。</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2 className="card__title">自動で 0 になった日（頻度・持続時間だけ、直近{ZERO_DAYS}日）</h2>
          {zeroRows.length === 0 && <p className="muted">自動で 0 になった日はありません。</p>}
          {zeroRows.map((r) => (
            <div key={`${r.b.id}|${r.date}`} className="row row--between today-row">
              <span style={{ flex: 1 }}>
                {formatDateJa(r.date)} {r.b.name}{' '}
                <span className="muted">{r.notObserved ? '未記録' : `${r.b.method === 'duration' ? '0分' : '0回'} ・ 自動`}</span>
              </span>
              {r.notObserved ? (
                <button type="button" className="btn btn--sm nowrap" onClick={() => setNotObserved(person.id, r.b.id, r.date, false, userId)}>0 に戻す</button>
              ) : (
                <button type="button" className="btn btn--sm nowrap" onClick={() => setNotObserved(person.id, r.b.id, r.date, true, userId)}>観察していなかった</button>
              )}
            </div>
          ))}
          <p className="help">「観察していなかった」を押すと未記録に戻り、グラフの線が切れます。</p>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2 className="card__title">取り消した記録（直近{ZERO_DAYS}日）</h2>
          {undoneRows.length === 0 && <p className="muted">取り消した記録はありません。</p>}
          {undoneRows.map((e) => (
            <Link key={e.id} to={`/abc/${e.id}`} className="row row--between today-row today-row--link">
              <span className="muted">{formatDateTimeJa(e.occurredAt)}</span>
              <span style={{ flex: 1 }}>{behaviors.find((x) => x.id === e.behaviorId)?.name ?? '（非表示の行動）'}</span>
              <span className="today-row__go" aria-hidden="true">›</span>
            </Link>
          ))}
          <p className="help">押すと記録の詳細が開き、「元に戻す」でグラフや集計に戻せます。元に戻せるのは、記録した人と支援リーダー以上の人です。</p>
        </div>
      </div>
    </div>
  );
}
