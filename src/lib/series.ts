/**
 * グラフ・できたこと・PDF レポート・支援会議メモで共通に使う「1日ごとの値」（6.4.1）。
 * - 頻度: 1日の回数、持続時間: 1日の合計（分）、潜時: 1日の平均（秒）、インターバル・時間サンプリング: 起きた区間の割合（%）
 * - 自動0（決定21・31）: 頻度と持続時間は、記録を付けた日（その対象者に何か記録がある日）に記録がなければ 0。
 *   保存はせず、表示のたびに計算する。「観察していなかった」にした日は 0 を付けず、線を切る。
 *   行動を作った日より前には 0 を付けない（決定111）。さかのぼって入れた記録がそれより前にあれば、その日から
 * - 週・月（【暫定】）: 値のある日の平均。記録のない日で薄まらないようにする
 * - 1時間あたりの回数（6.3.3、【暫定】）: 頻度の回数を、その日の観察時間（推定）で割る。推定できない日は出さない
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { latestSchedules, observedRatio } from '../db/repo';
import { addDays, dateRange, formatDuration, localDateOf, parseLocalDate, startOfMonth, startOfWeek, toLocalDate } from './date';
import type { Behavior, Event, Observation, RestraintLog, SleepLog, StepCheck, TaskAnalysis, UserSchedule } from '../db/types';
import { sleepMinutes } from './sleep';

export type Granularity = 'day' | 'week' | 'month';

export interface RecordSet {
  events: Event[];
  observations: Observation[];
  notObserved: Set<string>; // `${behaviorId}|${date}`
  recordedDays: Set<string>;
  sleepLogs: SleepLog[];
  restraintLogs: RestraintLog[]; // 身体拘束の記録（グラフ・時間帯の図だけに使う。記録を付けた日の判定には入れない）
  schedules: UserSchedule[]; // メンバーごとのいつもの時間（1人1つ）
  tasks: TaskAnalysis[]; // 手順（6.15。やめた手順は除く）
  stepChecks: StepCheck[]; // 手順のチェック（チェックそのものは記録を付けた日の判定には入れない。全部一人でできた回の +1 は Event として入る。決定134）
  firstDate: string; // いちばん古い記録の日（なければ今日）
}

/** 対象者の記録を読み込む（取り消した記録は除く） */
export function useRecordSet(personId: string | undefined): RecordSet | undefined {
  return useLiveQuery(async () => (personId ? loadRecordSet(personId) : undefined), [personId]);
}

export async function loadRecordSet(personId: string): Promise<RecordSet> {
  const [events, observations, marks, sleepLogs, schedules, restraintLogs, tasks, stepChecks] = await Promise.all([
    db.events.where('personId').equals(personId).filter((e) => !e.deletedAt).toArray(),
    db.observations.where('personId').equals(personId).filter((o) => !o.deletedAt && o.results.length > 0).toArray(),
    db.notObservedDays.where('personId').equals(personId).filter((x) => !x.deletedAt).toArray(),
    db.sleepLogs.where('personId').equals(personId).filter((l) => !l.deletedAt).toArray(),
    db.userSchedules.where('personId').equals(personId).toArray(),
    db.restraintLogs.where('personId').equals(personId).filter((l) => !l.deletedAt).toArray(),
    db.taskAnalyses.where('personId').equals(personId).filter((t) => !t.deletedAt).toArray(),
    db.stepChecks.where('personId').equals(personId).filter((c) => !c.deletedAt).toArray(),
  ]);
  const days = [...events, ...observations].map((x) => x.localDate);
  const today = toLocalDate();
  return {
    events,
    observations,
    notObserved: new Set(marks.map((x) => `${x.behaviorId}|${x.localDate}`)),
    recordedDays: new Set(days),
    sleepLogs,
    restraintLogs,
    schedules: latestSchedules(schedules),
    tasks,
    stepChecks,
    firstDate: [...days, ...stepChecks.map((c) => c.localDate)].reduce((m, d) => (d < m ? d : m), today),
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((s, v) => s + v, 0) / xs.length) : null);

export const isRatio = (b: Behavior) => b.method === 'interval' || b.method === 'sampling';
const autoZero = (b: Behavior) => b.method === 'frequency' || b.method === 'duration';

/** 自動 0 を付けはじめる日: 行動を作った日。さかのぼって入れた記録がそれより前にあれば、その日から（決定111） */
export function zeroFrom(b: Behavior, events: Pick<Event, 'behaviorId' | 'localDate'>[]): string {
  let from = localDateOf(b.createdAt);
  for (const e of events) if (e.behaviorId === b.id && e.localDate < from) from = e.localDate;
  return from;
}

