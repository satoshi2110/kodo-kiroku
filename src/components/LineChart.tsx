/**
 * 折れ線グラフ（自前の SVG、決定65・66・73）。
 * - 縦軸: 目盛り・補助線。単位つきの軸名はグラフの左上に書く。目盛りは記録全体の最大値で固定し、横に動かしても変わらない
 * - 横軸: 1日（週・月）ずつの目盛りに日付。文字は最後から数えて1つおき。軸名を右下に書く
 * - 記録がない日は線を切る。条件変更（フェーズ）の前後も線をつながない（決定25）
 * - 線の右端に行動名と最後の値を、線と同じ色で書く（決定31・65）。線が1本でも行動名を書く。左に入りきらないときは点の右に書く。問題行動は実線、代替行動・望ましい行動は点線（色だけに頼らない）
 * - 横にスクロールでき、縦軸は左に固定。同じ sync を渡したパネルは一緒に動く（決定73）。最初は最後の14区切り、「今日に戻る」で右端へ
 * - staticMode: スクロールしない（支援会議メモ・PDF レポート用。全期間を幅に収める）
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseLocalDate } from '../lib/date';
import type { Granularity } from '../lib/series';

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
const AXIS_W = 48;
const TOP = 22;
const PLOT_H = 160;
const BOTTOM = 52;
const H = TOP + PLOT_H + BOTTOM;
const VISIBLE = 14;
const PAD_R = 16;
const PAD_L = 14; // 最初の日付の文字が左で切れないように

export interface ChartLine {
  name: string;
  color: string;
  dashed?: boolean;
  values: (number | null)[];
}

export interface Phase {
  date: string;
  label: string;
  /** definition = 行動の定義の変更（6.2）。「ベースライン」の見出しは、計画の変更の前にだけ付ける */
  kind?: 'plan' | 'definition';
}

export interface Target {
  value: number;
  label: string;
  color: string;
}

/** 縦に並んだパネルを一緒にスクロールさせる（決定73） */
export class ScrollSync {
  private els = new Set<HTMLDivElement>();
  private busy = false;
  add(el: HTMLDivElement) {
    this.els.add(el);
    return () => this.els.delete(el);
  }
  move(from: HTMLDivElement) {
    if (this.busy) return;
    this.busy = true;
    for (const el of this.els) if (el !== from) el.scrollLeft = from.scrollLeft;
    this.busy = false;
  }
}

const SyncCtx = createContext<ScrollSync | null>(null);
export const ChartSyncProvider = SyncCtx.Provider;
export function useNewSync() {
  return useMemo(() => new ScrollSync(), []);
}

