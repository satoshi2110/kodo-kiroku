/**
 * 睡眠の計算（6.3.4）。保存はせず、表示のたびに計算する。
 * 「睡眠が短かった夜」: いつもの睡眠時間（その夜より前の2週間の中央値）より 2時間以上短い夜。5夜分たまるまでは判定しない。
 */
import { addDays } from './date';
import type { SleepLog } from '../db/types';

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** 寝ていた時間（分）。寝た時刻が起きた時刻より後なら、前の日の夜に寝たとみなす */
export function sleepMinutes(l: Pick<SleepLog, 'bedTime' | 'wakeTime'>): number {
  const d = toMin(l.wakeTime) - toMin(l.bedTime);
  return d > 0 ? d : d + 24 * 60;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** その起きた日より前の2週間の記録 */
const before = (logs: SleepLog[], wakeDate: string) => {
  const from = addDays(wakeDate, -14);
  return logs.filter((l) => l.wakeDate < wakeDate && l.wakeDate >= from);
};

export const SHORT_MIN = 120;
export const MIN_NIGHTS = 5;

export function usualMinutes(logs: SleepLog[], wakeDate: string): number | null {
  const prev = before(logs, wakeDate);
  return prev.length >= MIN_NIGHTS ? median(prev.map(sleepMinutes)) : null;
}

export function isShortNight(logs: SleepLog[], wakeDate: string): boolean {
  const l = logs.find((x) => x.wakeDate === wakeDate);
  const usual = usualMinutes(logs, wakeDate);
  return !!l && usual != null && sleepMinutes(l) <= usual - SHORT_MIN;
}

/** 「いつもの時刻」: 過去2週間の、寝た時刻・起きた時刻それぞれの中央値（5分刻み） */
export function usualTimes(logs: SleepLog[], wakeDate: string): { bedTime: string; wakeTime: string } | null {
  const prev = before(logs, wakeDate);
  if (prev.length === 0) return null;
  // 寝た時刻は夜中をまたぐので、正午より前は +24時間して並べる
  const bed = median(prev.map((l) => (toMin(l.bedTime) < 12 * 60 ? toMin(l.bedTime) + 24 * 60 : toMin(l.bedTime)))) % (24 * 60);
  const wake = median(prev.map((l) => toMin(l.wakeTime)));
  const fmt = (m: number) => {
    const r = Math.round(m / 5) * 5 % (24 * 60);
    return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
  };
  return { bedTime: fmt(bed), wakeTime: fmt(wake) };
}

export function formatSleep(min: number): string {
  return `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`;
}
