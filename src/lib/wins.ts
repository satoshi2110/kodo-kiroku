/**
 * 「できたこと」（6.4.4）。記録の集計に決まった形の文を当てはめて作る（AI は使わない。オフラインでも動く）。
 * 判定の決まり（【暫定】。しきい値は専門家と決め直す）:
 *  1. 代替行動・望ましい行動（回数で記録）の1日の回数が、3日続けて前の日と同じか増え、その間に増えている
 *  2. 問題行動のない「午前」（12時より前）または「午後」が、直近7日で4日以上（その時間帯に何か記録がある日だけ数える）
 *  3. 直近7日の平均が、実施中の支援計画の達成基準に届いた
 *  4. 平均の強度が、2週間で1段階以上下がった（前の7日と直近7日の比較）
 *  5. 代替行動・望ましい行動（回数で記録）の1日の回数が、これまでのどの日よりも多くなった
 *     （【暫定】（2026-11-07 の試作）それより前に記録のある日が7日以上あり、2回以上のときだけ。増えるたびに出る）
 * 同じことが続く間は、届いた最初の日だけに出す。場所は、その間にいちばん多く記録された場所の名前。
 */
import { addDays, dateRange } from './date';
import { dailyIntensity, dailyMain, mainFormat, type RecordSet } from './series';
import type { Behavior, PlanContent } from '../db/types';

export interface Win {
  date: string;
  text: string;
  place: string | null;
  behaviorId: string;
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const round1 = (v: number) => Math.round(v * 10) / 10;

export function computeWins(behaviors: Behavior[], rs: RecordSet, plan: PlanContent | null, until: string): Win[] {
  const from = addDays(rs.firstDate, -14);
  const days = dateRange(from, until);
  const wins: Win[] = [];

  const placeOf = (b: Behavior, start: string, end: string) => {
    const counts = new Map<string, number>();
    for (const e of rs.events) {
      if (e.behaviorId !== b.id || !e.placeName || e.localDate < start || e.localDate > end) continue;
      counts.set(e.placeName, (counts.get(e.placeName) ?? 0) + 1);
    }
    return [...counts].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? null;
  };

  for (const b of behaviors) {
    const v = dailyMain(b, days, rs);

    // 1. 代替行動・望ましい行動が3日続けて前の日以上
    if (b.kind !== 'problem' && b.method === 'frequency') {
      const up = (i: number) =>
        i >= 3 &&
        [v[i], v[i - 1], v[i - 2], v[i - 3]].every((x) => x != null) &&
        v[i]! >= v[i - 1]! && v[i - 1]! >= v[i - 2]! && v[i - 2]! >= v[i - 3]! && v[i]! > v[i - 3]! && v[i]! > 0;
      days.forEach((d, i) => {
        if (up(i) && !up(i - 1)) {
          wins.push({ date: d, behaviorId: b.id, place: placeOf(b, days[i - 2], d), text: `「${b.name}」が3日続けて、前の日と同じか増えました（${v[i - 3]}回 → ${v[i]}回）` });
        }
      });
    }

    // 5. 代替行動・望ましい行動が、初めて1日 N回になった（これまでの最多を超えた）
    if (b.kind !== 'problem' && b.method === 'frequency') {
      let best = -1;
      let seen = 0;
      days.forEach((d, i) => {
        const x = v[i];
        if (x == null) return;
        if (seen >= 7 && x > best && x >= 2) {
          wins.push({ date: d, behaviorId: b.id, place: placeOf(b, d, d), text: `「${b.name}」が、初めて1日${x}回になりました` });
        }
        if (x > best) best = x;
        seen++;
      });
    }

    // 2. 問題行動のない時間帯（午前・午後）が直近7日で4日以上
    if (b.kind === 'problem' && b.method !== 'interval' && b.method !== 'sampling') {
      for (const [band, label] of [[0, '午前'], [1, '午後']] as const) {
        const inBand = (iso: string) => (new Date(iso).getHours() < 12 ? 0 : 1) === band;
        const seen = new Set([
          ...rs.events.filter((e) => inBand(e.occurredAt)).map((e) => e.localDate),
          ...rs.observations.filter((o) => inBand(o.startedAt)).map((o) => o.localDate),
        ]);
        const hit = new Set(rs.events.filter((e) => e.behaviorId === b.id && inBand(e.occurredAt)).map((e) => e.localDate));
        const free = (d: string) => seen.has(d) && !hit.has(d) && !rs.notObserved.has(`${b.id}|${d}`);
        const count = (i: number) => (i < 6 ? 0 : days.slice(i - 6, i + 1).filter(free).length);
        days.forEach((d, i) => {
          if (count(i) >= 4 && count(i - 1) < 4) {
            wins.push({ date: d, behaviorId: b.id, place: null, text: `「${b.name}」のない${label}が、この1週間で${count(i)}日ありました` });
          }
        });
      }
    }

    // 3. 直近7日の平均が達成基準に届いた
    for (const c of (plan?.criteria ?? []).filter((x) => x.behaviorId === b.id)) {
      const avg7 = (i: number) => (i < 6 ? null : mean(v.slice(i - 6, i + 1)));
      const met = (i: number) => {
        const a = avg7(i);
        return a != null && (c.op === 'lte' ? a <= c.value : a >= c.value);
      };
      const fmt = mainFormat(b);
      days.forEach((d, i) => {
        if (met(i) && !met(i - 1)) {
          wins.push({
            date: d,
            behaviorId: b.id,
            place: placeOf(b, days[i - 6], d),
            text: `「${b.name}」の7日間の平均が ${fmt(round1(avg7(i)!))} になり、目標（${fmt(c.value)}${c.op === 'lte' ? '以下' : '以上'}）に届きました`,
          });
        }
      });
    }

    // 4. 平均の強度が2週間で1段階以上下がった
    if (b.intensity) {
      const iv = dailyIntensity(b, days, rs);
      const drop = (i: number) => {
        if (i < 13) return false;
        const before = mean(iv.slice(i - 13, i - 6));
        const after = mean(iv.slice(i - 6, i + 1));
        return before != null && after != null && before - after >= 1;
      };
      days.forEach((d, i) => {
        if (drop(i) && !drop(i - 1)) {
          wins.push({ date: d, behaviorId: b.id, place: placeOf(b, days[i - 6], d), text: `「${b.name}」の平均の強度が、2週間で1段階以上下がりました` });
        }
      });
    }
  }
  return wins.filter((w) => w.date >= rs.firstDate).sort((a, b) => b.date.localeCompare(a.date));
}
