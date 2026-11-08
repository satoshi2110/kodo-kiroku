/**
 * 手順のチェック（データシート、6.15）。1回のチェック = 1回の機会。ステップごとに要った手助けを4段階で付ける（決定125）。
 * 保存しても行動の +1 は作らない（決定124）。
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canCheckTask, createStepCheck, getTask, lastUndoableCheck, restoreStepCheck, stepChecks, undoStepCheck } from '../db/tasks';
import { useApp } from '../state';
import type { Behavior, StepCheck, StepResult, TaskAnalysis } from '../db/types';
import { CHAIN_LABEL, PROMPTS, independentPct, masteryText, scoredChecks } from '../lib/tasks';
import { formatDateTimeJa, formatTime, fromDateTimeLocalInput, nowISO, toDateTimeLocalInput, toLocalDate } from '../lib/date';
import { TopBar } from '../components/ui';

export default function TaskCheckRoute() {
  const { behaviorId = '' } = useParams();
  const data = useLiveQuery(async () => ({ b: await db.behaviors.get(behaviorId), t: await getTask(behaviorId) }), [behaviorId]);
  if (data === undefined) return null;
  if (!data.b || data.b.deletedAt) return <p className="empty">行動が見つかりません。</p>;
  if (!data.t) return <NoTask b={data.b} />;
  return <TaskCheck key={data.t.id + data.t.version} b={data.b} task={data.t} />;
}

function NoTask({ b }: { b: Behavior }) {
  return (
    <div className="page page--no-nav">
      <TopBar title="手順のチェック" sub={b.name} back="/" />
      <div className="section stack">
        <p className="empty">まだ手順がありません。</p>
        <Link to={`/task/${b.id}`} className="btn btn--primary btn--block">手順を作る</Link>
      </div>
    </div>
  );
}

type Answer = StepResult | null;

function TaskCheck({ b, task }: { b: Behavior; task: TaskAnalysis }) {
  const { me, userId, place } = useApp();
  const nav = useNavigate();
  const [answers, setAnswers] = useState<Answer[]>(() => task.steps.map(() => null));
  const [stopped, setStopped] = useState(false);
  const [note, setNote] = useState('');
  const [placeName, setPlaceName] = useState(place?.name ?? '');
  const [occurredAt, setOccurredAt] = useState(() => nowISO());
  const [saved, setSaved] = useState<StepCheck | null>(null);
  const history = useLiveQuery(() => stepChecks(b.personId, b.id), [b.personId, b.id]);

  if (!userId) return null;
  if (!canCheckTask(me?.role)) return <p className="empty">手順のチェックは、支援者以上の人が付けます。</p>;

  // 「途中でやめた」のときは、まだ付けていないステップを「やめた」にする（分母に残す）
  const results: Answer[] = stopped ? answers.map((a) => a ?? 'stopped') : answers;
  const done = results.every((a) => a !== null);
  const pick = (i: number, r: StepResult) => setAnswers(answers.map((a, j) => (j === i ? (a === r ? null : r) : a)));

  async function save() {
    const c = await createStepCheck(task, { results: results as StepResult[], stopped, note, placeName: placeName.trim() || null, occurredAt }, userId!);
    setSaved(c);
    window.scrollTo(0, 0);
  }

  if (saved) {
    const pcts = scoredChecks(history ?? []).map((x) => x.pct);
    const pct = independentPct(saved);
    const m = masteryText(pcts, task.masteryPct, task.masteryRuns);
    return (
      <div className="page page--no-nav">
        <TopBar title="手順のチェック" sub={b.name} back="/" />
        <div className="section stack">
          <div className="card stack" role="status">
            <span className="label">保存しました</span>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{pct === null ? '割合なし（全部「機会なし」）' : `一人でできた割合 ${pct}%`}</p>
            <p className="help" style={{ margin: 0 }}>{m.text}</p>
          </div>
          <TodayChecks b={b} history={history ?? []} />
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => { setSaved(null); setAnswers(task.steps.map(() => null)); setStopped(false); setNote(''); setOccurredAt(nowISO()); }}>もう1回</button>
            <button type="button" className="btn btn--primary" onClick={() => nav('/', { replace: true })}>ホームへ</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="手順のチェック" sub={`${b.name}（${CHAIN_LABEL[task.chain]}）`} back="/" />
      <div className="section stack">
        <TodayChecks b={b} history={history ?? []} />
        <label className="row card">
          <input type="checkbox" checked={stopped} onChange={(e) => setStopped(e.target.checked)} style={{ width: 22, height: 22 }} />
          <span>
            <span className="label">途中でやめた</span>
            <span className="help" style={{ display: 'block' }}>まだ付けていないステップは「やめた」になります</span>
          </span>
        </label>

        {task.steps.map((s, i) => {
          const a = results[i];
          return (
            <div key={i} className="card stack task-step">
              <div>
                <span className="label">ステップ {i + 1}</span>
                <p className="task-step__action">{s.action}</p>
                {s.support && <p className="help" style={{ margin: 0 }}>{s.support}</p>}
              </div>
              <div className="task-step__prompts" role="group" aria-label={`ステップ ${i + 1} の手助け`}>
                {PROMPTS.map((p) => (
                  <button key={p.key} type="button" className="btn" aria-pressed={a === p.key} onClick={() => pick(i, p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="row row--between">
                <button type="button" className="btn btn--sm btn--quiet" aria-pressed={a === 'na'} onClick={() => pick(i, 'na')}>
                  {a === 'na' ? '✓ 機会なし' : '機会なし'}
                </button>
                {a === 'stopped' && <span className="help">やめた</span>}
              </div>
            </div>
          );
        })}

        <div className="card stack">
          <label className="field">
            日時
            <input type="datetime-local" value={toDateTimeLocalInput(occurredAt)} onChange={(e) => e.target.value && setOccurredAt(fromDateTimeLocalInput(e.target.value))} />
          </label>
          <label className="field">
            場所（任意）
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} />
          </label>
          <label className="field">
            本人の様子（任意）
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        {!done && <p className="help">すべてのステップに付けてください（途中でやめたときは、上の「途中でやめた」をオンに）。</p>}
        <button type="button" className="btn btn--primary btn--block" disabled={!done} onClick={save}>保存</button>
        {task.note && <p className="help">留意点: {task.note}</p>}
      </div>
    </div>
  );
}

/** 今日のチェックの回数と、最後のチェックの取消（ホームのカードから移した。−1 と同じ決まり。6.15） */
function TodayChecks({ b, history }: { b: Behavior; history: StepCheck[] }) {
  const { me, members, userId } = useApp();
  const [undone, setUndone] = useState<StepCheck | null>(null);
  const today = toLocalDate();
  const count = history.filter((c) => c.localDate === today).length;
  if (!userId || (count === 0 && !undone)) return null;
  const when = (c: StepCheck) => (c.localDate === today ? formatTime(c.occurredAt) : formatDateTimeJa(c.occurredAt));

  async function undo() {
    const last = await lastUndoableCheck(b.personId, b.id, me?.role, userId!);
    if (!last) return window.alert('取り消せるチェックがありません');
    const others = last.recorderId !== userId;
    if (others || last.localDate !== today) {
      const who = others ? `${members.find((m) => m.userId === last.recorderId)?.displayName ?? '退会したメンバー'}がつけた、` : '';
      if (!window.confirm(`${who}${formatDateTimeJa(last.occurredAt)} の手順のチェックを取り消しますか？`)) return;
    }
    await undoStepCheck(last.id, userId!);
    setUndone(last);
  }

  return (
    <div className="card row row--between" role="status">
      {undone ? (
        <>
          <span className="help">{when(undone)} のチェックを取り消しました</span>
          <button type="button" className="btn btn--sm" onClick={async () => { await restoreStepCheck(undone.id, userId); setUndone(null); }}>元に戻す</button>
        </>
      ) : (
        <>
          <span>今日 <strong>{count}</strong> 回</span>
          <button type="button" className="btn btn--sm" onClick={undo} aria-label="最後の手順のチェックを取り消す">最後のチェックを取消</button>
        </>
      )}
    </div>
  );
}
