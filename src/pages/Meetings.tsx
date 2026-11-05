/** 支援会議メモの一覧（6.10、ワイヤーフレーム 18）。支援計画の画面から開く */
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canEditMeeting } from '../db/phase2';
import { formatDateTimeJa, formatShortDate } from '../lib/date';
import { TopBar } from '../components/ui';

export default function Meetings() {
  const { person, me, userId } = useApp();
  const notes = useLiveQuery(
    async () =>
      person
        ? (await db.meetingNotes.where('personId').equals(person.id).filter((n) => !n.deletedAt).toArray()).sort((a, b) => b.heldAt.localeCompare(a.heldAt))
        : [],
    [person?.id],
  );
  if (!person || !userId || !notes) return null;
  return (
    <div className="page page--no-nav">
      <TopBar title="支援会議メモ" sub={person.displayName} back="/plan" />
      {canEditMeeting(me?.role, undefined, userId) && (
        <div className="section">
          <Link to="/meetings/new" className="btn btn--primary btn--block">会議メモを書く</Link>
        </div>
      )}
      <div className="section">
        <div className="card">
          {notes.length === 0 && <p className="muted">まだありません。会議の日に書くと、その日のグラフと支援計画も一緒に残ります。</p>}
          {notes.map((n) => (
            <Link key={n.id} to={`/meetings/${n.id}`} className="row row--between today-row today-row--link">
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span>{formatDateTimeJa(n.heldAt)}{n.place ? ` ・ ${n.place}` : ''}</span>
                <span className="muted">{n.decisions ? `決めたこと: ${n.decisions.slice(0, 40)}${n.decisions.length > 40 ? '…' : ''}` : '決めたこと: —'}{n.nextReview ? ` ・ 次の見直し ${formatShortDate(n.nextReview)}` : ''}</span>
              </span>
              <span className="today-row__go" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
