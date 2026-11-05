/** ABC 記録: 選択肢 + 自由記述。状況要因と場面は A とは別欄。機能仮説は任意。 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getABC, saveABC, softDeleteEvent, updateEvent, updatePerson } from '../db/repo';
import { useApp } from '../state';
import { FUNCTION_LABEL, type BehaviorFunction } from '../db/types';
import { formatDateTimeJa, formatDuration } from '../lib/date';
import { Chip, TopBar } from '../components/ui';

function OptionGroup({
  options,
  selected,
  onToggle,
  onAdd,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onAdd: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  return (
    <div className="chips">
      {options.map((o) => (
        <Chip key={o} on={selected.includes(o)} onClick={() => onToggle(o)}>{o}</Chip>
      ))}
      {adding ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (val.trim()) onAdd(val.trim());
            setVal('');
            setAdding(false);
          }}
        >
          <input className="chip" style={{ minWidth: 140 }} value={val} onChange={(e) => setVal(e.target.value)} placeholder="選択肢を追加" autoFocus />
          <button className="btn btn--sm btn--primary" type="submit">追加</button>
        </form>
      ) : (
        <Chip dashed onClick={() => setAdding(true)}>+ 追加</Chip>
      )}
    </div>
  );
}

export default function ABC() {
  const { eventId = '' } = useParams();
  const nav = useNavigate();
  const { person, behaviors, member, members } = useApp();
  const event = useLiveQuery(() => db.events.get(eventId), [eventId]);
  const behavior = behaviors.find((b) => b.id === event?.behaviorId);
  const [loaded, setLoaded] = useState(false);
  const [antecedents, setAntecedents] = useState<string[]>([]);
  const [antecedentNote, setAntecedentNote] = useState('');
  const [consequences, setConsequences] = useState<string[]>([]);
  const [consequenceNote, setConsequenceNote] = useState('');
  const [settingFactors, setSettingFactors] = useState<string[]>([]);
  const [settingFactorNote, setSettingFactorNote] = useState('');
  const [fn, setFn] = useState<BehaviorFunction | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState<string>('');
  const [place, setPlace] = useState('');
  const [activity, setActivity] = useState('');
  const [staff, setStaff] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!event || loaded) return;
    setIntensity(event.intensity);
    setDurationSec(event.durationSec != null ? String(event.durationSec) : '');
    setPlace(event.place ?? '');
    setActivity(event.activity ?? '');
    setStaff(event.staff ?? '');
    setMemo(event.memo ?? '');
    getABC(event.id).then((a) => {
      if (a) {
        setAntecedents(a.antecedents);
        setAntecedentNote(a.antecedentNote);
        setConsequences(a.consequences);
        setConsequenceNote(a.consequenceNote);
        setSettingFactors(a.settingFactors);
        setSettingFactorNote(a.settingFactorNote);
        setFn(a.hypothesizedFunction);
      }
      setLoaded(true);
    });
  }, [event, loaded]);

  if (event === undefined) return <div className="empty">読み込み中…</div>;
  if (!event || !person) return <div className="empty">記録が見つかりません。<div><Link to="/">ホームへ</Link></div></div>;

  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const addOption = (key: 'antecedentOptions' | 'consequenceOptions' | 'settingFactorOptions', list: string[], set: (v: string[]) => void) => async (v: string) => {
    if (!person[key].includes(v) && member) await updatePerson(person.id, { [key]: [...person[key], v] }, member.id);
    if (!list.includes(v)) set([...list, v]);
  };

  async function save() {
    if (!member) return;
    await updateEvent(
      event!.id,
      {
        intensity,
        durationSec: durationSec.trim() === '' ? null : Math.max(0, Math.round(Number(durationSec))),
        place: place || undefined,
        activity: activity || undefined,
        staff: staff || undefined,
        memo: memo || undefined,
      },
      member.id,
    );
    await saveABC(event!.id, { antecedents, antecedentNote, consequences, consequenceNote, settingFactors, settingFactorNote, hypothesizedFunction: fn }, member.id);
    nav(-1);
  }

  async function remove() {
    if (!member) return;
    if (!window.confirm('この記録を削除しますか？（削除の履歴は残ります）')) return;
    await softDeleteEvent(event!.id, member.id);
    nav('/', { replace: true });
  }

  const recorder = members.find((m) => m.id === event.recorderId)?.displayName;

  return (
    <main className="page">
      <TopBar
        back="/"
        title="ABC記録"
        sub={`${formatDateTimeJa(event.occurredAt)} ・ ${behavior?.name ?? ''}${event.intensity != null ? ` ・ 強度${event.intensity}` : ''}${recorder ? ` ・ ${recorder}` : ''}`}
        right={<button className="btn btn--primary" onClick={save}>保存</button>}
      />
      {event.deletedAt && <div className="section card" style={{ color: 'var(--danger)' }}>この記録は削除されています（履歴として表示）。</div>}

      <div className="section stack" style={{ gap: 12 }}>
        <section className="card stack">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="abc-letter">A</span>
            <span className="label">直前に起きていたこと（先行事象）</span>
          </div>
          <OptionGroup options={person.antecedentOptions} selected={antecedents} onToggle={toggle(antecedents, setAntecedents)} onAdd={addOption('antecedentOptions', antecedents, setAntecedents)} />
          <label className="field">自由記述
            <input value={antecedentNote} onChange={(e) => setAntecedentNote(e.target.value)} placeholder="例: プリント課題を机に置いた直後" />
          </label>
        </section>

        <section className="card stack">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="abc-letter">B</span>
            <span className="label">行動</span>
          </div>
          <div className="row row--between">
            <span style={{ fontSize: 15 }}>{behavior?.name}{behavior?.definition ? `（${behavior.definition}）` : ''}</span>
            {behavior?.measures.includes('intensity') && (
              <div className="intensity" role="group" aria-label="強度">
                {behavior.intensityLevels.map((l) => (
                  <button key={l.level} type="button" aria-pressed={intensity === l.level} title={l.label} onClick={() => setIntensity(intensity === l.level ? null : l.level)}>{l.level}</button>
                ))}
              </div>
            )}
          </div>
          {behavior?.measures.includes('intensity') && intensity != null && (
            <span className="muted">強度{intensity}: {behavior.intensityLevels.find((l) => l.level === intensity)?.label}</span>
          )}
          <div className="grid-2">
            <label className="field">持続時間（秒）
              <input type="number" inputMode="numeric" min={0} value={durationSec} onChange={(e) => setDurationSec(e.target.value)} placeholder={event.durationSec != null ? formatDuration(event.durationSec) : '例: 40'} />
            </label>
            <label className="field">場所
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="例: 作業室" />
            </label>
            <label className="field">活動
              <input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="例: 個別課題" />
            </label>
            <label className="field">関わった支援者
              <input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="例: 山田" />
            </label>
          </div>
        </section>

        <section className="card stack">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="abc-letter">C</span>
            <span className="label">その後どうなったか（結果）</span>
          </div>
          <OptionGroup options={person.consequenceOptions} selected={consequences} onToggle={toggle(consequences, setConsequences)} onAdd={addOption('consequenceOptions', consequences, setConsequences)} />
          <label className="field">自由記述
            <input value={consequenceNote} onChange={(e) => setConsequenceNote(e.target.value)} />
          </label>
        </section>

        <section className="card stack">
          <span className="label">状況要因（その日の体調・環境）</span>
          <OptionGroup options={person.settingFactorOptions} selected={settingFactors} onToggle={toggle(settingFactors, setSettingFactors)} onAdd={addOption('settingFactorOptions', settingFactors, setSettingFactors)} />
          <label className="field">自由記述
            <input value={settingFactorNote} onChange={(e) => setSettingFactorNote(e.target.value)} />
          </label>
        </section>

        <section className="card stack">
          <span className="label">この時の機能はどれだと思いますか？（任意）</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6 }}>
            {(Object.keys(FUNCTION_LABEL) as BehaviorFunction[]).map((k) => (
              <button key={k} type="button" className={`chip${fn === k ? ' chip--on' : ''}`} style={{ minHeight: 44, borderRadius: 8, justifyContent: 'center' }} aria-pressed={fn === k} onClick={() => setFn(fn === k ? null : k)}>
                {FUNCTION_LABEL[k]}
              </button>
            ))}
          </div>
          <span className="help">注目 = 人の反応を得る / 要求 = 物や活動を得る / 回避・逃避 = 嫌なことから離れる / 感覚 = 行動そのものの刺激</span>
        </section>

        <section className="card stack">
          <label className="field">メモ
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
        </section>

        <div className="row row--between">
          <Link to={`/record/${event.id}`} className="btn">日時・行動を修正</Link>
          {!event.deletedAt && <button className="btn btn--danger" onClick={remove}>この記録を削除</button>}
        </div>
        <button className="btn btn--primary btn--block" onClick={save}>保存</button>
      </div>
    </main>
  );
}
