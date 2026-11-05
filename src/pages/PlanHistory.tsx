/**
 * 支援計画の変更履歴（6.7、決定67、ワイヤーフレーム 24）。新しい順に、日付・変えた理由・保存した人・変わった項目（前と今）・合意の人数。
 * 履歴は誰も書きかえ・削除できない。前の内容に戻すときは、その「前」を写して保存する（これも1回の変更として残る）。
 */
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { usePlanData } from '../lib/usePlan';
import { fieldText } from '../lib/planText';
import { formatShortDate } from '../lib/date';
import { PLAN_FIELD_LABEL, ROLE_LABEL, type PlanChangeStatus } from '../db/types';
import { TopBar } from '../components/ui';

const STATUS: Record<PlanChangeStatus, string> = {
  pending: '合意待ち',
  active: '実施中',
  past: '前の変更',
  withdrawn: '取り下げ',
  superseded: '新しい変更に置きかわった',
};

export default function PlanHistory() {
  const { person, behaviors, members } = useApp();
  const data = usePlanData(person?.id);
  if (!person || !data) return null;
  const member = (uid: string) => members.find((m) => m.userId === uid);

  return (
    <div className="page page--no-nav">
      <TopBar title="支援計画の変更履歴" sub="保存すると上書きされ、何を変えたかはここに残ります。誰も消せません" back="/plan" />
      {data.changes.length === 0 && <p className="empty">まだ変更はありません。</p>}
      {data.changes.map((c) => {
        const agreed = data.signoffs.filter((s) => s.changeId === c.id && s.state === 'agreed').length;
        const saver = member(c.savedBy);
        return (
          <div key={c.id} className="section">
            <div className="card stack">
              <div className="row row--between">
                <strong>{formatShortDate(c.createdAt.slice(0, 10))} の{c.before ? '変更' : '作成'}</strong>
                <span className="row" style={{ gap: 6 }}>
                  <span className={`badge ${c.status === 'active' ? 'badge--owner' : 'badge--role'}`}>{STATUS[c.status]}</span>
                  <span className="muted">合意 {agreed}/{c.signerMemberIds.length} 人</span>
                </span>
              </div>
              <span className="help">変えた理由: {c.reason}</span>
              {c.before &&
                c.fields.map((k) => (
                  <div key={k} className="diff">
                    <span className="muted">{PLAN_FIELD_LABEL[k]}</span>
                    <span className="diff__before">{fieldText(c.before, k, behaviors)}</span>
                    <span className="diff__after">→ {fieldText(c.after, k, behaviors)}</span>
                  </div>
                ))}
              <span className="muted">
                {saver ? `${saver.displayName}（${ROLE_LABEL[saver.role]}）` : '退会したメンバー'}が保存
                {c.activeSince ? ` ・ ${formatShortDate(c.activeSince)} から実施` : ''}
                {c.closedBy && c.status === 'withdrawn' ? ` ・ ${member(c.closedBy)?.displayName ?? ''}が取り下げ` : ''}
              </span>
            </div>
          </div>
        );
      })}
      <div className="section stack">
        <Link to="/plan" className="btn btn--block">今の計画を見る</Link>
        <Link to="/graph" className="btn btn--block">グラフで線を見る</Link>
        <p className="help">前の内容に戻したいときは、その変更の「前」の内容を写して保存します（これも1回の変更として残ります）。変更が実施中になった日は、グラフに縦の線で出ます。</p>
      </div>
    </div>
  );
}