/** その行動の、1日ごとの値（測り方ごと） */
export function dailyMain(b: Behavior, dates: string[], rs: RecordSet): (number | null)[] {
  if (isRatio(b)) {
    const obs = rs.observations.filter((o) => o.behaviorId === b.id);
    return dates.map((d) => observedRatio(obs.filter((o) => o.localDate === d)));
  }
  const mine = rs.events.filter((e) => e.behaviorId === b.id);
  const byDate = groupByDate(mine);
  const from = zeroFrom(b, mine);
  return dates.map((d) => {
    const list = byDate.get(d);
    if (list?.length) {
      if (b.method === 'frequency') return list.reduce((s, e) => s + e.count, 0);
      if (b.method === 'duration') return round1(list.reduce((s, e) => s + (e.durationSec ?? 0), 0) / 60);
      return avg(list.flatMap((e) => (e.latencySec != null ? [e.latencySec] : [])));
    }
    return autoZero(b) && d >= from && rs.recordedDays.has(d) && !rs.notObserved.has(`${b.id}|${d}`) ? 0 : null;
  });
}

/** 観察時間が推定できたとみなす最短の長さ（分）。これより短い日は率を出さない */
const MIN_OBSERVED_MIN = 30;

const minuteOf = (iso: string) => {
  const t = new Date(iso);
  return t.getHours() * 60 + t.getMinutes();
};
const recordTimes = new WeakMap<RecordSet, Map<string, Map<string, number[]>>>();
const hhmm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** 記録した人ごとの、その日の観察時間帯（分）。method は推定のしかた（いつもの時間／記録の範囲） */
export interface ObservedSpan {
  userId: string;
  start: number;
  end: number;
  method: 'template' | 'records';
  placeName: string | null;
}

/**
 * その日に記録した人ごとの観察時間帯（6.3.3）。
 * (1) いつもの時間にその曜日が入っていれば、その時間帯、(3) なければ、その人のその日の最初の記録から最後の記録まで。
 * 【暫定】(2) アプリを開いた時刻はまだ残していないので使わない。
 */
export function observedSpans(d: string, rs: RecordSet): ObservedSpan[] {
  let byDate = recordTimes.get(rs);
  if (!byDate) {
    // 日 → 記録した人 → その日の記録の時刻（分）。同じ記録の組では1回だけ作る
    byDate = new Map();
    const put = (date: string, who: string, ...ms: number[]) => {
      const m = byDate!.get(date) ?? new Map<string, number[]>();
      m.set(who, [...(m.get(who) ?? []), ...ms]);
      byDate!.set(date, m);
    };
    for (const e of rs.events) put(e.localDate, e.recorderId, minuteOf(e.occurredAt));
    for (const o of rs.observations) put(o.localDate, o.recorderId, minuteOf(o.startedAt), minuteOf(o.endedAt ?? o.startedAt));
    recordTimes.set(rs, byDate);
  }
  const times = byDate.get(d);
  if (!times) return [];
  const wd = parseLocalDate(d).getDay();
  return [...times].map(([who, ms]) => {
    const s = rs.schedules.find((x) => x.userId === who && x.weekdays.includes(wd));
    return s
      ? { userId: who, start: hhmm(s.startTime), end: hhmm(s.endTime), method: 'template' as const, placeName: s.placeName }
      : { userId: who, start: Math.min(...ms), end: Math.max(...ms), method: 'records' as const, placeName: null };
  });
}

/**
 * その日の観察時間（時間）の推定（6.3.3）。記録した人ごとの時間帯（observedSpans）を、
 * 何人かいるときは重ねて（足し算ではなく）合わせる。30分に満たない日は推定できないとして null。
 */
export function observedHours(d: string, rs: RecordSet): number | null {
  const spans = observedSpans(d, rs).map((x): [number, number] => [x.start, x.end]);
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s > ce) {
      total += ce - cs;
      [cs, ce] = [s, e];
    } else ce = Math.max(ce, e);
  }
  total += ce - cs;
  return total < MIN_OBSERVED_MIN ? null : total / 60;
}

/** 頻度の1時間あたりの回数。回数か観察時間のどちらかがない日は null */
export function dailyRate(b: Behavior, dates: string[], rs: RecordSet): (number | null)[] {
  const counts = dailyMain(b, dates, rs);
  return dates.map((d, i) => {
    const c = counts[i];
    if (c == null) return null;
    const h = observedHours(d, rs);
    return h == null ? null : round1(c / h);
  });
}

