/** 保存したグラフ（ChartSnapshot）を、動かない絵として出す。会議メモと PDF レポートで使う */
import type { ChartSnapshot } from '../db/types';
import LineChart from './LineChart';

export default function SnapshotChart({ s, showTitle = true }: { s: ChartSnapshot; showTitle?: boolean }) {
  return (
    <figure className="snapshot">
      {showTitle && <figcaption><strong>{s.title}</strong> <span className="muted">{s.caption}</span></figcaption>}
      <LineChart
        dates={s.dates}
        lines={s.lines}
        unit={s.unit}
        granularity={s.granularity}
        fixedMin={s.fixedMin}
        fixedMax={s.fixedMax}
        phases={s.phases}
        targets={s.targets}
        staticMode
      />
      <div className="snapshot__legend">
        {s.lines.map((l) => (
          <span key={l.name} className="row" style={{ gap: 4 }}>
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dashed ? '5 3' : undefined} /></svg>
            {l.name}
          </span>
        ))}
      </div>
    </figure>
  );
}
