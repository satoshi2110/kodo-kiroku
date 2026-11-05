/**
 * 睡眠ログ（6.3.4、画面一覧 18）。入力は任意で、催促しない。
 * 時刻は時・分のホイール（スマホでは select がホイールになる。分は5分刻み）。「いま寝た」のような1タップボタンは置かない。
 * 記録日は起きた日。入力・変更できるのは管理者・副管理者と「家族」の印・許可のある人（決定37）。それ以外は一覧だけ見える。
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditSleep, saveSleep } from '../db/repo';
import { useApp } from '../state';
import { addDays, dateRange, formatDateJa, formatShortDate, toLocalDate } from '../lib/date';
import { formatSleep, isShortNight, sleepMinutes, usualTimes } from '../lib/sleep';
import { TopBar } from '../components/ui';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

export default function Sleep() {
  const { person, me, members, userId, shortSleepUnderHours } = useApp();
  const personId = person?.id ?? '';
  const today = toLocalDate();
  const [wakeDate, setWakeDate] = useState(today);
  const logs = useLiveQuery(
    async () => (personId ? (await db.sleepLogs.where('personId').equals(personId).toArray()).filter((l) => !l.deletedAt) : []),
    [personId],
  );
  const current = logs?.find((l) => l.wakeDate === wakeDate);
  const [form, setForm] = useState({ bedTime: '21:00', wakeTime: '06:30', wakings: 0, note: '' });
  const [saved, setSaved] = useState(false);

  // 日を変えたら、その夜の記録（なければいつもの時刻）を入れ直す
  useEffect(() => {
    if (!logs) return;
    const usual = usualTimes(logs, wakeDate);
    setForm(
      current
        ? { bedTime: current.bedTime, wakeTime: current.wakeTime, wakings: current.wakings, note: current.note }
        : { bedTime: usual?.bedTime ?? '21:00', wakeTime: usual?.wakeTime ?? '06:30', wakings: 0, note: '' },
    );
    setSaved(false);
    // current は logs から作るので、logs と日付が変わったときだけでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeDate, logs === undefined]);

  if (!person || !userId || !logs) return null;
  const editable = canEditSleep(me);
  const usual = usualTimes(logs, wakeDate);
  const week = dateRange(addDays(today, -6), today).reverse();
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '（不明）';

  async function save() {
    if (!person || !userId) return;
    await saveSleep({ personId: person.id, wakeDate, ...form, note: form.note.trim() }, userId);
    setSaved(true);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="睡眠" sub={person.displayName} back="/" />

      <div className="section">
        <div className="card stack">
          <div className="row row--between">
            <button type="button" className="btn btn--sm nowrap" onClick={() => setWakeDate(addDays(wakeDate, -1))}>‹ 前の日</button>
            <strong className="nowrap">{formatDateJa(wakeDate)}の朝</strong>
            <button type="button" className="btn btn--sm nowrap" disabled={wakeDate >= today} onClick={() => setWakeDate(addDays(wakeDate, 1))}>次の日 ›</button>
          </div>

          {editable ? (
            <>
              <TimeWheel label="寝た時刻（前の夜）" value={form.bedTime} onChange={(v) => setForm({ ...form, bedTime: v })} />
              <TimeWheel label="起きた時刻" value={form.wakeTime} onChange={(v) => setForm({ ...form, wakeTime: v })} />
              <p className="help">寝ていた時間: {formatSleep(sleepMinutes(form))}</p>
              {usual && (
                <button type="button" className="btn btn--sm" onClick={() => setForm({ ...form, ...usual })}>
                  いつもの時刻にする（{usual.bedTime} → {usual.wakeTime}）
                </button>
              )}
              <div className="row row--between">
                <span className="label">夜中に起きた回数（任意）</span>
                <span className="row">
                  <button type="button" className="btn btn--sm" aria-label="1回へらす" disabled={form.wakings <= 0} onClick={() => setForm({ ...form, wakings: form.wakings - 1 })}>−</button>
                  <strong style={{ minWidth: 32, textAlign: 'center' }}>{form.wakings}</strong>
                  <button type="button" className="btn btn--sm" aria-label="1回ふやす" onClick={() => setForm({ ...form, wakings: form.wakings + 1 })}>＋</button>
                </span>
              </div>
              <label className="stack">
                <span className="label">メモ（任意）</span>
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
              <button type="button" className="btn btn--primary btn--block" onClick={save}>{current ? '変更を保存' : '保存'}</button>
              {saved && <p className="help" role="status">保存しました。</p>}
              {current && <p className="help">最後に入力した人: {nameOf(current.recorderId)}</p>}
            </>
          ) : (
            <>
              <p>{current ? `${current.bedTime} → ${current.wakeTime} ・ ${formatSleep(sleepMinutes(current))}` : 'まだ記録がありません'}</p>
              <p className="help">睡眠の入力は、管理者・副管理者と「家族」の印のある人が行います。</p>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <h2 className="card__title">この1週間</h2>
          {week.map((d) => {
            const l = logs.find((x) => x.wakeDate === d);
            const min = l ? sleepMinutes(l) : 0;
            const short = isShortNight(logs, d, shortSleepUnderHours);
            return (
              <button key={d} type="button" className={`sleep-row${d === wakeDate ? ' sleep-row--on' : ''}`} onClick={() => setWakeDate(d)}>
                <span className="sleep-row__date">{formatShortDate(d)}</span>
                <span className="sleep-row__track">
                  {l && <span className={`sleep-row__bar${short ? ' sleep-row__bar--short' : ''}`} style={{ width: `${Math.min(100, (min / (12 * 60)) * 100)}%` }} />}
                </span>
                <span className="sleep-row__val">{l ? formatSleep(min) : '未記録'}</span>
              </button>
            );
          })}
          <p className="help">オレンジ: {shortSleepUnderHours ? `${shortSleepUnderHours}時間より短かった夜。` : 'いつもより2時間以上短かった夜（記録が5夜分たまってから判定します）。'}その日の ABC記録には、状況要因「睡眠不足」が最初から付きます（外せます）。</p>
        </div>
      </div>
    </div>
  );
}

function TimeWheel({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [h, m] = value.split(':');
  return (
    <div className="row row--between">
      <span className="label">{label}</span>
      <span className="row">
        <select className="time-select" aria-label={`${label}の時`} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
          {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span>:</span>
        <select className="time-select" aria-label={`${label}の分`} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
          {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </span>
    </div>
  );
}
