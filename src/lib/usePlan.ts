/** 支援計画と変更履歴・合意を読み込む（6.7）。グラフの縦線と達成基準の線にも使う */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { phaseLines } from '../db/phase2';
import type { PlanChange, PlanSignoff, SupportPlan } from '../db/types';

export interface PlanData {
  plan: SupportPlan | null;
  changes: PlanChange[]; // 新しい順
  signoffs: PlanSignoff[];
  phases: { date: string; label: string }[];
}

export function usePlanData(personId: string | undefined): PlanData | undefined {
  return useLiveQuery(async () => {
    if (!personId) return undefined;
    const [plans, changes, signoffs] = await Promise.all([
      db.supportPlans.where('personId').equals(personId).filter((p) => !p.deletedAt).toArray(),
      db.planChanges.where('personId').equals(personId).toArray(),
      db.planSignoffs.where('personId').equals(personId).filter((s) => !s.deletedAt).toArray(),
    ]);
    changes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { plan: plans[0] ?? null, changes, signoffs, phases: phaseLines(changes) };
  }, [personId]);
}
