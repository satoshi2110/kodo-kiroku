/**
 * 手順（課題分析）の編集（6.15）。望ましい行動・代替行動に付ける。作る・変えるのは支援者以上（決定127）。
 * ステップ（本人の動き）を変えると版が上がり、古いチェックは古いステップ文のまま残る。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditTask, emptyTask, getTask, removeTask, saveTask, taskAllowed, type TaskInput } from '../db/tasks';
import { useApp } from '../state';
import { KIND_LABEL, type Behavior, type ChainOrder, type TaskAnalysis } from '../db/types';
import { ACTION_MAX, CHAIN_LABEL, DEFAULT_TASK_NOTE, PCT_MIN, RUNS_MAX, STEP_MAX, STEP_MIN, SUPPORT_MAX } from '../lib/tasks';
import { Segmented, TopBar } from '../components/ui';
import { AiUsageLine } from '../components/AiUsageLine';
import { aiTeamUsage, aiUsage, audit, base, canRunAi } from '../db/repo';
import { isMockProvider, requestAi } from '../ai/adapter';
import { buildStepsInput } from '../ai/build';
import type { StepsOutput } from '../ai/schema';

export default function TaskEditRoute() {
  const { behaviorId = '' } = useParams();
  const data = useLiveQuery(async () => ({ b: await db.behaviors.get(behaviorId), t: await getTask(behaviorId) }), [behaviorId]);
  if (data === undefined) return null;
  if (!data.b || data.b.deletedAt) return <p className="empty">行動が見つかりません。</p>;
  return <TaskEdit key={data.b.id + (data.t?.id ?? '')} b={data.b} task={data.t} />;
}

function TaskEdit({ b, task }: { b: Behavior; task: TaskAnalysis | undefined }) {
  const { me, userId, person, behaviors, members, aiEnabled } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const showAi = aiEnabled && canRunAi(me?.role) && !!person && person.id === b.personId;
  // この行動の、いちばん新しい AI の下書き（端末の中だけ）
  const draft = useLiveQuery(
    async () => {
      if (!showAi) return null;
      const list = await db.aiTaskDrafts.where('behaviorId').equals(b.id).filter((d) => !d.deletedAt).sortBy('createdAt');
      return list[list.length - 1] ?? null;
    },
    [showAi, b.id],
  );
  const usage = useLiveQuery(
    async () => (showAi && userId && person ? { me: await aiUsage(userId, me?.role), team: await aiTeamUsage(person.id) } : null),
    [showAi, userId, me?.role, person?.id, busy],
  );
  const aiLeft = !!usage && usage.me.dayLeft > 0 && usage.me.monthLeft > 0 && usage.team.dayLeft > 0 && usage.team.monthLeft > 0;
  const [form, setForm] = useState<TaskInput>(() =>
    task ? { steps: task.steps.map((s) => ({ ...s })), chain: task.chain, masteryPct: task.masteryPct, masteryRuns: task.masteryRuns, note: task.note } : emptyTask(),
  );
  const back = '/behaviors';

  if (!userId) return null;
  if (!taskAllowed(b)) return <p className="empty">手順は、望ましい行動と代替行動にだけ付けられます。</p>;
  if (!canEditTask(me?.role)) return <p className="empty">手順を作る・変えるのは、支援者以上の人です。</p>;

  const set = (patch: Partial<TaskInput>) => setForm((f) => ({ ...f, ...patch }));
  const setStep = (i: number, key: 'action' | 'support', v: string) => set({ steps: form.steps.map((s, j) => (j === i ? { ...s, [key]: v } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const steps = [...form.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    set({ steps });
  };
  const filled = form.steps.filter((s) => s.action.trim()).length;
  const ok = filled >= STEP_MIN && filled <= STEP_MAX;

  async function save() {
    await saveTask(b, form, userId!);
    nav(back, { replace: true });
  }
  async function askAi() {
    if (!person || !userId) return;
    setBusy(true);
    setAiError('');
    const input = await buildStepsInput(person, b, behaviors, members);
    const res = await requestAi({ personId: person.id, kind: 'steps', input });
    if (res.status === 'ok' && res.kind === 'steps') {
      const rec = { ...base(), personId: person.id, behaviorId: b.id, requestedBy: userId, input, output: res.output, model: res.model };
      await db.aiTaskDrafts.add(rec);
      await audit(person.id, 'aiTaskDraft', rec.id, 'create', userId, null, rec);
    } else if (res.status !== 'ok') {
      setAiError(res.message);
    }
    setBusy(false);
  }
  /** AI の案を欄に入れる。保存はしない（人が確かめて直してから保存する。6.15） */
  function applyDraft(o: StepsOutput) {
    if (filled > 0 && !confirm('いま書いてあるステップを、AI の案に置きかえますか？')) return;
    const lines = [form.note.trim() || DEFAULT_TASK_NOTE];
    if (!lines[0].includes(DEFAULT_TASK_NOTE)) lines.push(DEFAULT_TASK_NOTE);
    if (o.materials.length && !form.note.includes('準備するもの')) lines.push(`準備するもの: ${o.materials.join('、')}`);
    set({
      steps: o.steps.slice(0, STEP_MAX).map((x) => ({ action: x.action.trim().slice(0, ACTION_MAX), support: x.support.trim().slice(0, SUPPORT_MAX) })),
      chain: o.chain,
      note: lines.join('\n'),
    });
  }
  async function remove() {
    if (!task) return;
    if (!confirm('この手順をやめますか？ これまでのチェックは残ります。')) return;
    await removeTask(task.id, userId!);
    nav(back, { replace: true });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title={task ? '手順を直す' : '手順を作る'} sub={`${KIND_LABEL[b.kind]}「${b.name}」`} back={back} />
      <div className="section stack">
        <p className="help">「{b.name}」を小さなステップに分けます。1つのステップには、見て分かる本人の動きを1つだけ書きます（{STEP_MIN}〜{STEP_MAX}個）。</p>

        {showAi && (
          <div className="card stack">
            <div className="ai-note">
              <strong>AI に下書きを頼めます</strong>。送るのは、名前を置きかえた行動の名前・定義と、ほかの行動の名前だけです（特性メモや「気をつけること」は送りません）。AI の回数の「提案」1回として数えます。
            </div>
            {isMockProvider && <p className="help">いまは開発用の「見本の結果」モードです。外の AI には何も送りません。</p>}
            <button type="button" className="btn btn--block" disabled={busy || !aiLeft} onClick={askAi}>
              {busy ? 'AI が下書きを作っています…' : draft ? 'AI にもう一度頼む' : 'AI に下書きを頼む'}
            </button>
            {usage && <AiUsageLine mine={usage.me} team={usage.team} />}
            {usage && !aiLeft && <p className="help">AI の回数を使い切りました。</p>}
            {aiError && <p className="ai-error" role="alert">{aiError}</p>}
            {draft && <DraftView o={draft.output} onUse={() => applyDraft(draft.output)} />}
          </div>
        )}

        {form.steps.map((s, i) => (
          <div key={i} className="card stack">
            <div className="row row--between">
              <span className="label">ステップ {i + 1}</span>
              <div className="row">
                <button type="button" className="btn btn--sm" aria-label={`ステップ ${i + 1} を上へ`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn btn--sm" aria-label={`ステップ ${i + 1} を下へ`} disabled={i === form.steps.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn btn--sm btn--quiet" disabled={form.steps.length <= STEP_MIN} onClick={() => set({ steps: form.steps.filter((_, j) => j !== i) })}>消す</button>
              </div>
            </div>
            <label className="field">
              本人の動き
              <input value={s.action} maxLength={ACTION_MAX} placeholder="例: 休憩カードを手に取る" onChange={(e) => setStep(i, 'action', e.target.value)} />
            </label>
            <label className="field">
              支援者の動き・留意点（任意）
              <input value={s.support} maxLength={SUPPORT_MAX} placeholder="例: カードは手の届く所に置いておく" onChange={(e) => setStep(i, 'support', e.target.value)} />
            </label>
          </div>
        ))}
        {form.steps.length < STEP_MAX && (
          <button type="button" className="btn btn--dashed btn--block" onClick={() => set({ steps: [...form.steps, { action: '', support: '' }] })}>
            ＋ ステップを足す
          </button>
        )}

        <div className="card stack">
          <span className="label">教える順番</span>
          <Segmented<ChainOrder>
            label="教える順番"
            value={form.chain}
            options={(['total', 'forward', 'backward'] as const).map((v) => ({ value: v, label: CHAIN_LABEL[v] }))}
            onChange={(chain) => set({ chain })}
          />
          <p className="help">
            {form.chain === 'total' && '毎回、最初から最後まで通して、必要なステップだけ手助けします。'}
            {form.chain === 'forward' && '最初のステップから1つずつ一人でできるようにし、残りは手助けします。'}
            {form.chain === 'backward' && '最後のステップから1つずつ一人でできるようにします。終わりまで自分でできた体験を毎回つくれます。'}
          </p>
        </div>

        <div className="card stack">
          <span className="label">達成の目安</span>
          <div className="grid-2">
            <label className="field">
              一人でできた割合（{PCT_MIN}〜100%）
              <input type="number" min={PCT_MIN} max={100} step={5} value={form.masteryPct} onChange={(e) => set({ masteryPct: clamp(+e.target.value, PCT_MIN, 100) })} />
            </label>
            <label className="field">
              続けて何回（1〜{RUNS_MAX}回）
              <input type="number" min={1} max={RUNS_MAX} value={form.masteryRuns} onChange={(e) => set({ masteryRuns: clamp(+e.target.value, 1, RUNS_MAX) })} />
            </label>
          </div>
          <p className="help">{form.masteryPct}% 以上の回が {form.masteryRuns} 回続いたら、達成の目安に届いたと表示します。</p>
        </div>

        <div className="card stack">
          <label className="field">
            全体の留意点（任意）
            <textarea value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </div>

        {!ok && <p className="help">本人の動きを {STEP_MIN} 個以上書いてください。</p>}
        {task && <p className="help">ステップを変えると手順の版が上がり（いまは第{task.version}版）、グラフに「手順の変更」の点線が入ります。前の内容は変更の履歴に残ります。</p>}
        <div className="grid-2">
          <button type="button" className="btn" onClick={() => nav(back)}>やめる</button>
          <button type="button" className="btn btn--primary" disabled={!ok} onClick={save}>保存</button>
        </div>
        {task && (
          <button type="button" className="btn btn--quiet btn--block" onClick={remove}>この手順をやめる</button>
        )}
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

/** AI の案（6.15）。人が「欄に入れる」を押して、直して保存するまでは手順にならない */
function DraftView({ o, onUse }: { o: StepsOutput; onUse: () => void }) {
  return (
    <div className="stack">
      <span className="label">AI の案（確かめて直してから使ってください）</span>
      <ol className="ai-list">
        {o.steps.map((s, i) => (
          <li key={i}>
            {s.action}
            {s.support && <span className="muted">（{s.support}）</span>}
          </li>
        ))}
      </ol>
      {o.hardSteps.length > 0 && <p className="help">はじめに手助けが多く要りそうな所: {o.hardSteps.join('、')}</p>}
      {o.materials.length > 0 && <p className="help">準備するもの: {o.materials.join('、')}</p>}
      <p className="help">教える順番の案: {CHAIN_LABEL[o.chain]}。{o.chainReason}</p>
      {o.cautions.length > 0 && (
        <ul className="ai-list">
          {o.cautions.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      <button type="button" className="btn btn--primary btn--block" onClick={onUse}>この案を下の欄に入れる</button>
    </div>
  );
}