export default function LineChart({
  dates,
  lines,
  unit,
  granularity = 'day',
  format = (v) => String(v),
  tickFormat = format,
  fixedMax,
  fixedMin = 0,
  phases = [],
  targets = [],
  staticMode = false,
}: {
  dates: string[];
  lines: ChartLine[];
  unit: string;
  granularity?: Granularity;
  format?: (v: number) => string;
  tickFormat?: (v: number) => string; // 縦軸の目盛り（なければ format）
  fixedMax?: number;
  fixedMin?: number;
  phases?: Phase[];
  targets?: Target[];
  staticMode?: boolean;
}) {
  const sync = useContext(SyncCtx);
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [atEnd, setAtEnd] = useState(true);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = dates.length;
  const w = width || 340;
  const slotW = staticMode ? Math.max(4, (w - AXIS_W - PAD_L - PAD_R) / Math.max(1, n)) : Math.max(18, (w - AXIS_W - PAD_L - PAD_R) / VISIBLE);
  const plotW = staticMode ? w - AXIS_W : Math.max(PAD_L + n * slotW + PAD_R, w - AXIS_W);

  // 最初は右端（最後の14区切り）を見せる
  useEffect(() => {
    const s = scroller.current;
    if (s && !staticMode) s.scrollLeft = s.scrollWidth;
  }, [width, n, staticMode]);

  useEffect(() => {
    const s = scroller.current;
    if (!s || !sync || staticMode) return;
    const off = sync.add(s);
    return () => {
      off();
    };
  }, [sync, staticMode]);

  const all = lines.flatMap((l) => l.values.filter((v): v is number => v != null));
  const maxVal = Math.max(0, ...all, ...targets.map((t) => t.value));
  const { min, max, ticks } = fixedMax != null && fixedMin > 0 ? evenScale(fixedMin, fixedMax) : niceScale(fixedMax ?? maxVal);
  const y = (v: number) => TOP + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
  const x = (i: number) => PAD_L + i * slotW + slotW / 2;

  // 条件変更の位置: その区切りの左端（週・月は、変更日の入る区切りの中の位置）
  const phaseX = (date: string) => {
    let j = -1;
    dates.forEach((d, i) => { if (d <= date) j = i; });
    if (j < 0) return null;
    if (granularity === 'day' || dates[j] === date) return PAD_L + j * slotW;
    const start = parseLocalDate(dates[j]).getTime();
    const end = j + 1 < n ? parseLocalDate(dates[j + 1]).getTime() : start + (granularity === 'week' ? 7 : 30) * 86400_000;
    return PAD_L + j * slotW + ((parseLocalDate(date).getTime() - start) / (end - start)) * slotW;
  };
  const shownPhases = phases.filter((p) => p.date > (dates[0] ?? '') && p.date <= (dates[n - 1] ?? ''));
  const planPhases = shownPhases.filter((p) => p.kind !== 'definition');
  // i と i+1 の間に条件変更があれば線を切る
  const breakAfter = new Set<number>();
  for (const p of shownPhases) {
    for (let i = 0; i + 1 < n; i++) if (dates[i] < p.date && p.date <= dates[i + 1]) breakAfter.add(i);
  }

  const paths = lines.map((l) => {
    const segs: string[] = [];
    let cur: string[] = [];
    l.values.forEach((v, i) => {
      if (v == null) {
        if (cur.length) segs.push(cur.join(' '));
        cur = [];
        return;
      }
      cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      if (breakAfter.has(i)) {
        segs.push(cur.join(' '));
        cur = [];
      }
    });
    if (cur.length) segs.push(cur.join(' '));
    let last = -1;
    l.values.forEach((v, i) => { if (v != null) last = i; });
    return { segs, last };
  });

  // 未記録: 最初の記録と最後の記録の間で、どの線にも値がない区切り（「観察していなかった」など）。続いていれば真ん中に1つだけ書く
  const has = (i: number) => lines.some((l) => l.values[i] != null);
  let firstI = -1;
  let lastI = -1;
  for (let i = 0; i < n; i++) if (has(i)) { if (firstI < 0) firstI = i; lastI = i; }
  const gaps: { cx: number; w: number }[] = [];
  for (let i = firstI + 1; firstI >= 0 && i < lastI; i++) {
    if (has(i)) continue;
    let j = i;
    while (j + 1 < lastI && !has(j + 1)) j++;
    gaps.push({ cx: (x(i) + x(j)) / 2, w: (j - i + 1) * slotW });
    i = j;
  }

  const every = staticMode ? Math.max(1, Math.ceil(36 / slotW)) : granularity === 'day' ? 2 : 1;
  const xLabel = granularity === 'day' ? '日付（1日ごと）' : granularity === 'week' ? '週（1週間ごと）' : '月（1か月ごと）';
  const dateLabel = (d: string): [string, string | null, boolean] => {
    const dt = parseLocalDate(d);
    if (granularity === 'month') return [`${dt.getMonth() + 1}月`, null, false];
    if (granularity === 'week') return [`${dt.getMonth() + 1}/${dt.getDate()}〜`, null, false];
    return [`${dt.getMonth() + 1}/${dt.getDate()}`, WEEKDAY[dt.getDay()], dt.getDay() === 0];
  };

  // 線の右端の文字（行動名と最後の値）。重なるときは上下にずらす
  const ends = paths
    .map((p, k) => (p.last >= 0 ? { k, x: x(p.last), y: y(lines[k].values[p.last]!), text: `${lines[k].name} ${format(lines[k].values[p.last]!)}` } : null))
    .filter((e): e is { k: number; x: number; y: number; text: string } => !!e)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  // 文字の幅の目安（12px の太字。全角 12・半角 7）
  const textW = (s: string) => [...s].reduce((sum, c) => sum + (c.charCodeAt(0) > 0xff ? 12 : 7), 0);

  const plot = (
    <>
      {ticks.map((t) => (
        <line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} className={t === min ? 'chart__base' : 'chart__grid'} />
      ))}
      {dates.map((d, i) => {
        const [a, b, sun] = dateLabel(d);
        const label = (n - 1 - i) % every === 0;
        return (
          <g key={d}>
            <line x1={x(i)} x2={x(i)} y1={TOP + PLOT_H} y2={TOP + PLOT_H + 4} className="chart__base" />
            {label && (
              <>
                <text x={x(i)} y={TOP + PLOT_H + 16} textAnchor="middle" className="chart__tick">{a}</text>
                {b && <text x={x(i)} y={TOP + PLOT_H + 29} textAnchor="middle" className={`chart__tick${sun ? ' chart__tick--sun' : ''}`}>{b}</text>}
              </>
            )}
          </g>
        );
      })}
      {planPhases.length > 0 && dates[0] < planPhases[0].date && (
        <text x={4} y={TOP - 8} className="chart__phase">ベースライン</text>
      )}
      {shownPhases.map((p) => {
        const px = phaseX(p.date);
        return px == null ? null : (
          <g key={p.date + p.label}>
            <line x1={px} x2={px} y1={TOP - 4} y2={TOP + PLOT_H} className="chart__phase-line" />
            {px + 4 + p.label.length * 11 > plotW ? (
              <text x={px - 4} y={TOP - 8} textAnchor="end" className="chart__phase">{p.label}</text>
            ) : (
              <text x={px + 4} y={TOP - 8} className="chart__phase">{p.label}</text>
            )}
          </g>
        );
      })}
      {gaps.map((gp) =>
        gp.w >= 16 ? (
          <text key={`gap-${gp.cx}`} x={gp.cx} y={TOP + PLOT_H - 5} textAnchor="middle" className="chart__gap">未記録</text>
        ) : null,
      )}
      {targets.map((t, i) => (
        <g key={i}>
          <line x1={0} x2={plotW} y1={y(t.value)} y2={y(t.value)} stroke={t.color} strokeWidth={1.5} strokeDasharray="6 4" />
          <text x={plotW - 6} y={y(t.value) + 14 + 13 * targets.slice(0, i).filter((o) => o.value === t.value).length} textAnchor="end" className="chart__target" fill={t.color}>{t.label}</text>
        </g>
      ))}
      {paths.map((p, k) =>
        p.segs.map((d, i) => (
          <path key={`${k}-${i}`} d={d} fill="none" stroke={lines[k].color} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={lines[k].dashed ? '6 4' : undefined} />
        )),
      )}
      {lines.map((l, k) =>
        l.values.map((v, i) =>
          v == null ? null : l.dashed ? (
            <rect key={`${k}-${i}`} x={x(i) - 3.5} y={y(v) - 3.5} width={7} height={7} fill={l.color} />
          ) : (
            <circle key={`${k}-${i}`} cx={x(i)} cy={y(v)} r={3.5} fill={l.color} />
          ),
        ),
      )}
      {ends.map((e) => (
        <text
          key={e.k}
          x={e.x - 6 - textW(e.text) < 0 ? e.x + 6 : e.x - 6}
          y={Math.max(12, e.y - 8)}
          textAnchor={e.x - 6 - textW(e.text) < 0 ? 'start' : 'end'}
          className="chart__end"
          fill={lines[e.k].color}
        >
          {e.text}
        </text>
      ))}
      <text x={plotW - 4} y={H - 6} textAnchor="end" className="chart__title">{xLabel}</text>
    </>
  );

  const axis = (
    <>
      {ticks.map((t) => (
        <text key={t} x={AXIS_W - 6} y={y(t) + 4} textAnchor="end" className="chart__tick">{tickFormat(t)}</text>
      ))}
    </>
  );

  const label = `${unit}の推移。${lines.map((l, k) => `${l.name} 最後の値 ${paths[k].last >= 0 ? format(l.values[paths[k].last]!) : 'なし'}`).join('、')}`;

  if (staticMode) {
    return (
      <div className="chart" ref={wrap}>
        <div className="chart__ylabel">{unit}</div>
        <svg viewBox={`0 0 ${w} ${H}`} width="100%" role="img" aria-label={label} className="chart__static">
          <g>{axis}</g>
          <g transform={`translate(${AXIS_W} 0)`}>{plot}</g>
        </svg>
      </div>
    );
  }

  function onScroll() {
    const s = scroller.current;
    if (!s) return;
    setAtEnd(s.scrollLeft + s.clientWidth >= s.scrollWidth - 4);
    sync?.move(s);
  }

  return (
    <div className="chart" ref={wrap}>
      <div className="chart__ylabel">{unit}</div>
      <div className="chart__row">
        <svg width={AXIS_W} height={H} className="chart__axis" aria-hidden="true">{axis}</svg>
        <div className="chart__scroll" ref={scroller} onScroll={onScroll}>
          <svg width={plotW} height={H} role="img" aria-label={label}>{plot}</svg>
        </div>
      </div>
      {!atEnd && (
        <button type="button" className="btn btn--sm chart__today" onClick={() => scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: 'smooth' })}>
          今日に戻る
        </button>
      )}
    </div>
  );
}

