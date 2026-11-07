/**
 * ABC記録（6.3.2、ワイヤーフレーム 2）。ホームで付けた記録に「詳しく書く」で A・B・C を足す。
 * A・C・状況要因の選択肢は「編集」でその場で追加・削除できる。削除は非表示だけで、過去の記録の値は残る。
 * 自由記述は端末の音声入力でも書ける（録音は保存しない、決定48）。
 * 【暫定】（2026-11-07 の試作）記録の日時・回数・持続時間・待ち時間も、ここで直せる（6.3.5。直した人と前後の値は履歴に残る）。未来の日時にはできない。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { RANK, addChoiceOption, canEditBehaviors, canUndoEvent, ensureChoiceOptions, hideChoiceOption, restoreEvent, saveAbc, undoEvent } from '../db/repo';
import { useApp } from '../state';
import { formatDateTimeJa, fromDateTimeLocalInput, localDateOf, toDateTimeLocalInput } from '../lib/date';
import { isShortNight } from '../lib/sleep';
import {
  AFFILIATION_LABEL,
  FUNCTION_LABEL,
  INTENSITY_NAMES,
  type BehaviorFunction,
  type ChoiceKind,
  type ChoiceOption,
} from '../db/types';
import { Chip, KindBadge, TopBar } from '../components/ui';
import { CommentThread } from '../components/Comments';

/** 別の記録の ABC に移ったら、画面ごと作り直す（前の記録の読み込み結果や入力を持ち越さない） */
export default function ABCRoute() {
  const { eventId = '' } = useParams();
  return <ABC key={eventId} eventId={eventId} />;
}

