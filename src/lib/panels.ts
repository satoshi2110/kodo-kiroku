/**
 * グラフのパネルの組み立て（6.4.1、決定24・31・33）。グラフ画面・支援会議メモ・PDF レポートで共通に使う。
 * - 問題行動とその代替行動は同じ枠に入れ、見出しに両方の名前を書く
 * - 同じ測り方なら1つのパネルに重ね、違う測り方なら上下に並べて日付をそろえる
 * - 強度を付けた行動は、強度のパネルを別に出す（決定24）
 * - 達成基準（実施中の支援計画）は横線、条件変更は縦線
 * - rate = 頻度を1時間あたりの回数で見る（6.4.1）。達成基準は1日の回数で決めているので、そのときは横線を出さない
 * - together = 「まとめて」（グラフ画面だけ。決定112・113）。
 *   1. 代替行動のある問題行動は、その代替行動とだけ組にする（いつもと同じ）
 *   2. 代替行動のない問題行動どうしは、測り方と単位が同じなら1つのグラフにする
 *   3. 望ましい行動（代替行動でないもの）どうしも同じ
 *   強度は段階の数が同じものを重ねる。色だけでなく点の形でも区別する
 */
import { METHOD_LABEL, type Behavior, type BehaviorRevision, type PlanContent } from '../db/types';
import { localDateOf } from './date';
import { bucketize, canRate, dailyIntensity, dailyMain, dailyRate, dailySleepHours, mainFormat, mainUnit, type Granularity, type RecordSet } from './series';
import type { ChartLine, Marker, Phase, Target } from '../components/LineChart';

/** 色覚の多様性に配慮した色（オレンジと青）。印刷でも線の形（実線・点線）で区別できる */
export const PROBLEM_COLOR = '#b4502d';
export const GOOD_COLORS = ['#1a6a86', '#1f7a55', '#6b4fa0'];
/** まとめて重ねるときの問題行動の色（オレンジ系・赤紫・茶）。点の形も変える */
const PROBLEM_COLORS = [PROBLEM_COLOR, '#a3365e', '#8a5a12'];
const PROBLEM_MARKERS: Marker[] = ['circle', 'triangle', 'diamond'];
const GOOD_MARKERS: Marker[] = ['square', 'diamond', 'triangle'];

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

/**
 * 「まとめて」の組（決定113）。代替行動のある問題行動はその組のまま。
 * 残りの問題行動どうし・問題行動でない行動どうしは、測り方と単位が同じものを1つの組にする
 */
function joinBehaviors(behaviors: Behavior[], plan: PlanContent | null, unitOf: (b: Behavior) => string): Behavior[][] {
  const pairs: Behavior[][] = [];
  const rest = new Map<string, Behavior[]>();
  for (const grp of groupBehaviors(behaviors, plan)) {
    if (grp.length > 1) {
      pairs.push(grp);
      continue;
    }
    const b = grp[0];
    const k = `${b.kind === 'problem' ? 'p' : 'g'}|${b.method}|${unitOf(b)}`;
    rest.set(k, [...(rest.get(k) ?? []), b]);
  }
  const solo = [...rest.entries()];
  // 並びは、組 → 問題行動 → それ以外
  return [...pairs, ...solo.filter(([k]) => k.startsWith('p|')).map(([, v]) => v), ...solo.filter(([k]) => k.startsWith('g|')).map(([, v]) => v)];
}

/**
 * 問題行動ごとに、その代替行動を同じ組にする。代替元のない行動は1つずつ。
 * 支援計画で「標的とする問題行動」と「代替行動」に選んだ組をいちばん優先する（決定114）。
 * 計画の代替行動は、行動の設定（どの問題行動の代わりか）が別でも、計画の問題行動と組にする
 */
