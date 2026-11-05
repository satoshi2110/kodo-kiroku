import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { KIND_LABEL, type BehaviorKind } from '../db/types';

export function KindBadge({ kind }: { kind: BehaviorKind }) {
  return <span className={`badge badge--${kind}`}>{KIND_LABEL[kind]}</span>;
}

export function Chip({
  on,
  onClick,
  children,
  problem,
  dashed,
}: {
  on?: boolean;
  onClick?: () => void;
  children: ReactNode;
  problem?: boolean;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip${on ? ' chip--on' : ''}${problem ? ' chip--problem' : ''}${dashed ? ' chip--dashed' : ''}`}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({ title, sub, right, back }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; back?: string }) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="row" style={{ minWidth: 0 }}>
          {back && (
            <Link to={back} className="btn btn--icon" aria-label="戻る">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 19l-7-7 7-7" /></svg>
            </Link>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="topbar__title">{title}</h1>
            {sub && <div className="topbar__sub">{sub}</div>}
          </div>
        </div>
        <div className="row">{right}</div>
      </div>
    </header>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row row--between">
          <h2 className="sheet__title">{title}</h2>
          <button type="button" className="btn btn--sm" onClick={onClose}>閉じる</button>
        </div>
        {children}
      </div>
    </div>
  );
}
