/**
 * 折れ線グラフ（自前の SVG、決定65・66・73）。
 * - 縦軸: 目盛り・補助線・単位つきの軸名。目盛りは記録全体の最大値で固定し、横に動かしても変わらない
 * - 横軸: 1日ずつの目盛りに日付と曜日。文字は最後の日から数えて1日おき。軸名「日付」
 * - 記録がない日は線を切る。線の終わりに最後の値を書く
 * - 横にスクロールでき、縦軸は左に固定。最初は最後の14日を見せ、「今日に戻る」で右端へ
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseLocalDate } from '../lib/date';

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
const AXIS_W = 48;
const TOP = 16;
const PLOT_H = 160;
const BOTTOM = 52;
const H = TOP + PLOT_H + BOTTOM;
const VISIBLE_DAYS = 14;
const PAD_R = 16; // 最後の日付の文字が切れないように

export interface Series {
  dates: string[]; // YYYY-MM-DD、古い順
  values: (number | null)[]; // null は記録なし（線を切る）
}

export default function LineChart({
  series,
  unit,
  color,
  format = (v) => String(v),
  fixedMax,
}: {
  series: Series;
  unit: string;
  color: string;
  format?: (v: number) => string;
  fixedMax?: number;
}) {
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

  const n = series.dates.length;
  const dayW = width ? Math.max(18, (width - AXIS_W - PAD_R) / VISIBLE_DAYS) : 20;
  const plotW = Math.max(n * dayW + PAD_R, width - AXIS_W);

  // 最初は右端（最後の14日）を見せる
  useEffect(() => {
    const s = scroller.current;
    if (s) s.scrollLeft = s.scrollWidth;
  }, [width, n]);

  const maxVal = Math.max(0, ...series.values.filter((v): v is number => v != null));
  const { max, ticks } = niceScale(fixedMax ?? maxVal);
  const y = (v: number) => TOP + PLOT_H - (v / max) * PLOT_H;
  const x = (i: number) => i * dayW + dayW / 2;

  const segments: string[] = [];
  let cur: string[] = [];
  series.values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segments.push(cur.join(' '));
      cur = [];
    } else cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(' '));
  let lastIdx = -1;
  series.values.forEach((v, i) => { if (v != null) lastIdx = i; });

  function onScroll() {
    const s = scroller.current;
    if (s) setAtEnd(s.scrollLeft + s.clientWidth >= s.scrollWidth - 4);
  }

  return (
    <div className="chart" ref={wrap}>
      <div className="chart__row">
        <svg width={AXIS_W} height={H} className="chart__axis" aria-hidden="true">
          <text x={10} y={TOP + PLOT_H / 2} transform={`rotate(-90 10 ${TOP + PLOT_H / 2})`} textAnchor="middle" className="chart__title">
            {unit}
          </text>
          {ticks.map((t) => (
            <text key={t} x={AXIS_W - 6} y={y(t) + 4} textAnchor="end" className="chart__tick">{format(t)}</text>
          ))}
        </svg>
        <div className="chart__scroll" ref={scroller} onScroll={onScroll}>
          <svg width={plotW} height={H} role="img" aria-label={`${unit}の推移。最後の値 ${lastIdx >= 0 ? format(series.values[lastIdx]!) : 'なし'}`}>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart__base' : 'chart__grid'} />
            ))}
            {series.dates.map((d, i) => {
              const label = (n - 1 - i) % 2 === 0;
              const dt = parseLocalDate(d);
              return (
                <g key={d}>
                  <line x1={x(i)} x2={x(i)} y1={TOP + PLOT_H} y2={TOP + PLOT_H + 4} className="chart__base" />
                  {label && (
                    <>
                      <text x={x(i)} y={TOP + PLOT_H + 16} textAnchor="middle" className="chart__tick">{`${dt.getMonth() + 1}/${dt.getDate()}`}</text>
                      <text x={x(i)} y={TOP + PLOT_H + 29} textAnchor="middle" className={`chart__tick${dt.getDay() === 0 ? ' chart__tick--sun' : ''}`}>
                        {WEEKDAY[dt.getDay()]}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />)}
            {series.values.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={color} />)}
            {lastIdx >= 0 && (
              <text x={x(lastIdx) - 6} y={y(series.values[lastIdx]!) - 8} textAnchor="end" className="chart__end" fill={color}>
                {format(series.values[lastIdx]!)}
              </text>
            )}
            <text x={plotW - 4} y={H - 6} textAnchor="end" className="chart__title">日付</text>
          </svg>
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

/** 0 から始まる、きりのよい目盛り（4〜5本） */
function niceScale(maxVal: number): { max: number; ticks: number[] } {
  if (maxVal <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = maxVal / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const stepInt = step < 1 && Number.isInteger(maxVal) ? 1 : step;
  const max = Math.ceil(maxVal / stepInt) * stepInt;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += stepInt) ticks.push(+t.toFixed(6));
  return { max, ticks };
}
