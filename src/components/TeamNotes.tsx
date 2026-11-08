/**
 * 申し送り（6.10）。ホームに新しい3件と書く欄を出し（決定116）、「すべて見る」でその場に広げる（決定122）。
 * 書けるのは記録できる人（支援者以上）。消せるのは書いた人だけ（論理削除で、履歴は残る）。
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canRecord } from '../db/repo';
import { supabase } from '../server/supabase';
import { addComment, removeComment } from '../db/phase2';
import { formatDateTimeJa } from '../lib/date';
import { AFFILIATION_LABEL } from '../db/types';

export function TeamNotes({ limit = 3 }: { limit?: number }) {
  const { person, members, me, userId } = useApp();
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const notes = useLiveQuery(
    async () =>
      person
        ? (await db.comments.where('personId').equals(person.id).filter((c) => c.target === 'team' && !c.deletedAt).toArray())
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [person?.id],
  );
  if (!person || !userId) return null;
  const memberOf = (uid: string) => members.find((m) => m.userId === uid);
  async function post() {
    const t = text.trim();
    if (!t || !person || !userId) return;
    await addComment(person.id, 'team', null, t, userId);
    setText('');
  }
  const all = notes ?? [];
  // 広げたときも、古すぎるものは出さない（画面が長くなりすぎないように）
  const shown = all.slice(0, showAll ? 30 : limit);

  return (
    <div className="section">
      <div className="card stack">
        <div className="row row--between">
          <h2 className="card__title" style={{ margin: 0 }}>申し送り</h2>
          {all.length > limit && (
            <button type="button" className="btn btn--sm" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? '新しい3件だけ' : `すべて見る（${Math.min(all.length, 30)}件）`}
            </button>
          )}
        </div>
        {canRecord(me?.role) && (
          <div className="row">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="今日の様子を一言で書く" maxLength={200} />
            <button type="button" className="btn btn--sm" disabled={!text.trim()} onClick={post}>送る</button>
          </div>
        )}
        {all.length === 0 && <span className="muted">まだありません。</span>}
        {shown.map((c) => (
          <div key={c.id} className="today-row note-bubble stack" style={{ gap: 2 }}>
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
        <p className="help" style={{ margin: 0 }}>責める言い方を避け、できたことや気づいたことを短く。{supabase ? 'チームの全員が読めます。' : 'いまはこの端末の中だけに残ります。'}</p>
      </div>
    </div>
  );
}
