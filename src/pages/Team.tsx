/**
 * チーム（6.5、ワイヤーフレーム 4）。いまはメンバーの一覧だけ。
 * 招待・承認・役割の変更は、サーバー（Supabase）とログインができてから足す。
 */
import { useApp } from '../state';
import { AFFILIATION_LABEL, ROLE_LABEL } from '../db/types';
import { TopBar } from '../components/ui';

export default function Team() {
  const { person, members, userId } = useApp();
  if (!person) return null;
  return (
    <div className="page">
      <TopBar title="チーム" sub={person.displayName} />
      <div className="section">
        <div className="card">
          <h2 className="card__title">メンバー（{members.length}人）</h2>
          {members.map((m) => (
            <div key={m.id} className="row row--between today-row">
              <span>
                {m.displayName}
                {m.userId === userId && <span className="muted">（あなた）</span>}
              </span>
              <span className="row">
                <span className="muted">{AFFILIATION_LABEL[m.affiliation]}</span>
                <span className="badge badge--role">{ROLE_LABEL[m.role]}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="help">ほかの人の招待は、サーバーとログインの準備ができてから使えるようになります。</p>
      </div>
    </div>
  );
}
