/**
 * 支援計画（6.7、ワイヤーフレーム 4、Phase 2）。下部ナビの「計画」タブ（決定70）。
 * - 実施中の計画を見せる。合意待ちの変更があれば、上に知らせる（実施中は前の内容のまま、決定68）
 * - 機能仮説に合わせた代替行動の定型ヒント（決定27。AI なしでも出す）
 * - 達成基準と直近7日の平均を比べる。見直し日が近づいたら知らせる（通知は出さず、画面に出す）
 * - 合意の状況、意見あり（保存した人と管理者に出す、決定75）
 * - 身体拘束の記録・支援会議メモ・PDF レポート・できたことへの入口
 * - 機能分析のツール（外部のサイト）へのリンク（決定90）
 */
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { canEditPlan, FUNCTION_HINT } from '../db/phase2';
import { canExport } from '../db/repo';
import { addDays, formatDateJa, formatShortDate, toLocalDate } from '../lib/date';
import { dailyMain, lastDays, mainFormat, useRecordSet } from '../lib/series';
import { usePlanData } from '../lib/usePlan';
import { criterionText } from '../lib/planText';
import { FUNCTION_LABEL, KIND_LABEL, ROLE_LABEL, type PlanChange, type PlanContent } from '../db/types';
import { KindBadge, TopBar } from '../components/ui';
import { FBA_LINK } from '../lib/links';

