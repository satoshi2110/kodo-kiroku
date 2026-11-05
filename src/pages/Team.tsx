/**
 * チーム（6.9、ワイヤーフレーム 4）。対象者のプロフィール、メンバーの一覧と「家族」の印・睡眠の入力の許可（決定37）、申し送り（6.10）。
 * AI・睡眠不足の判定・書き出し・チームの削除は「チームの設定」にある。
 * 招待・承認・役割の変更は、サーバー（Supabase）とログインができてから足す。申し送りも、いまはこの端末の中だけ。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canRecord, setMemberFlags } from '../db/repo';
import { addComment, removeComment } from '../db/phase2';
import { formatDateTimeJa } from '../lib/date';
import { AFFILIATION_LABEL, ROLE_LABEL, type TeamMember } from '../db/types';
import { Sheet, TopBar } from '../components/ui';

export default function Team() {
  const { person, members, me, userId, aiEnabled } = useApp();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [text, setText] = useState('');
  const notes = useLiveQuery(
    async () =>
      person
        ? (await db.comments.where('personId').equals(person.id).filter((c) => c.target === 'team' && !c.deletedAt).toArray())
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 30)
        : [],
    [person?.id],
  );
  if (!person || !userId) return null;
  const memberOf = (uid: string) => members.find((m) => m.userId === uid);
  async function post() {
    const t = text.trim();
    if (!t || !person || !userId) return;
    await addComment(person.id, 'team', null, t, userId);
    setText('');
  }
  const isAdmin = me?.role === 'admin';
  const admin = members.find((m) => m.role === 'admin');
  const current = editing ? members.find((m) => m.id === editing.id) ?? editing : null;

  return (
    <div className="page">
      <TopBar title="チーム" sub={`${person.displayName} ・ 管理者: ${admin?.displayName ?? '—'} ・ ${members.length}名`} />
      <div className="section">
        <Link to="/person" className="card row row--between team-settings-link">
          <span className="stack" style={{ gap: 2 }}>
            <strong>対象者: {person.displayName}</strong>
            <span className="muted">{[person.belongs, person.cautions ? '気をつけること あり' : ''].filter(Boolean).join(' ・ ') || 'プロフィール（生まれた年月・通っているところ・気をつけること）'}</span>
          </span>
          <span className="today-row__go" aria-hidden="true">›</span>
        </Link>
      </div>

      <div className="section">
        <div className="card">
          <h2 className="card__title">メンバー</h2>
          {members.map((m) => (
            <div key={m.id} className="row row--between today-row">
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span>
                  {m.displayName}
                  {m.userId === userId && <span className="muted">（あなた）</span>}
                </span>
                <span className="muted">
                  {AFFILIATION_LABEL[m.affiliation]}
                  {m.familyMark && ' ・ 家族の印'}
                  {m.sleepInputAllowed && ' ・ 睡眠の入力を許可'}
                </span>
              </span>
              <span className="row">
                <span className="badge badge--role">{ROLE_LABEL[m.role]}</span>
                {isAdmin && <button type="button" className="btn btn--sm" onClick={() => setEditing(m)}>変更</button>}
              </span>
            </div>
          ))}
        </div>
        <p className="help">
          ほかの人の招待は、サーバーとログインの準備ができてから使えるようになります。「家族」の印の人は睡眠も入力できます。
        </p>
      </div>

      <div className="section">
        <div className="card stack">
          <h2 className="card__title" style={{ margin: 0 }}>申し送り</h2>
          {canRecord(me?.role) && (
            <div className="row">
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="今日の様子を一言で書く" maxLength={200} />
              <button type="button" className="btn btn--sm" disabled={!text.trim()} onClick={post}>送る</button>
            </div>
          )}
          {(notes ?? []).length === 0 && <span className="muted">まだありません。</span>}
          {(notes ?? []).map((c) => (
            <div key={c.id} className="today-row stack" style={{ gap: 2 }}>
              <span className="muted">
                {memberOf(c.authorId)?.displayName ?? '退会したメンバー'}
                {memberOf(c.authorId) ? `（${AFFILIATION_LABEL[memberOf(c.authorId)!.affiliation]}）` : ''} ・ {formatDateTimeJa(c.createdAt)}
              </span>
              <span>{c.text}</span>
              {c.authorId === userId && (
                <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-end' }} onClick={() => window.confirm('この申し送りを消しますか？（履歴には残ります）') && removeComment(c.id, userId)}>
                  消す
                </button>
              )}
            </div>
          ))}
          <p className="help">責める言い方を避け、できたことや気づいたことを短く書きましょう。いまはこの端末の中だけに残ります（共有はログインができてから）。</p>
        </div>
      </div>

      <div className="section">
        <Link to="/team/settings" className="card row row--between team-settings-link">
          <span className="stack" style={{ gap: 2 }}>
            <strong>同意と設定</strong>
            <span className="muted">AI利用: {aiEnabled ? 'あり' : 'なし'} ・ 睡眠不足の判定 ・ データの書き出し</span>
          </span>
          <span className="today-row__go" aria-hidden="true">›</span>
        </Link>
      </div>

      {current && (
        <Sheet title={`${current.displayName}（${ROLE_LABEL[current.role]}）`} onClose={() => setEditing(null)}>
          <div className="stack">
            <label className="row row--between">
              <span className="label">「家族」の印</span>
              <input type="checkbox" checked={current.familyMark} onChange={(e) => setMemberFlags(current.id, { familyMark: e.target.checked }, userId)} style={{ width: 22, height: 22 }} />
            </label>
            <p className="help">父・きょうだいなど。役割とは別の印で、睡眠の入力ができるようになります。ほかの権限は変わりません。</p>
            <label className="row row--between">
              <span className="label">睡眠の入力を許可</span>
              <input type="checkbox" checked={current.sleepInputAllowed} onChange={(e) => setMemberFlags(current.id, { sleepInputAllowed: e.target.checked }, userId)} style={{ width: 22, height: 22 }} />
            </label>
            <p className="help">入所施設などで、夜のようすを職員が分かっているときに付けます。</p>
            <button type="button" className="btn btn--block" onClick={() => setEditing(null)}>閉じる</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
