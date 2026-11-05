/**
 * 折れ線グラフ（SVG 手書き）。
 * - 未記録（null）は線を切る
 * - 問題行動 = オレンジ系・実線・丸、代替/望ましい = 青系・破線・四角（色だけに頼らない）
 * - タップ/ホバーで縦線 + ツールチップ
 */
import { useMemo, useRef, useState } from 'react';
import type { Point } from '../lib/stats';
import { formatShortDate } from '../lib/date';

export interface ChartSeries {
  id: string;
  name: string;
  family: 'problem' | 'support';
  points: Point[];
}

export const PROBLEM_COLORS = ['#c2410c', '#ea580c', '#9a3412'];
export const SUPPORT_COLORS = ['#1d4ed8', '#3b82f6', '#2563eb'];
const DASHES = ['', '6 3', '2 3'];
const MARKERS: Array<'circle' | 'square' | 'triangle'> = ['circle', 'square', 'triangle'];

export interface SeriesStyle {
  color: string;
  dash: string;
  marker: 'circle' | 'square' | 'triangle';
}

/** 系列ごとの見た目。同じ種類内では色・線種・マーカーをずらす */
export function styleFor(series: ChartSeries[]): Map<string, SeriesStyle> {
  const map = new Map<string, SeriesStyle>();
  let p = 0;
  let s = 0;
  for (const sr of series) {
    if (sr.family === 'problem') {
      map.set(sr.id, { color: PROBLEM_COLORS[p % 3], dash: DASHES[p % 3], marker: MARKERS[p % 3] });
      p++;
    } else {
      map.set(sr.id, { color: SUPPORT_COLORS[s % 3], dash: DASHES[(s + 1) % 3], marker: MARKERS[(s + 1) % 3] });
      s++;
    }
  }
  return map;
}

function Marker({ x, y, style, r = 4 }: { x: number; y: number; style: SeriesStyle; r?: number }) {
  if (style.marker === 'square') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="#fff" stroke={style.color} strokeWidth="2" />;
  if (style.marker === 'triangle')
    return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} fill="#fff" stroke={style.color} strokeWidth="2" />;
  return <circle cx={x} cy={y} r={r} fill={style.color} stroke="#fff" strokeWidth="1.5" />;
}

export function LegendSwatch({ style }: { style: SeriesStyle }) {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
      <line x1="0" y1="6" x2="26" y2="6" stroke={style.color} strokeWidth="2.5" strokeDasharray={style.dash || undefined} />
      <Marker x={13} y={6} style={style} r={3.5} />
    </svg>
  );
}

export default function LineChart({
  series,
  unit,
  formatValue = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)),
  ariaLabel,
}: {
  series: ChartSeries[];
  unit: string;
  formatValue?: (v: number) => string;
  ariaLabel: string;
}) {
  const W = 360;
  const H = 230;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const styles = useMemo(() => styleFor(series), [series]);
  const keys = series[0]?.points.map((p) => p.key) ?? [];
  const n = keys.length;
  const maxV = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value ?? 0)));
  const niceMax = niceCeil(maxV);
  const x = (i: number) => (n <= 1 ? padL + (W - padL - padR) / 2 : padL + ((W - padL - padR) * i) / (n - 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const ticks = [0, niceMax / 2, niceMax];
  const labelIdx = n <= 7 ? keys.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    if (clientX == null) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHover(best);
  }

  // 連続する記録ありの点ごとに線を分ける（未記録で線を切る）
  function segments(points: Point[]): number[][] {
    const out: number[][] = [];
    let cur: number[] = [];
    points.forEach((p, i) => {
      if (p.value == null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  }

  const hasData = series.some((s) => s.points.some((p) => p.value != null));
  const tipW = 150;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setTimeout(() => setHover(null), 1500)}
      >
        {/* 軸・目盛り */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e4e6ea" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} fontSize="10" fill="#5b6472" textAnchor="end">{formatValue(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#c7cbd1" />
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#c7cbd1" />
        <text x={padL} y={H - 6} fontSize="9" fill="#5b6472">{unit}</text>
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - padB + 14} fontSize="10" fill="#5b6472" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {formatShortDate(keys[i])}
          </text>
        ))}
        {!hasData && (
          <text x={W / 2} y={H / 2} fontSize="12" fill="#5b6472" textAnchor="middle">この期間に記録がありません</text>
        )}
        {/* 線 */}
        {series.map((s) => {
          const st = styles.get(s.id)!;
          return (
            <g key={s.id}>
              {segments(s.points).map((seg, k) =>
                seg.length === 1 ? null : (
                  <polyline
                    key={k}
                    points={seg.map((i) => `${x(i)},${y(s.points[i].value!)}`).join(' ')}
                    fill="none"
                    stroke={st.color}
                    strokeWidth="2.5"
                    strokeDasharray={st.dash || undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              )}
              {s.points.map((p, i) => (p.value == null ? null : <Marker key={i} x={x(i)} y={y(p.value)} style={st} />))}
            </g>
          );
        })}
        {/* ホバー */}
        {hover != null && n > 0 && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#3b4452" strokeDasharray="3 3" />
            {(() => {
              const tx = x(hover) + tipW + 8 > W ? x(hover) - tipW - 8 : x(hover) + 8;
              const rows = series.map((s) => ({ s, p: s.points[hover] }));
              const th = 16 + rows.length * 14;
              return (
                <g>
                  <rect x={tx} y={padT} width={tipW} height={th} rx="6" fill="#1f2328" opacity="0.92" />
                  <text x={tx + 8} y={padT + 12} fontSize="10" fill="#fff" fontWeight="600">{formatShortDate(keys[hover])}</text>
                  {rows.map(({ s, p }, k) => (
                    <text key={s.id} x={tx + 8} y={padT + 26 + k * 14} fontSize="10" fill="#fff">
                      {s.name.length > 9 ? s.name.slice(0, 9) + '…' : s.name}: {p.value == null ? '未記録' : formatValue(p.value) + unit}
                    </text>
                  ))}
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 1) return 1;
  if (v <= 2) return 2;
  if (v <= 4) return 4;
  if (v <= 5) return 5;
  if (v <= 8) return 8;
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const nm = m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nm * p;
}
