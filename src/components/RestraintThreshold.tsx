/**
 * 身体拘束の記録で、支援計画の見直しをすすめる目安（6.8、決定64・74）。
 * 初期値はなく、管理者・副管理者が期間（1週間・1か月・3か月）と件数（0件から）を決める。0件なら1件でも記録されたらすすめる。
 * 変更は監査ログに残る。拘束記録の画面とチームの設定の両方から開く。
 */
import { useState } from 'react';
import { useApp } from '../state';
import { canEditTeamSettings, updateTeamSetting } from '../db/repo';
import { RESTRAINT_PERIOD_LABEL, type RestraintPeriod } from '../db/types';
import { Chip } from './ui';

export default function RestraintThreshold() {
  const { person, me, userId, restraintPeriod, restraintCount } = useApp();
  const [period, setPeriod] = useState<RestraintPeriod>(restraintPeriod ?? 'month');
  const [count, setCount] = useState(restraintCount ?? 0);
  if (!person || !userId) return null;
  const editable = canEditTeamSettings(me?.role);
  const set = restraintPeriod != null && restraintCount != null;
  const dirty = !set || period !== restraintPeriod || count !== restraintCount;

  return (
    <div className="stack">
      <span className="label">見直しをすすめる目安</span>
      {set ? (
        <p className="help">いまの目安: {RESTRAINT_PERIOD_LABEL[restraintPeriod!]}に {restraintCount}件を超えたら{restraintCount === 0 ? '（1件でも記録されたら）' : ''}</p>
      ) : (
        <p className="help notice-inline">目安が未設定です。決めるまでは件数だけを出し、見直しはすすめません。</p>
      )}
      {editable ? (
        <>
          <div className="chips">
            {(Object.keys(RESTRAINT_PERIOD_LABEL) as RestraintPeriod[]).map((p) => (
              <Chip key={p} on={period === p} onClick={() => setPeriod(p)}>{RESTRAINT_PERIOD_LABEL[p]}</Chip>
            ))}
          </div>
          <div className="row">
            <span className="label">に</span>
            <button type="button" className="btn btn--sm" aria-label="1件減らす" disabled={count <= 0} onClick={() => setCount(count - 1)}>−</button>
            <strong style={{ minWidth: 24, textAlign: 'center' }}>{count}</strong>
            <button type="button" className="btn btn--sm" aria-label="1件増やす" onClick={() => setCount(count + 1)}>＋</button>
            <span className="label">件を超えたら</span>
          </div>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            style={{ alignSelf: 'flex-start' }}
            disabled={!dirty}
            onClick={() => updateTeamSetting(person.id, { restraintPeriod: period, restraintCount: count }, userId)}
          >
            {set ? '目安を変える' : 'この目安にする'}
          </button>
          <p className="help">期間と件数は自由に決められます。0件にすると、1件でも記録されたら見直しをすすめます。変更は履歴に残ります。</p>
        </>
      ) : (
        <p className="help">目安を決めるのは管理者・副管理者です。</p>
      )}
    </div>
  );
}
