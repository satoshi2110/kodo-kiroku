/**
 * 申し送り（6.10）。チーム画面と、ホーム（新しい3件と書く欄、決定116）で使う。
 * 書けるのは記録できる人（支援者以上）。消せるのは書いた人だけ（論理削除で、履歴は残る）。
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canRecord } from '../db/repo';
import { supabase } from '../server/supabase';
import { addComment, removeComment } from '../db/phase2';
import { formatDateTimeJa } from '../lib/date';
import { AFFILIATION_LABEL } from '../db/types';

export function TeamNotes({ limit = 30, compact = false }: { limit?: number; compact?: boolean }) {
  const { person, members, me, userId } = useApp();
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  const notes = useLiveQuery(
    async () =>
      person
        ? (await db.comments.where('personId').equals(person.id).filter((c) => c.target === 'team' && !c.deletedAt).toArray())
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [person?.id],
  );
  // ホームの「すべて見る」から来たときは、チーム画面の申し送りまで動かす。上のメンバーなどが読みこまれて伸びるのを少し待つ
  const loaded = notes !== undefined;
  useEffect(() => {
    if (compact || hash !== '#notes' || !loaded) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'start' }), 300);
    return () => clearTimeout(t);
  }, [compact, hash, loaded]);
  if (!person || !userId) return null;
  const memberOf = (uid: string) => members.find((m) => m.userId === uid);
  async function post() {
    const t = text.trim();
    if (!t || !person || !userId) return;
    await addComment(person.id, 'team', null, t, userId);
    setText('');
  }
  const all = notes ?? [];
  const shown = all.slice(0, limit);

  return (
    <div className="section" id={compact ? undefined : 'notes'} ref={ref} style={{ scrollMarginTop: 72 }}>
      <div className="card stack">
        <div className="row row--between">
          <h2 className="card__title" style={{ margin: 0 }}>申し送り</h2>
          {compact && <Link to="/team#notes" className="btn btn--sm">すべて見る</Link>}
        </div>
        {canRecord(me?.role) && (
          <div className="row">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="今日の様子を一言で書く" maxLength={200} />
            <button type="button" className="btn btn--sm" disabled={!text.trim()} onClick={post}>送る</button>
          </div>
        )}
        {all.length === 0 && <span className="muted">まだありません。</span>}
        {shown.map((c) => (
          <div key={c.id} className="today-row stack" style={{ gap: 2 }}>
            <span className="muted">
              {memberOf(c.authorId)?.displayName ?? '退会したメンバー'}
              {memberOf(c.authorId) ? `（${AFFILIATION_LABEL[memberOf(c.authorId)!.affiliation]}）` : ''} ・ {formatDateTimeJa(c.createdAt)}
            </span>
            <span>{c.text}</span>
            {c.authorId === userId && (
              <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-end' }} onClick={() => window.confirm('この申し送りを消しますか？（履歴には残ります）') && removeComment(c.id, userId)}>
                消す
              </button>
            )}
          </div>
        ))}
        {!compact && (
          <p className="help">責める言い方を避け、できたことや気づいたことを短く書きましょう。数で表せない成果も、ここでチームに伝えられます。{supabase ? 'チームの人に共有されます。' : 'いまはこの端末の中だけに残ります（共有はログインができてから）。'}</p>
        )}
        {compact && <p className="help" style={{ margin: 0 }}>できたことや気づいたことを短く。{supabase ? 'チームの全員が読めます。' : 'いまはこの端末の中だけに残ります。'}</p>}
      </div>
    </div>
  );
}
