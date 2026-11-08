/**
 * 手順（課題分析）と手順のチェックの保存（6.15、決定123〜127）。変更は監査ログに残し、削除は論理削除。
 * 権限の判定はサーバーの RLS が正。ここは画面の出し分け用。
 */
import { db } from './db';
import { audit, base, canRecord, canUndoEvent } from './repo';
import { fixedId } from '../lib/id';
import { localDateOf, nowISO } from '../lib/date';
import { DEFAULT_TASK_NOTE } from '../lib/tasks';
import type { Behavior, ChainOrder, Role, StepCheck, StepResult, TaskAnalysis, TaskStep } from './types';

/** 手順を作る・変える、チェックする: 支援者以上（決定127） */
export const canEditTask = canRecord;
export const canCheckTask = canRecord;
/** 手順を付けられる行動: 望ましい行動・代替行動だけ */
export const taskAllowed = (b: Pick<Behavior, 'kind'>) => b.kind === 'desirable' || b.kind === 'alternative';

export async function getTask(behaviorId: string): Promise<TaskAnalysis | undefined> {
  const list = await db.taskAnalyses.where('behaviorId').equals(behaviorId).filter((t) => !t.deletedAt).toArray();
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export interface TaskInput {
  steps: TaskStep[];
  chain: ChainOrder;
  masteryPct: number;
  masteryRuns: number;
  note: string;
}

export const emptyTask = (): TaskInput => ({
  steps: [
    { action: '', support: '' },
    { action: '', support: '' },
    { action: '', support: '' },
  ],
  chain: 'total',
  masteryPct: 100,
  masteryRuns: 3,
  note: DEFAULT_TASK_NOTE,
});

const sameSteps = (a: TaskStep[], b: TaskStep[]) => JSON.stringify(a.map((s) => s.action)) === JSON.stringify(b.map((s) => s.action));

/** 手順を保存する。ステップ（本人の動き）が変わったときだけ版を上げる。id は行動から決める */
export async function saveTask(b: Behavior, input: TaskInput, actorId: string): Promise<TaskAnalysis> {
  const steps = input.steps.map((s) => ({ action: s.action.trim(), support: s.support.trim() })).filter((s) => s.action);
  const id = await fixedId(`task:${b.id}`);
  return db.transaction('rw', [db.taskAnalyses, db.auditLogs], async () => {
    const before = await db.taskAnalyses.get(id);
    const t = nowISO();
    if (before) {
      const version = before.deletedAt ? before.version + 1 : sameSteps(before.steps, steps) ? before.version : before.version + 1;
      const after: TaskAnalysis = { ...before, ...input, steps, version, createdBy: actorId, updatedAt: t, deletedAt: null };
      await db.taskAnalyses.put(after);
      await audit(b.personId, 'taskAnalysis', id, 'update', actorId, before, after);
      return after;
    }
    const rec: TaskAnalysis = { ...base(), id, personId: b.personId, behaviorId: b.id, version: 1, ...input, steps, createdBy: actorId };
    await db.taskAnalyses.add(rec);
    await audit(b.personId, 'taskAnalysis', id, 'create', actorId, null, rec);
    return rec;
  });
}

/** 手順をやめる（論理削除）。チェックは残る */
export async function removeTask(id: string, actorId: string) {
  const before = await db.taskAnalyses.get(id);
  if (!before || before.deletedAt) return;
  const t = nowISO();
  const after = { ...before, deletedAt: t, updatedAt: t, createdBy: actorId };
  await db.taskAnalyses.put(after);
  await audit(before.personId, 'taskAnalysis', id, 'delete', actorId, before, after);
}

export async function createStepCheck(
  task: TaskAnalysis,
  input: { results: StepResult[]; stopped: boolean; note: string; placeName: string | null; occurredAt?: string },
  actorId: string,
): Promise<StepCheck> {
  const occurredAt = input.occurredAt ?? nowISO();
  const c: StepCheck = {
    ...base(),
    personId: task.personId,
    behaviorId: task.behaviorId,
    taskId: task.id,
    version: task.version,
    steps: task.steps.map((s) => s.action),
    results: input.results,
    stopped: input.stopped,
    occurredAt,
    localDate: localDateOf(occurredAt),
    placeName: input.placeName,
    activity: null,
    note: input.note.trim(),
    recorderId: actorId,
  };
  await db.stepChecks.add(c);
  await audit(c.personId, 'stepCheck', c.id, 'create', actorId, null, c);
  return c;
}

export async function stepChecks(personId: string, behaviorId?: string): Promise<StepCheck[]> {
  return (await db.stepChecks.where('personId').equals(personId).toArray()).filter((c) => !c.deletedAt && (!behaviorId || c.behaviorId === behaviorId));
}

/** 取消バッジ: その行動の最後のチェックを1件（−1 と同じ決まり。6.3.1・6.3.5） */
export async function lastUndoableCheck(personId: string, behaviorId: string, role: Role | undefined, actorId: string): Promise<StepCheck | null> {
  const list = (await stepChecks(personId, behaviorId))
    .filter((c) => canUndoEvent(role, c, actorId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return list[0] ?? null;
}

export async function undoStepCheck(id: string, actorId: string): Promise<StepCheck | null> {
  const before = await db.stepChecks.get(id);
  if (!before || before.deletedAt) return null;
  const t = nowISO();
  const after = { ...before, deletedAt: t, updatedAt: t };
  await db.stepChecks.put(after);
  await audit(before.personId, 'stepCheck', id, 'delete', actorId, before, after);
  return before;
}

export async function restoreStepCheck(id: string, actorId: string) {
  const before = await db.stepChecks.get(id);
  if (!before || !before.deletedAt) return;
  const after = { ...before, deletedAt: null, updatedAt: nowISO() };
  await db.stepChecks.put(after);
  await audit(before.personId, 'stepCheck', id, 'restore', actorId, before, after);
}
