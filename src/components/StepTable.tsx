/**
 * 「ステップ × 回」の表（6.15）。どのステップで手助けが要っているかを見る。
 * いまの版のチェックだけを、古い回から右へ並べる（直近 12 回）。マスは色と文字の両方で段階を示す。
 */
import type { StepCheck, StepResult, TaskAnalysis } from '../db/types';
import { PROMPTS, RESULT_LABEL, independentPct, masteryText, scoredChecks } from '../lib/tasks';
import { formatShortDate } from '../lib/date';

const SHORT: Record<StepResult, string> = {
  ...(Object.fromEntries(PROMPTS.map((p) => [p.key, p.short])) as Record<(typeof PROMPTS)[number]['key'], string>),
  stopped: '×',
  na: '－',
};

export function StepTable({ task, checks }: { task: TaskAnalysis; checks: StepCheck[] }) {
  const all = scoredChecks(checks.filter((c) => c.behaviorId === task.behaviorId));
  const current = checks
    .filter((c) => !c.deletedAt && c.taskId === task.id && c.version === task.version)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .slice(-12);
  const m = masteryText(all.map((x) => x.pct), task.masteryPct, task.masteryRuns);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="muted">ステップ × 回（いまの手順・第{task.version}版）</span>
      <span className={m.reached ? 'graph-change' : 'help'} style={{ margin: 0 }}>{m.reached ? <strong>{m.text}</strong> : m.text}</span>
      {current.length === 0 ? (
        <p className="help" style={{ margin: 0 }}>いまの手順のチェックはまだありません。</p>
      ) : (
        <div className="step-table-wrap">
          <table className="step-table">
            <thead>
              <tr>
                <th scope="col">ステップ</th>
                {current.map((c) => <th key={c.id} scope="col">{formatShortDate(c.localDate)}</th>)}
              </tr>
            </thead>
            <tbody>
              {task.steps.map((s, i) => (
                <tr key={i}>
                  <th scope="row" title={s.action}>{i + 1}. {s.action}</th>
                  {current.map((c) => {
                    const r = c.results[i];
                    return (
                      <td key={c.id} className={`step-cell step-cell--${r ?? 'na'}`} aria-label={r ? RESULT_LABEL[r] : '記録なし'}>
                        {r ? SHORT[r] : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="step-table__sum">
                <th scope="row">一人でできた割合</th>
                {current.map((c) => {
                  const p = independentPct(c);
                  return <td key={c.id}>{p === null ? '－' : `${p}%`}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="help" style={{ margin: 0 }}>一人＝一人で、声＝声かけ・指さし、手本、手＝手を添えて、×＝途中でやめた、－＝機会なし。</p>
    </div>
  );
}
