/**
 * ABC記録（6.3.2、ワイヤーフレーム 2）。ホームで付けた記録に「詳しく書く」で A・B・C を足す。
 * A・C・状況要因の選択肢は「編集」でその場で追加・削除できる。削除は非表示だけで、過去の記録の値は残る。
 * 自由記述は端末の音声入力でも書ける（録音は保存しない、決定48）。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { addChoiceOption, canRecord, ensureChoiceOptions, hideChoiceOption, saveAbc } from '../db/repo';
import { useApp } from '../state';
import { formatDateTimeJa, formatDuration } from '../lib/date';
import {
  AFFILIATION_LABEL,
  FUNCTION_LABEL,
  INTENSITY_NAMES,
  type BehaviorFunction,
  type ChoiceKind,
  type ChoiceOption,
} from '../db/types';
import { Chip, KindBadge, TopBar } from '../components/ui';

export default function ABC() {
  const { eventId = '' } = useParams();
  const nav = useNavigate();
  const { person, behaviors, members, me, userId } = useApp();
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
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // 読み込みが終わったら、前に書いた内容（なければ空）で始める
  useEffect(() => {
    if (form || !event || existing === undefined) return;
    setForm({
      antecedentIds: existing?.antecedentIds ?? [],
      antecedentNote: existing?.antecedentNote ?? '',
      consequenceIds: existing?.consequenceIds ?? [],
      consequenceNote: existing?.consequenceNote ?? '',
      settingIds: existing?.settingIds ?? [],
      involvedMemberIds: existing?.involvedMemberIds ?? (me ? [me.id] : []),
      funcGuess: existing?.funcGuess ?? null,
      note: existing?.note ?? '',
      intensity: event.intensity,
      activity: event.activity ?? '',
    });
  }, [event, existing, form, me]);

  if (event === undefined || !person || !userId) return null;
  if (!event || event.deletedAt) return <p className="empty">この記録は見つかりません（取り消された可能性があります）。</p>;
  if (!form) return null;

  const behavior = behaviors.find((b) => b.id === event.behaviorId);
  const editable = canRecord(me?.role);
  // 続けて押しても取りこぼさないように、いつも最新の状態から作る
  type Form = NonNullable<typeof form>;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggle = (k: 'antecedentIds' | 'consequenceIds' | 'settingIds' | 'involvedMemberIds', id: string) =>
    setForm((f) => (f ? { ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] } : f));

  async function save() {
    if (!form || !event || !userId) return;
    setSaving(true);
    const { intensity, activity, ...detail } = form;
    await saveAbc(event, { ...detail, antecedentNote: detail.antecedentNote.trim(), consequenceNote: detail.consequenceNote.trim(), note: detail.note.trim() },
      { intensity, activity: activity.trim() || null }, userId);
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
        right={editable ? <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={save}>保存</button> : undefined}
      />

      <div className="section stack">
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
          {event.durationSec != null && <span className="muted">持続: {formatDuration(event.durationSec)}</span>}
          {behavior?.intensity && (
            <>
              <span className="label">強度（この行動の基準）</span>
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
