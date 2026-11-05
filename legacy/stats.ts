/**
 * 集計。
 * - 未記録と 0 回を区別する: 記録あり→件数、記録なし+本日なし→0、どちらもなし→null（線を切る）
 * - 観察セッションがあれば「1時間あたりの率」を計算する
 */
import type { Event, NoEventDay, Session } from '../db/types';
import { dateRange, localDateOf, parseLocalDate, startOfMonth, startOfWeek } from './date';

export type Granularity = 'day' | 'week' | 'month';
export type Metric = 'count' | 'rate' | 'duration' | 'intensity';

export interface Point {
  key: string; // 期間の先頭日 (YYYY-MM-DD)
  value: number | null; // null = 未記録
  count: number;
  observedHours: number | null; // null = セッションなし
  avgIntensity: number | null;
  durationSec: number;
}

/** セッションが指定日（ローカル）に含まれる時間（時間単位） */
export function sessionHoursOnDate(s: Session, date: string, now = new Date()): number {
  const dayStart = parseLocalDate(date).getTime();
  const dayEnd = dayStart + 24 * 3600 * 1000;
  const st = new Date(s.startedAt).getTime();
  const en = s.endedAt ? new Date(s.endedAt).getTime() : now.getTime();
  const a = Math.max(st, dayStart);
  const b = Math.min(en, dayEnd);
  return b > a ? (b - a) / 3600000 : 0;
}

export function observedHoursByDate(sessions: Session[], dates: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dates) {
    let h = 0;
    for (const s of sessions) {
      if (s.deletedAt) continue;
      h += sessionHoursOnDate(s, d);
    }
    if (h > 0) map.set(d, h);
  }
  return map;
}

export function periodKey(date: string, g: Granularity): string {
  if (g === 'week') return startOfWeek(date);
  if (g === 'month') return startOfMonth(date);
  return date;
}

/**
 * 1 行動の時系列を作る。
 * events / noEventDays はその行動のもの（削除済みは除外済み）であること。
 */
export function seriesFor(
  behaviorId: string,
  events: Event[],
  noEventDays: NoEventDay[],
  sessions: Session[],
  from: string,
  to: string,
  g: Granularity,
  metric: Metric,
): Point[] {
  const days = dateRange(from, to);
  const hours = observedHoursByDate(sessions, days);
  const noEvent = new Set(noEventDays.filter((n) => n.behaviorId === behaviorId && !n.deletedAt).map((n) => n.localDate));

  // 日ごとに集計
  const daily = new Map<string, { count: number; dur: number; intSum: number; intN: number; recorded: boolean }>();
  for (const d of days) daily.set(d, { count: 0, dur: 0, intSum: 0, intN: 0, recorded: noEvent.has(d) });
  for (const e of events) {
    if (e.behaviorId !== behaviorId || e.deletedAt) continue;
    const d = e.localDate || localDateOf(e.occurredAt);
    const cell = daily.get(d);
    if (!cell) continue;
    cell.count += e.count;
    cell.dur += e.durationSec ?? 0;
    if (e.intensity != null) {
      cell.intSum += e.intensity;
      cell.intN += 1;
    }
    cell.recorded = true;
  }

  // 粒度ごとにまとめる
  const buckets = new Map<string, { count: number; dur: number; intSum: number; intN: number; recorded: boolean; hours: number; hasHours: boolean }>();
  for (const d of days) {
    const k = periodKey(d, g);
    const b = buckets.get(k) ?? { count: 0, dur: 0, intSum: 0, intN: 0, recorded: false, hours: 0, hasHours: false };
    const c = daily.get(d)!;
    b.count += c.count;
    b.dur += c.dur;
    b.intSum += c.intSum;
    b.intN += c.intN;
    b.recorded = b.recorded || c.recorded;
    const h = hours.get(d);
    if (h) {
      b.hours += h;
      b.hasHours = true;
    }
    buckets.set(k, b);
  }

  return Array.from(buckets.entries()).map(([key, b]) => {
    const observedHours = b.hasHours ? b.hours : null;
    const avgIntensity = b.intN ? b.intSum / b.intN : null;
    let value: number | null;
    if (!b.recorded) value = null;
    else if (metric === 'count') value = b.count;
    else if (metric === 'rate') value = observedHours ? b.count / observedHours : null;
    else if (metric === 'duration') value = b.dur / 60; // 分
    else value = avgIntensity;
    return { key, value, count: b.count, observedHours, avgIntensity, durationSec: b.dur };
  });
}

/** 期間の前半・後半の平均（「まとめ」表示用） */
export function halves(points: Point[]): { first: number | null; second: number | null } {
  const vals = points.filter((p) => p.value != null);
  if (vals.length < 2) return { first: vals[0]?.value ?? null, second: null };
  const mid = Math.ceil(vals.length / 2);
  const avg = (ps: Point[]) => ps.reduce((a, p) => a + (p.value ?? 0), 0) / ps.length;
  return { first: avg(vals.slice(0, mid)), second: avg(vals.slice(mid)) };
}
