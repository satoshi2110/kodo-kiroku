/**
 * 支援計画の合意（6.7、決定68・69・75、ワイヤーフレーム 25）。
 * 返事は「この内容で合意する」か「意見を送る（今は合意しない）」。合意したあとでも、意見を送れば「意見あり」に変わる。
 * 家族（管理者）が合意した日から変更後の計画が「実施中」になる。ほかの人の合意は待たない。
 * 合意はチームの中で「内容を確かめた」という記録で、施設の書類への署名の代わりにはしない（決定57）。
 * 通知・メールは送らない。合意待ちの変更は、保存した人と管理者・副管理者が取り下げられる。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { canWithdraw, signoff, withdrawChange } from '../db/phase2';
import { usePlanData } from '../lib/usePlan';
import { criterionText, fieldText } from '../lib/planText';
import { formatShortDate } from '../lib/date';
import { AFFILIATION_LABEL, PLAN_FIELD_LABEL, ROLE_LABEL } from '../db/types';
import { TopBar } from '../components/ui';

export default function PlanSignoff() {
  const { person, behaviors, members, me, userId } = useApp();
  const data = usePlanData(person?.id);
  const [opinion, setOpinion] = useState('');
  const [writing, setWriting] = useState(false);
  if (!person || !userId || !data) return null;
  // 自分が頼まれている変更を先に。なければ、いちばん新しい合意待ち・実施中の変更
  const open = data.changes.filter((c) => c.status === 'pending' || c.status === 'active');
  const change = open.find((c) => me && c.signerMemberIds.includes(me.id) && !data.signoffs.some((s) => s.changeId === c.id && s.memberId === me.id)) ?? open[0];
  if (!change) {
    return (
      <div className="page page--no-nav">
        <TopBar title="支援計画の変更の確認" back="/plan" />
        <p className="empty">確認する変更はありません。</p>
      </div>
    );
  }
  const saver = members.find((m) => m.userId === change.savedBy);
  const mine = me ? data.signoffs.find((s) => s.changeId === change.id && s.memberId === me.id) : undefined;
  const asked = !!me && change.signerMemberIds.includes(me.id);

  async function agree() {
    if (!me || !change) return;
    await signoff(change.id, me, 'agreed', '');
  }
  async function sendOpinion() {
    if (!me || !change || !opinion.trim()) return;
    await signoff(change.id, me, 'opinion', opinion.trim());
    setOpinion('');
    setWriting(false);
  }

  return (
    <div className="page page--no-nav">
      <TopBar
        title="支援計画の変更の確認"
        sub={`${saver ? `${AFFILIATION_LABEL[saver.affiliation]} ${saver.displayName}さん` : '退会したメンバー'}から ${formatShortDate(change.createdAt.slice(0, 10))} に確認の依頼`}
        back="/plan"
      />
      <div className="section">
        <div className="card stack">
          <div className="row row--between">
            <span className="label">今回変わったところ</span>
            <span className={`badge ${change.status === 'active' ? 'badge--owner' : 'badge--role'}`}>{change.status === 'active' ? '実施中' : '合意待ち'}</span>
          </div>
          {change.fields.map((k) => (
            <div key={k} className="diff">
              <span className="muted">{PLAN_FIELD_LABEL[k]}</span>
              {change.before && <span className="diff__before">{fieldText(change.before, k, behaviors)}</span>}
              <span className="diff__after">{change.before ? '→ ' : ''}{fieldText(change.after, k, behaviors)}</span>
            </div>
          ))}
          <span className="help">変えた理由: {change.reason}</span>
          <div className="row">
            <Link to="/plan/history" className="btn btn--sm">変更履歴を見る</Link>
            <Link to="/plan" className="btn btn--sm">計画の全体を見る</Link>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">支援目標と達成基準（変更後）</span>
          {change.after.goal && <p className="reinf__usage">{change.after.goal}</p>}
          {change.after.criteria.map((c, i) => <span key={i}>{criterionText(c, behaviors)}</span>)}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">合意の状況</span>
          {change.signerMemberIds.map((id) => {
            const m = members.find((x) => x.id === id);
            const s = data.signoffs.find((x) => x.changeId === change.id && x.memberId === id);
            return (
              <div key={id} className="stack today-row" style={{ gap: 2 }}>
                <div className="row row--between">
                  <span>
                    {m?.displayName ?? '退会したメンバー'}
                    {m ? `（${ROLE_LABEL[m.role]}${m.familyMark ? '・家族' : ''}）` : ''}
                    {m?.id === me?.id ? '（あなた）' : ''}
                  </span>
                  <span className={`badge ${s?.state === 'agreed' ? 'badge--owner' : s?.state === 'opinion' ? 'badge--problem' : 'badge--role'}`}>
                    {s?.state === 'agreed' ? `合意 ${formatShortDate(s.updatedAt.slice(0, 10))}` : s?.state === 'opinion' ? '意見あり' : '未確認'}
                  </span>
                </div>
                {s?.state === 'opinion' && <span className="help">意見: {s.opinion}</span>}
              </div>
            );
          })}
          <p className="help">
            {change.status === 'active'
              ? `家族（管理者）が合意した日（${formatShortDate(change.activeSince!)}）から、変更後の計画が「実施中」になりました。ほかの人の合意は待たずに始まり、まだの人は「未確認」と出ます。`
              : '家族（管理者）が合意した日から、変更後の計画が「実施中」になります。それまでは前の計画のままです。'}
          </p>
        </div>
      </div>

      {asked && (
        <div className="section">
          <div className="card stack">
            <span className="label">あなたの返事</span>
            {mine && <span className="muted">いまの返事: {mine.state === 'agreed' ? '合意' : '意見あり'}</span>}
            {mine?.state !== 'agreed' && <button type="button" className="btn btn--primary btn--block" onClick={agree}>この内容で合意する</button>}
            {writing ? (
              <>
                <label className="field">
                  意見
                  <textarea value={opinion} onChange={(e) => setOpinion(e.target.value)} placeholder="例: 学校でも同じカードを使えるか相談したい" />
                </label>
                <div className="grid-2">
                  <button type="button" className="btn" onClick={() => setWriting(false)}>やめる</button>
                  <button type="button" className="btn btn--primary" disabled={!opinion.trim()} onClick={sendOpinion}>意見を送る</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn--block" onClick={() => setWriting(true)}>意見を送る（今は合意しない）</button>
            )}
            <p className="help">意見を送ると「意見あり」と出ます。通知やメールは送らず、保存した人と管理者が計画の画面を開いたときに見えます。合意したあとでも、意見を送れば「意見あり」に変わります。</p>
          </div>
        </div>
      )}

      {change.status === 'pending' && canWithdraw(me?.role, change, userId) && (
        <div className="section">
          <button type="button" className="btn btn--danger btn--block" onClick={() => window.confirm('この変更を取り下げますか？ 取り下げも履歴に残ります。') && withdrawChange(change.id, userId)}>
            この変更を取り下げる
          </button>
        </div>
      )}
      <p className="section help">この合意は、チームの中で「内容を確かめた」という記録です。施設の個別支援計画書などへの署名の代わりにはなりません。</p>
    </div>
  );
}
