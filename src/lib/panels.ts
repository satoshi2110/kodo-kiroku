/**
 * グラフのパネルの組み立て（6.4.1、決定24・31・33）。グラフ画面・支援会議メモ・PDF レポートで共通に使う。
 * - 問題行動とその代替行動は同じ枠に入れ、見出しに両方の名前を書く
 * - 同じ測り方なら1つのパネルに重ね、違う測り方なら上下に並べて日付をそろえる
 * - 強度を付けた行動は、強度のパネルを別に出す（決定24）
 * - 達成基準（実施中の支援計画）は横線、条件変更は縦線
 * - rate = 頻度を1時間あたりの回数で見る（6.4.1）。達成基準は1日の回数で決めているので、そのときは横線を出さない
 */
import { METHOD_LABEL, type Behavior, type PlanContent } from '../db/types';
import { bucketize, canRate, dailyIntensity, dailyMain, dailyRate, dailySleepHours, mainFormat, mainUnit, type Granularity, type RecordSet } from './series';
import type { ChartLine, Phase, Target } from '../components/LineChart';

/** 色覚の多様性に配慮した色（オレンジと青）。印刷でも線の形（実線・点線）で区別できる */
export const PROBLEM_COLOR = '#c2410c';
export const GOOD_COLORS = ['#1d4ed8', '#047857', '#6d28d9'];

export interface PanelSpec {
  key: string;
  caption: string; // パネルの上に小さく書く（測り方と単位）
  dates: string[];
  lines: ChartLine[];
  unit: string;
  format: (v: number) => string;
  tickFormat?: (v: number) => string;
  fixedMax?: number;
  fixedMin?: number;
  targets: Target[];
}

export interface GroupSpec {
  key: string;
  behaviors: Behavior[];
  panels: PanelSpec[];
}

function colorOf(b: Behavior, goodIndex: number) {
  return b.kind === 'problem' ? PROBLEM_COLOR : GOOD_COLORS[goodIndex % GOOD_COLORS.length];
}

/** 問題行動ごとに、その代替行動を同じ組にする。代替元のない行動は1つずつ */
export function groupBehaviors(behaviors: Behavior[]): Behavior[][] {
  const used = new Set<string>();
  const groups: Behavior[][] = [];
  for (const p of behaviors.filter((b) => b.kind === 'problem')) {
    const g = [p, ...behaviors.filter((b) => b.replacesBehaviorId === p.id)];
    g.forEach((b) => used.add(b.id));
    groups.push(g);
  }
  for (const b of behaviors) if (!used.has(b.id)) groups.push([b]);
  return groups;
}

export function buildGroups(
  behaviors: Behavior[],
  rs: RecordSet,
  days: string[],
  g: Granularity,
  plan: PlanContent | null,
  rate = false,
): GroupSpec[] {
  return groupBehaviors(behaviors).map((members) => {
    let good = 0;
    const colors = new Map(members.map((b) => [b.id, colorOf(b, b.kind === 'problem' ? 0 : good++)]));
    const line = (b: Behavior, values: (number | null)[]): ChartLine => ({
      name: b.name,
      color: colors.get(b.id)!,
      dashed: b.kind !== 'problem',
      values,
    });
    const targetsFor = (list: Behavior[]): Target[] =>
      (plan?.criteria ?? [])
        .filter((c) => list.some((b) => b.id === c.behaviorId))
        .map((c) => {
          const b = list.find((x) => x.id === c.behaviorId)!;
          return { value: c.value, label: `目標 ${mainFormat(b)(c.value)}${c.op === 'lte' ? '以下' : '以上'}`, color: colors.get(b.id)! };
        });
    const main = (list: Behavior[]): PanelSpec => {
      const b0 = list[0];
      const perHour = rate && canRate(b0);
      const series = list.map((b) => bucketize(days, (perHour ? dailyRate : dailyMain)(b, days, rs), g));
      const ratio = b0.method === 'interval' || b0.method === 'sampling';
      return {
        key: `main-${list.map((b) => b.id).join('-')}`,
        caption: list.length > 1 ? `${METHOD_LABEL[b0.method]}` : `${b0.name} ・ ${METHOD_LABEL[b0.method]}`,
        dates: series[0].dates,
        lines: list.map((b, i) => line(b, series[i].values)),
        unit: mainUnit(b0, g, rate),
        format: mainFormat(b0, rate),
        tickFormat: perHour ? (v) => String(v) : undefined, // 「回/時」は縦軸の名前に書いてある
        fixedMax: ratio ? 100 : undefined,
        targets: perHour ? [] : targetsFor(list),
      };
    };
    const panels: PanelSpec[] = [];
    const sameMethod = members.every((b) => b.method === members[0].method && mainUnit(b, g, rate) === mainUnit(members[0], g, rate));
    if (sameMethod) panels.push(main(members));
    else for (const b of members) panels.push(main([b]));
    for (const b of members.filter((x) => x.intensity)) {
      const s = bucketize(days, dailyIntensity(b, days, rs), g);
      panels.push({
        key: `int-${b.id}`,
        caption: `${b.name} の強度（1日の平均。未評価は除く）`,
        dates: s.dates,
        lines: [line(b, s.values)],
        unit: `平均の強度（1〜${b.intensity!.levels}）`,
        format: (v) => String(v),
        fixedMin: 1,
        fixedMax: b.intensity!.levels,
        targets: [],
      });
    }
    return { key: members.map((b) => b.id).join('-'), behaviors: members, panels };
  });
}

/** 睡眠時間のパネル（6.3.4） */
export function sleepPanel(rs: RecordSet, days: string[], g: Granularity): PanelSpec {
  const s = bucketize(days, dailySleepHours(days, rs), g);
  return {
    key: 'sleep',
    caption: '睡眠 ・ 起きた日ごと',
    dates: s.dates,
    lines: [{ name: '睡眠', color: '#475569', values: s.values }],
    unit: g === 'day' ? '睡眠時間（時間）' : '睡眠時間の平均（時間）',
    format: (v) => `${v}時間`,
    targets: [],
  };
}

export function groupTitle(members: Behavior[]): string {
  return members.map((b) => b.name).join(' と ');
}

export type { Phase };
