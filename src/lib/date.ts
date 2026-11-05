/** 日付ユーティリティ。集計はすべて端末のローカル日付で行う（UTC 日付にしない）。 */

const pad = (n: number) => String(n).padStart(2, '0');

/** ローカルタイムゾーン付き ISO 文字列（例: 2026-11-03T10:42:00.000+09:00） */
export function toLocalISO(d: Date = new Date()): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

export function nowISO(): string {
  return toLocalISO(new Date());
}

/** YYYY-MM-DD（ローカル） */
export function toLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateOf(iso: string): string {
  return toLocalDate(new Date(iso));
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

/** from〜to（両端含む）の日付配列 */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** ISO 週の月曜日 */
export function startOfWeek(s: string): string {
  const d = parseLocalDate(s);
  const day = (d.getDay() + 6) % 7; // 月=0
  d.setDate(d.getDate() - day);
  return toLocalDate(d);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 7) + '-01';
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateJa(s: string, withWeekday = true): string {
  const d = parseLocalDate(s);
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withWeekday ? `${base}（${WEEKDAY[d.getDay()]}）` : base;
}

export function formatShortDate(s: string): string {
  const d = parseLocalDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateTimeJa(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input 用 (YYYY-MM-DDTHH:mm) */
export function toDateTimeLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${toLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalInput(v: string): string {
  return toLocalISO(new Date(v));
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}分${s}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60}分`;
}