function ABC({ eventId }: { eventId: string }) {
  const nav = useNavigate();
  const { person, behaviors, members, me, userId, shortSleepUnderHours, places } = useApp();
  const personId = person?.id ?? '';

  const event = useLiveQuery(() => db.events.get(eventId), [eventId]);
  const existing = useLiveQuery(
    async () => (await db.abcDetails.where('eventId').equals(eventId).filter((d) => !d.deletedAt).first()) ?? null,
    [eventId],
  );
  const options = useLiveQuery(
    async () => (personId ? (await db.choiceOptions.where('personId').equals(personId).toArray()).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [personId],
  );

  const sleepLogs = useLiveQuery(
    async () => (personId ? (await db.sleepLogs.where('personId').equals(personId).toArray()).filter((l) => !l.deletedAt) : []),
    [personId],
  );

  useEffect(() => {
    if (personId && userId) ensureChoiceOptions(personId, userId);
  }, [personId, userId]);

  const [form, setForm] = useState<{
    antecedentIds: string[];
    antecedentNote: string;
    consequenceIds: string[];
    consequenceNote: string;
    settingIds: string[];
    involvedMemberIds: string[];
    funcGuess: BehaviorFunction | null;
    note: string;
    intensity: number | null;
    activity: string;
    placeName: string;
    occurredAt: string;
    count: string;
    durationSec: number | null;
    latencySec: number | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // 読み込みが終わったら、前に書いた内容（なければ空）で始める。
  // 新しく書くとき、睡眠が短かった夜の起きた日なら、状況要因「睡眠不足」を最初から付ける（6.3.4。外せる）
  useEffect(() => {
    if (form || !event || existing === undefined || !options || !sleepLogs) return;
    const shortSleep = options.find((o) => o.kind === 'setting' && o.name === '睡眠不足' && !o.hiddenAt);
    const autoSetting = !existing && shortSleep && isShortNight(sleepLogs, event.localDate, shortSleepUnderHours) ? [shortSleep.id] : [];
    setForm({
      antecedentIds: existing?.antecedentIds ?? [],
      antecedentNote: existing?.antecedentNote ?? '',
      consequenceIds: existing?.consequenceIds ?? [],
      consequenceNote: existing?.consequenceNote ?? '',
      settingIds: existing?.settingIds ?? autoSetting,
      involvedMemberIds: existing?.involvedMemberIds ?? (me ? [me.id] : []),
      funcGuess: existing?.funcGuess ?? null,
      note: existing?.note ?? '',
      intensity: event.intensity,
      activity: event.activity ?? '',
      placeName: event.placeName ?? '',
      occurredAt: event.occurredAt,
      count: String(event.count),
      durationSec: event.durationSec,
      latencySec: event.latencySec,
    });
  }, [event, existing, form, me, options, sleepLogs]);

  if (event === undefined || !person || !userId) return null;
  if (!event) return <p className="empty">この記録は見つかりません。</p>;
  // 取り消した記録（論理削除）。記録した本人と支援リーダー以上が元に戻せる（6.3.5）
  if (event.deletedAt) {
    const canRestore = canUndoEvent(me?.role, event, userId);
    const b = behaviors.find((x) => x.id === event.behaviorId);
    return (
      <div className="page page--no-nav">
        <TopBar title="取り消した記録" sub={<>{formatDateTimeJa(event.occurredAt)} ・ {b?.name ?? '（非表示の行動）'}</>} back="/" />
        <div className="section stack">
          <p className="notice-inline">
            この記録は {formatDateTimeJa(event.deletedAt)} に取り消されました。グラフや集計には入りません。取り消したことは履歴に残っています。
          </p>
          {canRestore ? (
            <button type="button" className="btn btn--primary btn--block" onClick={() => restoreEvent(event.id, userId)}>元に戻す</button>
          ) : (
            <p className="help">元に戻せるのは、記録した人と支援リーダー以上の人です。</p>
          )}
        </div>
      </div>
    );
  }
  if (!form) return null;

  const behavior = behaviors.find((b) => b.id === event.behaviorId);
  // 直せるのは、その記録をした本人と、管理者・副管理者・支援リーダー（6.3.5）。サーバーの RLS も同じ決まり
  const editable =
    canUndoEvent(me?.role, event, userId) && (!existing || existing.recorderId === userId || (!!me && RANK[me.role] >= RANK.leader));
  // 続けて押しても取りこぼさないように、いつも最新の状態から作る
  type Form = NonNullable<typeof form>;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggle = (k: 'antecedentIds' | 'consequenceIds' | 'settingIds' | 'involvedMemberIds', id: string) =>
    setForm((f) => (f ? { ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] } : f));

  // 日時は未来にできない。回数は 1〜999
  const countNum = Number(form.count);
  const countOk = Number.isInteger(countNum) && countNum >= 1 && countNum <= 999;
  const future = new Date(form.occurredAt).getTime() > Date.now() + 60_000;
  const valid = countOk && !future;

  async function save() {
    if (!form || !event || !userId || !valid) return;
    setSaving(true);
    const { intensity, activity, placeName, occurredAt, count, durationSec, latencySec, ...detail } = form;
    await saveAbc(event, { ...detail, antecedentNote: detail.antecedentNote.trim(), consequenceNote: detail.consequenceNote.trim(), note: detail.note.trim() },
      {
        intensity,
        activity: activity.trim() || null,
        placeName: placeName || null,
        occurredAt,
        localDate: localDateOf(occurredAt),
        count: Number(count),
        durationSec,
        latencySec,
      },
      userId);
    nav('/', { replace: true });
  }

  const optionProps = (kind: ChoiceKind, key: 'antecedentIds' | 'consequenceIds' | 'settingIds') => ({
    options: (options ?? []).filter((o) => o.kind === kind),
    selected: form[key],
    onToggle: (id: string) => toggle(key, id),
    onAdd: async (name: string) => {
      const o = await addChoiceOption(person.id, kind, name, userId);
      toggle(key, o.id);
    },
    onHide: (id: string) => hideChoiceOption(id, userId),
    disabled: !editable,
  });

  return (
    <div className="page page--no-nav">
      <TopBar
        title="ABC記録"
        sub={<>{formatDateTimeJa(event.occurredAt)}{event.placeName ? ` ・ ${event.placeName}` : ''} ・ {behavior?.name ?? '（非表示の行動）'}</>}
        back="/"
        right={editable ? <button type="button" className="btn btn--primary btn--sm" disabled={saving || !valid} onClick={save}>保存</button> : undefined}
      />

      <div className="section stack">
        {!editable && <p className="notice-inline">ほかの人がつけた記録なので、見るだけです。直せるのは、記録した人と支援リーダー以上の人です。</p>}
        <Section letter="A" title="直前に起きていたこと（先行事象）">
          <ChoiceEditor {...optionProps('antecedent', 'antecedentIds')} />
          <label className="field">
            自由記述（任意）
            <textarea value={form.antecedentNote} disabled={!editable} onChange={(e) => set('antecedentNote', e.target.value)} />
          </label>
        </Section>

        <Section letter="B" title="行動">
          {behavior && (
            <div className="row">
              <KindBadge kind={behavior.kind} />
              <strong>{behavior.name}</strong>
            </div>
          )}
          {behavior?.definition && <span className="muted">{behavior.definition}</span>}
          <label className="field">
            日時
            <input
              type="datetime-local"
              value={toDateTimeLocalInput(form.occurredAt)}
              max={toDateTimeLocalInput(new Date().toISOString())}
              disabled={!editable}
              onChange={(e) => e.target.value && set('occurredAt', fromDateTimeLocalInput(e.target.value))}
            />
          </label>
          {future && <p className="ai-error" role="alert">未来の日時にはできません。</p>}
          {(behavior?.method === 'frequency' || event.count !== 1) && (
            <label className="field">
              回数
              <input type="number" inputMode="numeric" min={1} max={999} value={form.count} disabled={!editable} onChange={(e) => set('count', e.target.value)} />
            </label>
          )}
          {!countOk && <p className="ai-error" role="alert">回数は 1〜999 で入れてください。</p>}
          {event.durationSec != null && (
            <MinSec label="持続時間" sec={form.durationSec ?? 0} disabled={!editable} onChange={(v) => set('durationSec', v)} />
          )}
          {event.latencySec != null && (
            <MinSec label="待ち時間（潜時）" sec={form.latencySec ?? 0} disabled={!editable} onChange={(v) => set('latencySec', v)} />
          )}
          {behavior?.intensity && (
            <>
              <div className="row row--between">
                <span className="label">強度（この行動の基準）</span>
                {canEditBehaviors(me?.role) && <Link to={`/behaviors/${behavior.id}`}>基準を編集</Link>}
              </div>
              {INTENSITY_NAMES[behavior.intensity.levels].map((name, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn btn--block intensity-option${form.intensity === i + 1 ? ' intensity-option--on' : ''}`}
                  aria-pressed={form.intensity === i + 1}
                  disabled={!editable}
                  onClick={() => set('intensity', form.intensity === i + 1 ? null : i + 1)}
                >
                  <strong>{i + 1} {name}</strong>
                  <span>{behavior.intensity!.criteria[i] || '基準未設定（行動の設定で書いてください）'}</span>
                </button>
              ))}
            </>
          )}
          {/* 場所は自動の判定が違っていたときに選び直せる（6.3.3）。名前だけを残す（決定42） */}
          <label className="field">
            場所
            <select value={form.placeName} disabled={!editable} onChange={(e) => set('placeName', e.target.value)}>
              <option value="">登録場所の外・わからない</option>
              {places.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
              {form.placeName && !places.some((p) => p.name === form.placeName) && <option value={form.placeName}>{form.placeName}</option>}
            </select>
          </label>
          <label className="field">
            活動（任意）
            <input value={form.activity} disabled={!editable} onChange={(e) => set('activity', e.target.value)} placeholder="例: 個別課題、食事" />
          </label>
          <span className="label">関わった人</span>
          <div className="chips">
            {members.map((m) => (
              <Chip key={m.id} on={form.involvedMemberIds.includes(m.id)} onClick={editable ? () => toggle('involvedMemberIds', m.id) : undefined}>
                {m.displayName}（{AFFILIATION_LABEL[m.affiliation]}）
              </Chip>
            ))}
          </div>
        </Section>

        <Section letter="C" title="その後どうなったか（結果）">
          <ChoiceEditor {...optionProps('consequence', 'consequenceIds')} />
          <label className="field">
            自由記述（任意）
            <textarea value={form.consequenceNote} disabled={!editable} onChange={(e) => set('consequenceNote', e.target.value)} />
          </label>
        </Section>

        <Section title="状況要因（その日の体調・環境）">
          <ChoiceEditor {...optionProps('setting', 'settingIds')} />
        </Section>

        <Section title="この時の機能はどれだと思いますか？（任意）">
          <div className="chips">
            {(Object.keys(FUNCTION_LABEL) as BehaviorFunction[]).map((f) => (
              <Chip key={f} on={form.funcGuess === f} onClick={editable ? () => set('funcGuess', form.funcGuess === f ? null : f) : undefined}>
                {FUNCTION_LABEL[f]}
              </Chip>
            ))}
          </div>
          <label className="field">
            メモ（任意）
            <textarea value={form.note} disabled={!editable} onChange={(e) => set('note', e.target.value)} />
          </label>
          <p className="help">キーボードのマイクで、話して入力することもできます。録音は保存しません。</p>
        </Section>

        {editable && <button type="button" className="btn btn--primary btn--block" disabled={saving} onClick={save}>保存する</button>}
      </div>
      <CommentThread target="event" targetId={event.id} title="この記録へのコメント" />
      <div className="section stack">
        {canUndoEvent(me?.role, event, userId) && (
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={async () => {
              const who = event.recorderId !== userId ? `${members.find((m) => m.userId === event.recorderId)?.displayName ?? '退会したメンバー'}がつけた` : 'この';
              if (window.confirm(`${who}記録（${formatDateTimeJa(event.occurredAt)}）を取り消しますか？\nグラフや集計から外れます。履歴に残り、あとで元に戻せます。`)) await undoEvent(event.id, userId);
            }}
          >
            この記録を取り消す
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ letter, title, children }: { letter?: string; title: string; children: ReactNode }) {
  return (
    <div className="card stack">
      <div className="row">
        {letter && <span className="abc-letter">{letter}</span>}
        <span className="label">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** 選択肢のチップ。「編集」で × による削除（非表示）と追加ができる */
function ChoiceEditor({
  options,
  selected,
  onToggle,
  onAdd,
  onHide,
  disabled,
}: {
  options: ChoiceOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onAdd: (name: string) => Promise<void>;
  onHide: (id: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  // 非表示にした選択肢でも、この記録で選ばれていれば表示を残す
  const shown = options.filter((o) => !o.hiddenAt || selected.includes(o.id));

  async function add() {
    const n = name.trim();
    if (!n) return;
    await onAdd(n);
    setName('');
  }

  return (
    <div className="stack">
      {editing && <p className="help">× で選択肢を消せます。消しても、これまでの記録に付いた値は残ります。</p>}
      <div className="chips">
        {shown.map((o) =>
          editing && !o.hiddenAt ? (
            <span key={o.id} className="chip chip--edit">
              {o.name}
              <button type="button" className="chip__x" aria-label={`${o.name} を消す`} onClick={() => onHide(o.id)}>×</button>
            </span>
          ) : (
            <Chip key={o.id} on={selected.includes(o.id)} onClick={disabled || editing ? undefined : () => onToggle(o.id)}>
              {o.name}
            </Chip>
          ),
        )}
      </div>
      {editing && (
        <div className="row">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="新しい選択肢" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()} />
          <button type="button" className="btn btn--sm" onClick={add}>追加</button>
        </div>
      )}
      {!disabled && (
        <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(!editing)}>
          {editing ? '完了' : '選択肢を編集'}
        </button>
      )}
    </div>
  );
}

/** 分と秒で入れる（持続時間・待ち時間）。0〜24時間 */
function MinSec({ label, sec, disabled, onChange }: { label: string; sec: number; disabled: boolean; onChange: (sec: number) => void }) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const put = (mm: number, ss: number) => onChange(Math.min(24 * 3600, Math.max(0, (Number.isFinite(mm) ? Math.floor(mm) : 0) * 60 + (Number.isFinite(ss) ? Math.floor(ss) : 0))));
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        <input type="number" inputMode="numeric" min={0} max={1440} aria-label={`${label}（分）`} value={m} disabled={disabled} onChange={(e) => put(Number(e.target.value), s)} style={{ width: 88 }} />
        <span>分</span>
        <input type="number" inputMode="numeric" min={0} max={59} aria-label={`${label}（秒）`} value={s} disabled={disabled} onChange={(e) => put(m, Math.min(59, Number(e.target.value)))} style={{ width: 72 }} />
        <span>秒</span>
      </div>
    </div>
  );
}
