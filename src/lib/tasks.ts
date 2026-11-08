/**
 * 手順（課題分析）の計算（6.15）。画面・グラフ・計画・「できたこと」で同じ決まりを使う。
 */
import type { StepCheck, StepResult } from '../db/types';

export const STEP_MIN = 2;
export const STEP_MAX = 9;
export const ACTION_MAX = 60;
export const SUPPORT_MAX = 100;
export const PCT_MIN = 50;
export const RUNS_MAX = 10;
export const DEFAULT_TASK_NOTE = '本人が手助けを嫌がったら手を離して中断し、「途中でやめた」で記録する';

/** 4段階の手助け（決定125）。画面の言葉は決定121 の「手助け」に合わせる */
export const PROMPTS: { key: Exclude<StepResult, 'stopped' | 'na'>; label: string; short: string }[] = [
  { key: 'independent', label: '一人で', short: '一人' },
  { key: 'verbal', label: '声かけ・指さし', short: '声' },
  { key: 'model', label: '手本', short: '手本' },
  { key: 'physical', label: '手を添えて', short: '手' },
];

export const RESULT_LABEL: Record<StepResult, string> = {
  independent: '一人で',
  verbal: '声かけ・指さし',
  model: '手本',
  physical: '手を添えて',
  stopped: 'やめた',
  na: '機会なし',
};

export const CHAIN_LABEL = { total: '全部通して', forward: '前から順に', backward: '後ろから順に' } as const;

/** 一人でできた割合（%）=「一人で」の数 ÷（ステップ数 − 機会なし）。数えるステップがなければ null */
export function independentPct(c: Pick<StepCheck, 'results'>): number | null {
  const counted = c.results.filter((r) => r !== 'na');
  if (!counted.length) return null;
  return Math.round((counted.filter((r) => r === 'independent').length / counted.length) * 100);
}

/** 古い順に並べた、割合の出るチェック */
export function scoredChecks(list: StepCheck[]): { check: StepCheck; pct: number }[] {
  return list
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((check) => ({ check, pct: independentPct(check) }))
    .filter((x): x is { check: StepCheck; pct: number } => x.pct !== null);
}

/** 達成の目安（決定126）: 最後の回から数えて、pct% 以上の回が何回続いているか */
export function masteryStreak(pcts: number[], pct: number): number {
  let n = 0;
  for (let i = pcts.length - 1; i >= 0 && pcts[i] >= pct; i--) n++;
  return n;
}

export function masteryText(pcts: number[], pct: number, runs: number): { reached: boolean; text: string } {
  const n = masteryStreak(pcts, pct);
  if (n >= runs) return { reached: true, text: `達成の目安に届きました（${pct}% 以上が ${runs} 回連続）` };
  if (!pcts.length) return { reached: false, text: `まだチェックがありません（目安: ${pct}% 以上が ${runs} 回連続）` };
  return { reached: false, text: `あと ${runs - n} 回（目安: ${pct}% 以上が ${runs} 回連続）` };
}

/** 支援計画の達成基準「手順の自立率」（6.15）: 直近の回の割合と、続けて届いた回数 */
export function taskCriterionStatus(checks: StepCheck[], behaviorId: string, pct: number, runs: number) {
  const pcts = scoredChecks(checks.filter((c) => c.behaviorId === behaviorId)).map((x) => x.pct);
  const streak = masteryStreak(pcts, pct);
  return { last: pcts.length ? pcts[pcts.length - 1] : null, streak, met: streak >= runs };
}

/** 1日ごとの平均（グラフのパネル。記録のない日は入れない） */
export function dailyPct(list: StepCheck[]): Map<string, number> {
  const byDay = new Map<string, number[]>();
  for (const { check, pct } of scoredChecks(list)) byDay.set(check.localDate, [...(byDay.get(check.localDate) ?? []), pct]);
  return new Map([...byDay].map(([d, xs]) => [d, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)]));
}

/** 手順を変えた日（前のチェックと版がちがう最初の日）。グラフの「手順の変更」の点線 */
export function versionChangeDays(list: StepCheck[]): string[] {
  const out: string[] = [];
  let prev: number | null = null;
  for (const { check } of scoredChecks(list)) {
    if (prev !== null && check.version !== prev && !out.includes(check.localDate)) out.push(check.localDate);
    prev = check.version;
  }
  return out;
}
