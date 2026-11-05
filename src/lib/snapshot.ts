/**
 * 支援会議メモ・PDF レポートに入れるグラフ（6.10、6.12）。
 * 会議メモには会議の日の時点の値を保存し、あとで記録が増えても変わらない。
 */
import type { Behavior, ChartSnapshot, PlanContent } from '../db/types';
import { buildGroups, groupTitle } from './panels';
import type { Granularity, RecordSet } from './series';
import type { Phase } from '../components/LineChart';

export function takeSnapshots(
  behaviors: Behavior[],
  rs: RecordSet,
  days: string[],
  g: Granularity,
  plan: PlanContent | null,
  phases: Phase[],
): ChartSnapshot[] {
  const from = days[0];
  const to = days[days.length - 1];
  const ph = phases.filter((p) => p.date >= from && p.date <= to);
  return buildGroups(behaviors, rs, days, g, plan).flatMap((grp) =>
    grp.panels.map((p) => ({
      title: groupTitle(grp.behaviors),
      caption: p.caption,
      granularity: g,
      unit: p.unit,
      fixedMin: p.fixedMin,
      fixedMax: p.fixedMax,
      dates: p.dates,
      lines: p.lines.map((l) => ({ name: l.name, color: l.color, dashed: !!l.dashed, values: l.values })),
      phases: ph,
      targets: p.targets,
    })),
  );
}
