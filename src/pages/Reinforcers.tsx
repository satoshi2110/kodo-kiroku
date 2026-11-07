/**
 * 強化子（好きなもの）リスト（6.14、画面一覧 17、ワイヤーフレーム 10）。
 * 「いまハマっているもの」（最近2週間に更新または使った）と「以前好きだったもの」に分ける。
 * 写真は物・活動・場所だけ。チーム内だけで見られ、書き出しにも AI にも入らない（6.14a）。
 */
import { FBA_LINK } from '../lib/links';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditReinforcers, deleteReinforcer, markReinforcerUsed, saveReinforcer, setReinforcerLevel } from '../db/repo';
import { useApp } from '../state';
import { addDays, formatShortDate, localDateOf, toLocalDate } from '../lib/date';
import { shrinkPhoto } from '../lib/photo';
import { REINFORCER_CATEGORY_LABEL, type Reinforcer, type ReinforcerCategory } from '../db/types';
import { Chip, Sheet, TopBar } from '../components/ui';

const RECENT_DAYS = 14;

type Form = { id: string | null; name: string; category: ReinforcerCategory; level: number; usage: string; photo: string | null | undefined };

export default function Reinforcers() {
  const { person, me, members, userId } = useApp();
  const personId = person?.id ?? '';
  const list = useLiveQuery(
    async () => (personId ? (await db.reinforcers.where('personId').equals(personId).toArray()).filter((r) => !r.deletedAt) : []),
    [personId],
  );
  const [form, setForm] = useState<Form | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);

  if (!person || !userId || !list) return null;
  const editable = canEditReinforcers(me?.role);
  const since = addDays(toLocalDate(), -RECENT_DAYS);
  const lastTouched = (r: Reinforcer) => localDateOf(r.lastUsedAt && r.lastUsedAt > r.updatedAt ? r.lastUsedAt : r.updatedAt);
  const byLevel = (a: Reinforcer, b: Reinforcer) => b.level - a.level || b.updatedAt.localeCompare(a.updatedAt);
  const current = list.filter((r) => lastTouched(r) >= since).sort(byLevel);
  const old = list.filter((r) => lastTouched(r) < since).sort(byLevel);
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '（不明）';

  const blank = (photo: string | null): Form => ({ id: null, name: '', category: 'thing', level: 3, usage: '', photo });

  async function pickPhoto(file: File | undefined, then: (data: string) => void) {
    if (!file) return;
    setError('');
    try {
      then(await shrinkPhoto(file));
    } catch {
      setError('写真を読み込めませんでした。別の写真で試してください。');
    }
  }

  async function save() {
    if (!form || !person || !userId) return;
    await saveReinforcer(form.id, { personId: person.id, name: form.name.trim(), category: form.category, level: form.level, usage: form.usage.trim() }, form.photo, userId);
    setForm(null);
  }

  async function remove() {
    if (!form?.id || !userId) return;
    if (!window.confirm(`「${form.name}」を削除しますか？ 写真も消えます。`)) return;
    await deleteReinforcer(form.id, userId);
    setForm(null);
  }

  const card = (r: Reinforcer) => (
    <div key={r.id} className="card reinf">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Photo id={r.id} has={r.hasPhoto} />
        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <strong>{r.name}</strong>
            <span className="badge badge--role">{REINFORCER_CATEGORY_LABEL[r.category]}</span>
          </div>
          <Dots level={r.level} onChange={editable ? (n) => setReinforcerLevel(r.id, n, userId) : undefined} />
          <span className="muted">
            {nameOf(r.updatedBy)} {formatShortDate(localDateOf(r.updatedAt))} 更新
            {r.lastUsedAt && ` ・ ${formatShortDate(localDateOf(r.lastUsedAt))} 使用`}
          </span>
        </div>
      </div>
      {r.usage && <p className="reinf__usage">{r.usage}</p>}
      {editable && (
        <div className="grid-2">
          <button type="button" className="btn btn--sm" onClick={() => markReinforcerUsed(r.id, userId)}>今日使った</button>
          <button type="button" className="btn btn--sm" onClick={() => setForm({ id: r.id, name: r.name, category: r.category, level: r.level, usage: r.usage, photo: undefined })}>編集</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="page page--no-nav">
      <TopBar
        title="好きなもの"
        sub={`${person.displayName} ・ いま ${current.length}件 ・ 以前 ${old.length}件`}
        back="/"
        right={editable ? <button type="button" className="btn btn--sm" onClick={() => setForm(blank(null))}>＋ 追加</button> : undefined}
      />

      <div className="section">
        <h2 className="card__title">いまハマっているもの（最近2週間）</h2>
        {current.length ? current.map(card) : <p className="muted">まだありません。</p>}
      </div>

      {old.length > 0 && (
        <div className="section">
          <button type="button" className="btn btn--block" onClick={() => setShowOld(!showOld)}>
            {showOld ? '以前好きだったものを閉じる' : `以前好きだったものを見る（${old.length}件）`}
          </button>
          {showOld && <div style={{ marginTop: 10 }}>{old.map(card)}</div>}
        </div>
      )}

      <div className="section stack">
        <p className="help">
          写真は「物・活動・場所」を撮ってください。本人や他の人の顔は写さない方針です（撮る前に確認してください）。写真はチーム内だけで見られ、書き出しにも AI にも入りません。
        </p>
        {error && <p className="help" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        {editable && (
          <>
            <button type="button" className="btn btn--primary btn--block" onClick={() => cameraRef.current?.click()}>写真を撮って追加</button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                pickPhoto(f, (b) => setForm(blank(b)));
              }}
            />
            <button type="button" className="btn btn--block" onClick={() => setForm(blank(null))}>写真なしで追加</button>
          </>
        )}
        <a className="help ext-link" href={FBA_LINK} target="_blank" rel="noopener noreferrer">機能分析について（外部のページ）</a>
      </div>

      {form && (
        <Sheet title={form.id ? '好きなものの編集' : '好きなものの追加'} onClose={() => setForm(null)}>
          <div className="stack">
            <FormPhoto form={form} onPick={(f) => pickPhoto(f, (b) => setForm((cur) => (cur ? { ...cur, photo: b } : cur)))} onRemove={() => setForm({ ...form, photo: null })} />
            <p className="help">本人や他の人の顔が写っていないか確かめてください。</p>
            <label className="field">
              名前
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 電車の図鑑（青い表紙）" />
            </label>
            <span className="label">種類</span>
            <div className="chips">
              {(Object.keys(REINFORCER_CATEGORY_LABEL) as ReinforcerCategory[]).map((c) => (
                <Chip key={c} on={form.category === c} onClick={() => setForm({ ...form, category: c })}>{REINFORCER_CATEGORY_LABEL[c]}</Chip>
              ))}
            </div>
            <span className="label">ハマり度</span>
            <Dots level={form.level} onChange={(n) => setForm({ ...form, level: n })} />
            <label className="field">
              使い方と注意（任意）
              <textarea value={form.usage} onChange={(e) => setForm({ ...form, usage: e.target.value })} placeholder="例: 課題が終わったら5分。終わりはタイマーで予告する。" />
            </label>
            <button type="button" className="btn btn--primary btn--block" disabled={!form.name.trim()} onClick={save}>保存</button>
            {form.id && <button type="button" className="btn btn--danger btn--block" onClick={remove}>削除する</button>}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** ハマり度 ●○ 5段階。押すとその段階にする */
function Dots({ level, onChange }: { level: number; onChange?: (n: number) => void }) {
  return (
    <span className="dots" role={onChange ? 'group' : undefined} aria-label={`ハマり度 ${level} / 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" className={`dot${n <= level ? ' dot--on' : ''}`} aria-label={`ハマり度を${n}にする`} onClick={() => onChange(n)} />
        ) : (
          <span key={n} className={`dot${n <= level ? ' dot--on' : ''}`} />
        ),
      )}
      {level === 5 && <span className="muted">いま一番</span>}
    </span>
  );
}

function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function Photo({ id, has }: { id: string; has: boolean }) {
  const rec = useLiveQuery(() => (has ? db.reinforcerPhotos.get(id) : undefined), [id, has]);
  const legacy = useBlobUrl(rec?.data ? undefined : rec?.blob);
  const url = rec?.data || legacy;
  return url ? <img className="reinf__photo" src={url} alt="" /> : <span className="reinf__photo reinf__photo--none">写真なし</span>;
}

function FormPhoto({ form, onPick, onRemove }: { form: Form; onPick: (f: File | undefined) => void; onRemove: () => void }) {
  const saved = useLiveQuery(() => (form.id && form.photo === undefined ? db.reinforcerPhotos.get(form.id) : undefined), [form.id, form.photo]);
  const legacy = useBlobUrl(form.photo === undefined && !saved?.data ? saved?.blob : undefined);
  const url = form.photo === undefined ? saved?.data || legacy : form.photo;
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="row">
      {url ? <img className="reinf__photo" src={url} alt="" /> : <span className="reinf__photo reinf__photo--none">写真なし</span>}
      <div className="stack" style={{ flex: 1 }}>
        <button type="button" className="btn btn--sm" onClick={() => ref.current?.click()}>{url ? '写真を変える' : '写真を付ける'}</button>
        {url && <button type="button" className="btn btn--sm" onClick={onRemove}>写真を外す</button>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          onPick(f);
        }}
      />
    </div>
  );
}