/** 1時間あたりで見られる行動か（頻度だけ） */
export const canRate = (b: Behavior) => b.method === 'frequency';

/** 強度の1日の平均（未評価は除く） */
export function dailyIntensity(b: Behavior, dates: string[], rs: RecordSet): (number | null)[] {
  const byDate = groupByDate(rs.events.filter((e) => e.behaviorId === b.id));
  return dates.map((d) => avg((byDate.get(d) ?? []).flatMap((e) => (e.intensity != null ? [e.intensity] : []))));
}

/** 睡眠時間（時間）。起きた日ごと */
export function dailySleepHours(dates: string[], rs: RecordSet): (number | null)[] {
  const byWake = new Map(rs.sleepLogs.map((l) => [l.wakeDate, l]));
  return dates.map((d) => {
    const l = byWake.get(d);
    return l ? round1(sleepMinutes(l) / 60) : null;
  });
}

/** 身体拘束（決定119）: 記録のある日だけ、1日の回数と合計の分。記録のない日は値なし（0 にしない） */
export function dailyRestraint(dates: string[], rs: RecordSet): { count: (number | null)[]; minutes: (number | null)[] } {
  const byDate = new Map<string, RestraintLog[]>();
  for (const l of rs.restraintLogs) byDate.set(l.localDate, [...(byDate.get(l.localDate) ?? []), l]);
  const min = (l: RestraintLog) => Math.max(0, Math.round((new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) / 60000));
  return {
    count: dates.map((d) => byDate.get(d)?.length ?? null),
    minutes: dates.map((d) => {
      const ls = byDate.get(d);
      return ls ? ls.reduce((s, l) => s + min(l), 0) : null;
    }),
  };
}

function groupByDate(events: Event[]) {
  const m = new Map<string, Event[]>();
  for (const e of events) m.set(e.localDate, [...(m.get(e.localDate) ?? []), e]);
  return m;
}

/** 週・月にまとめる。値のある日の平均。dates は古い順の日ごと */
export function bucketize(dates: string[], values: (number | null)[], g: Granularity): { dates: string[]; values: (number | null)[] } {
  if (g === 'day') return { dates, values };
  const key = g === 'week' ? startOfWeek : startOfMonth;
  const order: string[] = [];
  const groups = new Map<string, number[]>();
  dates.forEach((d, i) => {
    const k = key(d);
    if (!groups.has(k)) {
      groups.set(k, []);
      order.push(k);
    }
    const v = values[i];
    if (v != null) groups.get(k)!.push(v);
  });
  return { dates: order, values: order.map((k) => avg(groups.get(k)!)) };
}

/** 縦軸の名前と単位（決定65）。rate = 頻度を1時間あたりで見る */
export function mainUnit(b: Behavior, g: Granularity, rate = false): string {
  const per = g === 'day' ? '1日' : g === 'week' ? '1週間の平均' : '1か月の平均';
  if (rate && canRate(b)) return g === 'day' ? '1時間あたりの回数（回/時）' : `${per}（回/時）`;
  if (b.method === 'frequency') return g === 'day' ? '1日の回数（回）' : `${per}（回/日）`;
  if (b.method === 'duration') return g === 'day' ? '1日の合計（分）' : `${per}（分/日）`;
  if (b.method === 'latency') return '待ち時間の平均（秒）';
  return b.kind === 'problem' ? '起きた区間の割合（%）' : 'できた区間の割合（%）';
}

/** 値の書き方（線の右端・目盛り） */
export function mainFormat(b: Behavior, rate = false): (v: number) => string {
  if (rate && canRate(b)) return (v) => `${v}回/時`;
  if (b.method === 'frequency') return (v) => `${v}回`;
  if (b.method === 'duration') return (v) => `${v}分`;
  if (b.method === 'latency') return (v) => formatDuration(Math.round(v));
  return (v) => `${v}%`;
}

/** 単位だけ（達成基準の入力欄に出す） */
export function valueUnit(b: Behavior): string {
  return b.method === 'frequency' ? '回/日' : b.method === 'duration' ? '分/日' : b.method === 'latency' ? '秒' : '%';
}

/** 古い記録の日から今日まで */
export function allDates(rs: RecordSet): string[] {
  return dateRange(rs.firstDate, toLocalDate());
}

/** 直近 n 日（今日を含む） */
export function lastDays(n: number, today = toLocalDate()): string[] {
  return dateRange(addDays(today, -(n - 1)), today);
}
