/**
 * 行動の一覧と削除（6.2、ワイヤーフレーム 8）。
 * 削除の既定は「非表示」（記録は残り、元に戻せる）。「記録ごと削除」は管理者だけに出す。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditBehaviors, deleteBehaviorWithRecords, recordCounts, setBehaviorHidden } from '../db/repo';
import { useApp } from '../state';
import { KIND_LABEL, METHOD_LABEL, type Behavior, type BehaviorKind } from '../db/types';
import { Sheet, TopBar } from '../components/ui';

export default function BehaviorList() {
  const { person, me, userId } = useApp();
  const personId = person?.id ?? '';
  const all = useLiveQuery(
    async () =>
      personId
        ? (await db.behaviors.where('personId').equals(personId).toArray()).filter((b) => !b.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [personId],
  );
  const counts = useLiveQuery(() => (personId ? recordCounts(personId) : new Map<string, number>()), [personId]);
  const [showHidden, setShowHidden] = useState(false);
  const [removing, setRemoving] = useState<Behavior | null>(null);

  if (!person || !userId || !all || !counts) return null;
  const editable = canEditBehaviors(me?.role);
  const isAdmin = me?.role === 'admin';
  const shown = all.filter((b) => !b.hiddenAt);
  const hidden = all.filter((b) => b.hiddenAt);
  const nameOf = (id: string | null) => all.find((b) => b.id === id)?.name;

  function sub(b: Behavior) {
    const m = METHOD_LABEL[b.method];
    const parts = [
      b.method === 'interval' ? `${m} ${b.intervalSec}秒` : b.method === 'sampling' ? `${m} ${b.samplingMin}分` : m,
      b.intensity ? `強度 ${b.intensity.levels}段階` : null,
    ].filter(Boolean);
    const extra = [b.kind === 'alternative' && nameOf(b.replacesBehaviorId) ? `${nameOf(b.replacesBehaviorId)}の代替` : null, `記録 ${counts!.get(b.id) ?? 0}件`]
      .filter(Boolean)
      .join(' ・ ');
    return (
      <>
        <span className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {parts.map((p) => <span key={p} className="badge badge--role">{p}</span>)}
        </span>
        <span className="muted">{extra}</span>
      </>
    );
  }

  async function hide(b: Behavior) {
    await setBehaviorHidden(b.id, true, userId!);
    setRemoving(null);
  }

  async function removeAll(b: Behavior) {
    const n = counts!.get(b.id) ?? 0;
    if (!window.confirm(`「${b.name}」と記録 ${n}件を削除します。元に戻せません。よろしいですか？`)) return;
    await deleteBehaviorWithRecords(b.id, userId!);
    setRemoving(null);
  }

  return (
    <div className="page page--no-nav">
      <TopBar
        title="記録する行動"
        sub={`${person.displayName} ・ ${shown.length}件${hidden.length ? ` ・ 非表示 ${hidden.length}件` : ''}`}
        back="/"
        right={editable ? <Link to="/behaviors/new" className="btn btn--sm">＋ 追加</Link> : undefined}
      />

      {(Object.keys(KIND_LABEL) as BehaviorKind[]).map((k) => {
        const list = shown.filter((b) => b.kind === k);
        if (!list.length) return null;
        return (
          <div key={k} className="section">
            <h2 className="card__title">{KIND_LABEL[k]}</h2>
            <div className="card">
              {list.map((b) => (
                <div key={b.id} className="row row--between today-row">
                  {editable ? (
                    <Link to={`/behaviors/${b.id}`} className="stack behavior-row__main">
                      <strong>{b.name}</strong>
                      {sub(b)}
                    </Link>
                  ) : (
                    <span className="stack behavior-row__main">
                      <strong>{b.name}</strong>
                      {sub(b)}
                    </span>
                  )}
                  {editable && (
                    <button type="button" className="btn btn--sm" aria-label={`${b.name}を削除`} onClick={() => setRemoving(b)}>削除</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!shown.length && <p className="section help">まだ行動がありません。「＋ 追加」から足してください。</p>}

      {hidden.length > 0 && (
        <div className="section">
          <button type="button" className="btn btn--block" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? '非表示にした行動を閉じる' : `非表示にした行動を見る（${hidden.length}件）`}
          </button>
          {showHidden && (
            <div className="card" style={{ marginTop: 8 }}>
              {hidden.map((b) => (
                <div key={b.id} className="row row--between today-row">
                  <span className="stack behavior-row__main">
                    <strong>{b.name}</strong>
                    <span className="muted">{KIND_LABEL[b.kind]} ・ 記録 {counts.get(b.id) ?? 0}件</span>
                  </span>
                  {editable && (
                    <span className="row">
                      <button type="button" className="btn btn--sm" onClick={() => setBehaviorHidden(b.id, false, userId)}>元に戻す</button>
                      {isAdmin && <button type="button" className="btn btn--sm btn--danger" onClick={() => removeAll(b)}>記録ごと削除</button>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {removing && (
        <Sheet title={`「${removing.name}」を削除しますか？`} onClose={() => setRemoving(null)}>
          <div className="stack">
            <p>
              記録が {counts.get(removing.id) ?? 0}件 あります。「非表示」にするとホームとグラフから消えますが、記録は残り、いつでも元に戻せます。
            </p>
            <button type="button" className="btn btn--primary btn--block" onClick={() => hide(removing)}>非表示にする（記録は残す）</button>
            {isAdmin && (
              <button type="button" className="btn btn--danger btn--block" onClick={() => removeAll(removing)}>記録ごと削除する（管理者のみ）</button>
            )}
            <p className="help">
              {isAdmin ? '施設・学校の職員には「記録ごと削除」は表示されません。' : '「記録ごと削除」は管理者だけができます。'}
              削除しても「誰が・いつ・何件消したか」は監査ログに残ります。
            </p>
            <button type="button" className="btn btn--block" onClick={() => setRemoving(null)}>キャンセル</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
