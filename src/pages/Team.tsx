/**
 * チーム（6.9、ワイヤーフレーム 4）。メンバーの一覧と、「家族」の印・睡眠の入力の許可（決定37）。
 * AI・睡眠不足の判定・書き出し・チームの削除は「チームの設定」にある。
 * 招待・承認・役割の変更、申し送り・コメントは、サーバー（Supabase）とログインができてから足す。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { setMemberFlags } from '../db/repo';
import { AFFILIATION_LABEL, ROLE_LABEL, type TeamMember } from '../db/types';
import { Sheet, TopBar } from '../components/ui';

export default function Team() {
  const { person, members, me, userId, aiEnabled } = useApp();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  if (!person || !userId) return null;
  const isAdmin = me?.role === 'admin';
  const admin = members.find((m) => m.role === 'admin');
  const current = editing ? members.find((m) => m.id === editing.id) ?? editing : null;

  return (
    <div className="page">
      <TopBar title="チーム" sub={`${person.displayName} ・ 管理者: ${admin?.displayName ?? '—'} ・ ${members.length}名`} />
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
