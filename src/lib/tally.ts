/** ABC分析の数え方（6.4.3）。ABC分析の画面と PDF レポートで共通に使う */
import type { Event } from '../db/types';

export function scene(e: Event) {
  return `${e.placeName ?? '場所なし'} ・ ${e.activity ?? '活動なし'}`;
}

/** 1件の記録に同じ所属の人が2人いても、その所属は1件と数える */
export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function count(items: string[]): [string, number][] {
  return [...items.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
}