/** 見出しに付ける線の見本（問題行動は実線、代替行動・望ましい行動は点線。決定65の前の【決定】） */
export function LineSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="24" height="10" aria-hidden="true" style={{ flex: 'none' }}>
      <line x1="1" y1="5" x2="23" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '5 3' : undefined} />
      {dashed ? <rect x="8.5" y="1.5" width="7" height="7" fill={color} /> : <circle cx="12" cy="5" r="3.5" fill={color} />}
    </svg>
  );
}

/** 0 から始まる、きりのよい目盛り（4〜5本） */
function niceScale(maxVal: number): { min: number; max: number; ticks: number[] } {
  if (maxVal <= 0) return { min: 0, max: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = maxVal / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // 値は小数1けたまでなので、目盛りも 0.1 より細かくしない
  const step = Math.max(0.1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!);
  const stepInt = step < 1 && Number.isInteger(maxVal) ? 1 : step;
  const max = Math.ceil(maxVal / stepInt) * stepInt;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += stepInt) ticks.push(+t.toFixed(6));
  return { min: 0, max, ticks };
}

/** 強度（1〜3、1〜5）のように範囲が決まっているとき。3段階は 0.5 きざみ */
function evenScale(min: number, max: number): { min: number; max: number; ticks: number[] } {
  const step = max - min <= 2 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(+t.toFixed(6));
  return { min, max, ticks };
}
