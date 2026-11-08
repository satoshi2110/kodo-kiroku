/**
 * 身体拘束の記録（6.8、ワイヤーフレーム 17、Phase 2）。計画の画面から開く。
 * - 治療や支援の方法ではないことを画面に示す
 * - 入力は支援者以上。修正は記録した人と管理者・副管理者・支援リーダーで、修正の履歴が残る
 * - 取り消し・削除はできない（行動の記録ごと削除の対象にも入らない）。根拠・判断者・「あとの組織での検討」は後から書き足す（決定119）
 * - ホームの「身体拘束を記録する」からも、同じ入力画面を開ける（決定119）
 * - 目安の期間の件数と目安を出し、超えたら支援計画の見直しをすすめる（決定64・74）
 * - 強度3や拘束の記録が入っても、すぐの通知は出さない（決定52）。AI は方法として提案しない
 */
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canRecordRestraint, restraintPeriodFrom } from '../db/phase2';
import { formatDateTimeJa, toLocalDate } from '../lib/date';
import { RESTRAINT_PERIOD_LABEL } from '../db/types';
import { TopBar } from '../components/ui';
import RestraintThreshold from '../components/RestraintThreshold';

export function RestraintNotice() {
  return (
    <p className="restraint-notice">
      身体拘束は<strong>治療や支援の方法ではありません</strong>。本人や周りの人の命や体を守るため、ほかに方法がないときだけ、できるだけ短く行います。
      この記録は、行ったことを後から確かめ、減らしていくためのものです。
    </p>
  );
}

/** 目安の期間の件数と、見直しをすすめるか */
export function useRestraintStatus() {
  const { person, restraintPeriod, restraintCount } = useApp();
  const logs = useLiveQuery(async () => (person ? db.restraintLogs.where('personId').equals(person.id).toArray() : []), [person?.id]);
  if (!logs) return null;
  const set = restraintPeriod != null && restraintCount != null;
  const from = restraintPeriodFrom(restraintPeriod ?? 'month', toLocalDate());
  const inPeriod = logs.filter((l) => l.localDate >= from).length;
  return { logs, set, inPeriod, over: set && inPeriod > restraintCount!, label: RESTRAINT_PERIOD_LABEL[restraintPeriod ?? 'month'] };
}

export default function Restraint() {
  const { person, me, members } = useApp();
  const st = useRestraintStatus();
  if (!person || !st) return null;
  const sorted = [...st.logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';

  return (
    <div className="page page--no-nav">
      <TopBar title="身体拘束の記録" sub={`${person.displayName} ・ 緊急やむを得ない場合だけ`} back="/plan" />
      <div className="section">
        <RestraintNotice />
      </div>
      <div className="section">
        <div className="card stack">
          <span className="label">{st.label}の件数: {st.inPeriod}件{st.set ? '' : '（目安が未設定のため、件数だけを出しています）'}</span>
          {st.over && <p className="notice-inline">目安を超えました。支援計画の見直しをおすすめします（先にできる工夫・代わりの行動・危機時の対応）。</p>}
          <RestraintThreshold />
        </div>
      </div>
      {canRecordRestraint(me?.role) && (
        <div className="section">
          <Link to="/restraint/new" className="btn btn--primary btn--block">記録する</Link>
        </div>
      )}
      <div className="section">
        <div className="card">
          <h2 className="card__title">これまでの記録（{sorted.length}件）</h2>
          {sorted.length === 0 && <p className="muted">記録はありません。</p>}
          {sorted.map((l) => {
            const min = Math.max(0, Math.round((new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) / 60000));
            const allChecked = l.checks.urgency && l.checks.nonAlternative && l.checks.temporary;
            return (
              <Link key={l.id} to={`/restraint/${l.id}`} className="row row--between today-row today-row--link">
                <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span>{formatDateTimeJa(l.startedAt)} ・ {min}分{l.placeName ? ` ・ ${l.placeName}` : ''}</span>
                  <span className="muted">
                    {allChecked ? '3要件 確認済み' : '3要件の確認が足りません'} ・ 家族への報告 {l.familyReported ? 'あり' : 'まだ'}{l.review ? ' ・ 組織での検討 あり' : ''} ・ {nameOf(l.recorderId)}
                  </span>
                </span>
                <span className="today-row__go" aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      </div>
      <p className="section help">保存した記録は消せません。強度3や身体拘束の記録が入っても、すぐの通知は出しません。AI は身体拘束を提案しません。</p>
    </div>
  );
}