export default function Plan() {
  const { person, behaviors, members, me, userId } = useApp();
  const data = usePlanData(person?.id);
  const rs = useRecordSet(person?.id);
  if (!person || !userId || !data || !rs) return null;
  const { plan, changes, signoffs } = data;
  const pending = changes.find((c) => c.status === 'pending');
  const latest = pending ?? changes.find((c) => c.status === 'active');
  const shown: PlanContent | null = plan?.activeContent ?? plan?.content ?? null;
  const editable = canEditPlan(me?.role);
  const today = toLocalDate();
  const nameOf = (id: string | null) => behaviors.find((b) => b.id === id);
  const memberName = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';

  // 意見あり（保存した人と管理者に見せる）
  const opinions = signoffs.filter(
    (s) => s.state === 'opinion' && changes.some((c) => c.id === s.changeId && (c.status === 'pending' || c.status === 'active') && (c.savedBy === userId || me?.role === 'admin')),
  );
  const mySignRequest = changes.find(
    (c) => (c.status === 'pending' || c.status === 'active') && me && c.signerMemberIds.includes(me.id) && !signoffs.some((s) => s.changeId === c.id && s.memberId === me.id),
  );

  if (!plan) {
    return (
      <div className="page">
        <TopBar title="支援計画" sub={person.displayName} />
        <div className="section">
          <div className="card stack">
            <p>まだ支援計画がありません。</p>
            <p className="help">
              標的とする行動、機能の仮説、支援目標と達成基準、先にできる工夫、できたときの認め方、危機時の対応、見直し日を書きます。
              保存すると、合意をお願いした人に「確認の依頼」が出ます。家族（管理者）が合意した日から「実施中」になり、グラフに縦の線が入ります。
            </p>
            {editable ? <Link to="/plan/edit" className="btn btn--primary btn--block">支援計画を作る</Link> : <p className="help">作れるのは管理者・副管理者・支援リーダーです。</p>}
          </div>
        </div>
        <FbaTool />
        <PlanLinks exportable={canExport(me?.role)} />
      </div>
    );
  }

  const status = plan.activeSince ? `実施中 ・ ${formatShortDate(plan.activeSince)} から` : '合意待ち（まだ実施前）';
  const review = shown?.reviewDate;
  const reviewSoon = review && review <= addDays(today, 7);

  return (
    <div className="page">
      <TopBar
        title="支援計画"
        sub={<>{status}{review ? ` ・ 次回見直し ${formatShortDate(review)}` : ''}</>}
        right={
          <>
            <Link to="/plan/history" className="btn btn--sm">履歴</Link>
            {editable && <Link to="/plan/edit" className="btn btn--sm btn--outline">編集</Link>}
          </>
        }
      />

      {mySignRequest && (
        <div className="section">
          <Link to="/plan/signoff" className="card row row--between notice-card">
            <strong>確認の依頼があります</strong>
            <span className="today-row__go" aria-hidden="true">›</span>
          </Link>
        </div>
      )}
      {pending && plan.activeSince && (
        <p className="section help notice-inline">
          {formatShortDate(pending.createdAt.slice(0, 10))} に保存した変更が合意待ちです（{memberName(pending.savedBy)}）。家族（管理者）が合意するまでは、下の実施中の内容のままです。
          <Link to="/plan/signoff"> 変更を見る</Link>
        </p>
      )}
      {opinions.length > 0 && (
        <div className="section">
          <div className="card stack opinion-card">
            <span className="label">意見あり（{opinions.length}件）</span>
            {opinions.map((o) => (
              <span key={o.id} className="help">
                {members.find((m) => m.id === o.memberId)?.displayName}: {o.opinion}
              </span>
            ))}
          </div>
        </div>
      )}
      {reviewSoon && (
        <p className="section help notice-inline">
          見直し日（{formatDateJa(review!)}）{review! < today ? 'を過ぎています' : 'が近づいています'}。グラフと達成基準を見比べて、続けるか・広げるか・直すかを話し合いましょう。
        </p>
      )}

      {shown && (
        <>
          <div className="section">
            <div className="card stack">
              <span className="label">標的行動と機能仮説</span>
              {shown.problemBehaviorId && nameOf(shown.problemBehaviorId) && (
                <div className="row">
                  <KindBadge kind="problem" />
                  <strong>{nameOf(shown.problemBehaviorId)!.name}</strong>
                  {shown.func && <span className="muted">機能: {FUNCTION_LABEL[shown.func]}</span>}
                </div>
              )}
              {shown.alternativeBehaviorId && nameOf(shown.alternativeBehaviorId) && (
                <div className="row">
                  <KindBadge kind={nameOf(shown.alternativeBehaviorId)!.kind} />
                  <strong>{nameOf(shown.alternativeBehaviorId)!.name}</strong>
                  <span className="muted">{KIND_LABEL[nameOf(shown.alternativeBehaviorId)!.kind]}</span>
                </div>
              )}
              {shown.func && <p className="hint">ヒント（{FUNCTION_LABEL[shown.func]}）: {FUNCTION_HINT[shown.func]}問題行動と同じ目的を、より簡単な行動で満たせるようにします。</p>}
            </div>
          </div>

          <div className="section">
            <div className="card stack">
              <div className="row row--between">
                <span className="label">支援目標と達成基準</span>
                <Link to="/graph" className="btn btn--sm">グラフで確認</Link>
              </div>
              {shown.goal && <p className="reinf__usage">{shown.goal}</p>}
              {shown.criteria.map((c, i) => {
                const b = nameOf(c.behaviorId);
                if (!b) return null;
                const vals = dailyMain(b, lastDays(7), rs).filter((v): v is number => v != null);
                const avg = vals.length ? Math.round((vals.reduce((a, x) => a + x, 0) / vals.length) * 10) / 10 : null;
                const met = avg != null && (c.op === 'lte' ? avg <= c.value : avg >= c.value);
                // 期限を過ぎても届いていなければ、見直しをすすめる（6.7「一定期間未達なら計画修正」）
                const overdue = !met && !!c.deadline && c.deadline < today;
                return (
                  <div key={i} className="stack">
                    <div className="row row--between today-row">
                      <span>{criterionText(c, behaviors)}</span>
                      <span className={met ? 'badge badge--owner' : 'badge badge--role'}>
                        {avg == null ? '記録なし' : `直近7日 ${mainFormat(b)(avg)} ・ ${met ? '達成' : '未達'}`}
                      </span>
                    </div>
                    {met && <span className="help">届いています。できることを広げましょう。</span>}
                    {overdue && (
                      <span className="help notice-inline">
                        期限（{formatDateJa(c.deadline!)}）を過ぎても届いていません。グラフを見て、計画を見直しましょう（目標・工夫・期限を変えるなど）。
                      </span>
                    )}
                  </div>
                );
              })}
              {shown.criteria.length === 0 && <span className="muted">達成基準はまだありません。</span>}
              <p className="help">達成基準に届いたら、できることを広げましょう。しばらく届かなければ、計画を見直しましょう。</p>
            </div>
          </div>

          <div className="section">
            <div className="card stack">
              <span className="label">支援内容</span>
              <PlanText title="先行子操作（予防）" text={shown.antecedent} />
              <PlanText title="代替行動への対応（強化）" text={shown.reinforcement} />
              <PlanText title="プロンプト（手がかり）" text={shown.prompting} />
              <PlanText title="危機時の対応（安全確保）" text={shown.crisis} />
              {shown.owner && <span className="muted">担当: {shown.owner}</span>}
            </div>
          </div>
        </>
      )}

      {latest && <SignStatus change={latest} />}
      <FbaTool />
      <PlanLinks exportable={canExport(me?.role)} />
    </div>
  );

  function SignStatus({ change }: { change: PlanChange }) {
    return (
      <div className="section">
        <div className="card stack">
          <div className="row row--between">
            <span className="label">合意（{formatShortDate(change.createdAt.slice(0, 10))} の変更）</span>
            <Link to="/plan/signoff" className="btn btn--sm">合意の画面</Link>
          </div>
          {change.signerMemberIds.map((id) => {
            const m = members.find((x) => x.id === id);
            const s = signoffs.find((x) => x.changeId === change.id && x.memberId === id);
            return (
              <div key={id} className="row row--between today-row">
                <span>{m?.displayName ?? '退会したメンバー'}{m ? `（${ROLE_LABEL[m.role]}）` : ''}</span>
                <span className={`badge ${s?.state === 'agreed' ? 'badge--owner' : s?.state === 'opinion' ? 'badge--problem' : 'badge--role'}`}>
                  {s?.state === 'agreed' ? `合意 ${formatShortDate(s.updatedAt.slice(0, 10))}` : s?.state === 'opinion' ? '意見あり' : '未確認'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

function PlanText({ title, text }: { title: string; text: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="card__title" style={{ margin: 0 }}>{title}</span>
      <p className="reinf__usage">{text || '（まだ書いていません）'}</p>
    </div>
  );
}

/** 支援者が機能分析をするときのツール（外部のサイト、決定58・90）。リンク先の内容は取り込まない */
function FbaTool() {
  return (
    <div className="section">
      <div className="card stack">
        <span className="label">機能分析のツール</span>
        <p className="help">
          井上研究室の「機能分析スクリーニングツール日本版」で、支援者が行動の働き（機能）を調べられます。結果は、計画の「機能の仮説」を考える手がかりにしてください。
        </p>
        <a className="list-item" href={FBA_LINK} target="_blank" rel="noopener noreferrer">
          機能分析スクリーニングツール日本版を開く<span aria-hidden="true">↗</span>
        </a>
        <span className="help">外部のサイトが開きます。このアプリの記録は送られません。</span>
      </div>
    </div>
  );
}

function PlanLinks({ exportable }: { exportable: boolean }) {
  return (
    <div className="section">
      <div className="card stack">
        <span className="label">支援会議と記録</span>
        <Link to="/meetings" className="list-item">支援会議メモ<span aria-hidden="true">›</span></Link>
        <Link to="/wins" className="list-item">できたこと（これまでの成果）<span aria-hidden="true">›</span></Link>
        <Link to="/restraint" className="list-item">身体拘束の記録<span aria-hidden="true">›</span></Link>
        {exportable && <Link to="/report" className="list-item">PDF レポート<span aria-hidden="true">›</span></Link>}
      </div>
    </div>
  );
}