export function groupBehaviors(behaviors: Behavior[], plan: PlanContent | null = null): Behavior[][] {
  const planPair = plan?.problemBehaviorId && plan.alternativeBehaviorId && behaviors.some((b) => b.id === plan.problemBehaviorId && b.kind === 'problem')
    ? { problem: plan.problemBehaviorId, alt: plan.alternativeBehaviorId }
    : null;
  const partnerOf = (b: Behavior) => (b.kind === 'problem' ? null : planPair && b.id === planPair.alt ? planPair.problem : b.replacesBehaviorId);
  const used = new Set<string>();
  const groups: Behavior[][] = [];
  for (const p of behaviors.filter((b) => b.kind === 'problem')) {
    const g = [p, ...behaviors.filter((b) => partnerOf(b) === p.id)];
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
  together = false,
): GroupSpec[] {
  const sets = together ? joinBehaviors(behaviors, plan, (b) => mainUnit(b, g, rate)) : groupBehaviors(behaviors, plan);
  return sets.map((members) => {
    let good = 0;
    let bad = 0;
    const colors = new Map<string, string>();
    const markers = new Map<string, Marker>();
    for (const b of members) {
      if (b.kind === 'problem') {
        const i = together ? bad++ : 0;
        colors.set(b.id, together ? PROBLEM_COLORS[i % PROBLEM_COLORS.length] : colorOf(b, 0));
        if (together) markers.set(b.id, PROBLEM_MARKERS[i % PROBLEM_MARKERS.length]);
      } else {
        const i = good++;
        colors.set(b.id, colorOf(b, i));
        if (together) markers.set(b.id, GOOD_MARKERS[i % GOOD_MARKERS.length]);
      }
    }
    const line = (b: Behavior, values: (number | null)[]): ChartLine => ({
      name: b.name,
      color: colors.get(b.id)!,
      dashed: b.kind !== 'problem',
      marker: markers.get(b.id),
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
    // 組の中で測り方と単位がそろっていれば1つに重ね、違えば上下に並べる（決定33）
    const sameMethod = members.every((b) => b.method === members[0].method && mainUnit(b, g, rate) === mainUnit(members[0], g, rate));
    if (sameMethod) panels.push(main(members));
    else for (const b of members) panels.push(main([b]));
    const withInt = members.filter((x) => x.intensity);
    const intSets = together
      ? [...new Set(withInt.map((b) => b.intensity!.levels))].map((lv) => withInt.filter((b) => b.intensity!.levels === lv))
      : withInt.map((b) => [b]);
    for (const list of intSets) {
      const levels = list[0].intensity!.levels;
      const series = list.map((b) => bucketize(days, dailyIntensity(b, days, rs), g));
      panels.push({
        key: `int-${list.map((b) => b.id).join('-')}`,
        caption: list.length > 1 ? '強度（1日の平均。未評価は除く）' : `${list[0].name} の強度（1日の平均。未評価は除く）`,
        dates: series[0].dates,
        lines: list.map((b, i) => line(b, series[i].values)),
        unit: `平均の強度（1〜${levels}）`,
        format: (v) => String(v),
        fixedMin: 1,
        fixedMax: levels,
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
    lines: [{ name: '睡眠', color: '#4f6670', values: s.values }],
    unit: g === 'day' ? '睡眠時間（時間）' : '睡眠時間の平均（時間）',
    format: (v) => `${v}時間`,
    targets: [],
  };
}

export function groupTitle(members: Behavior[]): string {
  return members.map((b) => b.name).join(' と ');
}

export type { Phase };

/**
 * 変化のまとめ（ワイヤーフレーム 3 の「5.8 → 1.9 回」）。1日ごとの値の平均を、前と後で比べる。
 * 【暫定】（2026-11-07 の試作）条件の変更（支援計画が実施中になった日）があれば、前と後が3日以上ある最後の変更の前と後。
 * なければ、最初の7日と最近の7日（14日以上あるときだけ）。値のない日（未記録）は平均に入れない。
 */
/**
 * この枠の行動の、定義の変更の縦線（6.2「グラフに注記を入れる」）。同じ日に何回変えても1本。
 * 変えた日から後を「変えたあと」として線を切る。
 */
export function revisionPhases(revisions: BehaviorRevision[], behaviors: Behavior[]): Phase[] {
  const ids = new Set(behaviors.map((b) => b.id));
  const days = new Set(revisions.filter((r) => !r.deletedAt && ids.has(r.behaviorId)).map((r) => localDateOf(r.createdAt)));
  return [...days].sort().map((date) => ({ date, label: '定義の変更', kind: 'definition' as const }));
}

/** 計画の変更と、この枠の定義の変更を合わせた縦線（日付順。同じ日なら計画の変更を先に） */
export function phasesFor(planPhases: Phase[], revisions: BehaviorRevision[], behaviors: Behavior[]): Phase[] {
  const rev = revisionPhases(revisions, behaviors).filter((r) => !planPhases.some((p) => p.date === r.date && p.label === r.label));
  return [...planPhases, ...rev].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'definition' ? 1 : 0) - (b.kind === 'definition' ? 1 : 0));
}

/**
 * 変化のまとめ。比べる区切りは計画の変更（なければ最初と最近の7日）。
 * 比べている期間の中で行動の定義を変えていたら、そのことを書き足す（数え方が変わっているので、そのまま比べられない）。
 */
export function changeSummary(p: PanelSpec, allPhases: Phase[]): { label: string; text: string } | null {
  const phases = allPhases.filter((x) => x.kind !== 'definition');
  const revDays = allPhases.filter((x) => x.kind === 'definition').map((x) => x.date);
  const d = p.dates;
  if (d.length < 2) return null;
  // 前と後がどちらも3日以上ある変更のうち、いちばん新しいもの（変えたばかりの日は、まだ比べられない）
  const phase = [...phases]
    .filter((x) => d.filter((y) => y < x.date).length >= 3 && d.filter((y) => y >= x.date).length >= 3)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  let before: number[];
  let after: number[];
  let label: string;
  if (phase) {
    before = d.flatMap((x, i) => (x < phase.date ? [i] : []));
    after = d.flatMap((x, i) => (x >= phase.date ? [i] : []));
    label = `${phase.label}（${Number(phase.date.slice(5, 7))}/${Number(phase.date.slice(8, 10))}）の前 → 後の平均`;
  } else if (d.length >= 14) {
    before = d.slice(0, 7).map((_, i) => i);
    after = d.slice(-7).map((_, i) => d.length - 7 + i);
    label = '最初の7日 → 最近の7日の平均';
  } else return null;
  const avg = (vals: (number | null)[], idx: number[]) => {
    const v = idx.map((i) => vals[i]).filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const parts = p.lines.map((l) => {
    const a = avg(l.values, before);
    const b = avg(l.values, after);
    const name = p.lines.length > 1 ? `${l.name} ` : '';
    return `${name}${a == null ? '—' : p.format(a)} → ${b == null ? '—' : p.format(b)}`;
  });
  const from = d[before[0]];
  const to = d[after[after.length - 1]];
  const revised = revDays.some((x) => x > from && x <= to);
  return { label: revised ? `${label}・間に定義の変更あり` : label, text: parts.join(' ／ ') };
}
