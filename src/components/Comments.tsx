/**
 * 記録・グラフ・支援計画・会議メモへのコメントと @メンション（6.10、決定105）。【暫定】（2026-11-07 の試作）
 * - CommentThread: コメントの欄。書けるのは支援者以上、消せるのは書いた人だけ（論理削除）。
 *   「@ で呼ぶ」の名前を押すと、文に「@名前」が入り、その人を呼ぶ。送るときに文に残っている「@名前」の人だけを呼ぶ。
 * - MentionBanner: 自分が呼ばれたコメントを、アプリを開いたときに画面の上に出す（メール・プッシュでは知らせない。決定101）。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canRecord, saveDevice } from '../db/repo';
import { addComment, removeComment } from '../db/phase2';
import { useApp } from '../state';
import { formatDateTimeJa } from '../lib/date';
import type { Comment, CommentTarget } from '../db/types';
import { Chip } from './ui';

const MAX = 300;

export function CommentThread({ target, targetId, title = 'コメント' }: { target: CommentTarget; targetId: string | null; title?: string }) {
  const { person, userId, me, members } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const personId = person?.id;
  const list = useLiveQuery(
    async () =>
      personId
        ? (await db.comments.where('personId').equals(personId).filter((c) => c.target === target && (c.targetId ?? null) === targetId && !c.deletedAt).toArray()).sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )
        : [],
    [personId, target, targetId],
  );
  if (!person || !userId) return null;
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';
  // 呼べるのは、承認済みで停止されていない、ほかのメンバー
  const callable = members.filter((m) => m.userId !== userId && !m.deletedAt && m.approvedAt !== null && !m.suspendedAt);
  const called = (t: string) => callable.filter((m) => t.includes(`@${m.displayName}`));
  const call = (name: string) => setText((t) => (t.includes(`@${name}`) ? t : `@${name} ${t}`.slice(0, MAX)));

  async function post() {
    const t = text.trim();
    if (!t || !person || !userId) return;
    setBusy(true);
    await addComment(person.id, target, targetId, t, userId, [...new Set(called(t).map((m) => m.userId))]);
    setText('');
    setBusy(false);
  }

  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>{title}（{(list ?? []).length}）</h2>
        {(list ?? []).map((c) => (
          <div key={c.id} className="today-row note-bubble stack" style={{ gap: 2 }}>
            <span className="muted">{nameOf(c.authorId)} ・ {formatDateTimeJa(c.createdAt)}</span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{c.text}</span>
            {c.authorId === userId && (
              <button
                type="button"
                className="btn btn--sm"
                style={{ alignSelf: 'flex-end' }}
                onClick={() => window.confirm('このコメントを消しますか？（履歴には残ります）') && removeComment(c.id, userId)}
              >
                消す
              </button>
            )}
          </div>
        ))}
        {canRecord(me?.role) && (
          <>
            <textarea className="input textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="コメントを書く" maxLength={MAX} aria-label={`${title}を書く`} />
            {callable.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="muted">@ で呼ぶ（呼んだ人の画面に知らせが出ます）</span>
                <div className="chips">
                  {callable.map((m) => (
                    <Chip key={m.userId} on={text.includes(`@${m.displayName}`)} onClick={() => call(m.displayName)}>
                      @{m.displayName}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <button type="button" className="btn btn--block" disabled={busy || !text.trim()} onClick={() => void post()}>
              送る
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const PLACE: Record<CommentTarget, string> = { team: '申し送り', meeting: '会議メモへのコメント', event: '記録へのコメント', graph: 'グラフへのコメント', plan: '支援計画へのコメント' };
const linkOf = (c: Comment) =>
  c.target === 'event' ? `/abc/${c.targetId}` : c.target === 'meeting' ? `/meetings/${c.targetId}` : c.target === 'graph' ? '/graph' : c.target === 'plan' ? '/plan' : '/team';

/** 自分が呼ばれたコメントの知らせ（まだ「確かめた」を押していない分、新しい3件まで） */
export function MentionBanner() {
  const { person, userId, members } = useApp();
  const dev = useLiveQuery(() => db.device.get('device'), []);
  const personId = person?.id;
  const seen = (personId && dev?.mentionSeenAt?.[personId]) || '';
  const list = useLiveQuery(
    async () =>
      personId && userId
        ? (await db.comments.where('personId').equals(personId).filter((c) => !c.deletedAt && c.authorId !== userId && !!c.mentions?.includes(userId) && c.createdAt > seen).toArray()).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
        : [],
    [personId, userId, seen],
  );
  if (!personId || dev === undefined || !list || list.length === 0) return null;
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';
  const latest = list[0].createdAt;
  return (
    <div className="section">
      <div className="notice-bar" role="status">
        <span>あなたが @ で呼ばれました{list.length > 3 ? `（${list.length}件。新しい3件）` : ''}:</span>
        {list.slice(0, 3).map((c) => (
          <Link key={c.id} to={linkOf(c)} style={{ display: 'block' }}>
            {nameOf(c.authorId)}さん・{PLACE[c.target]}（{formatDateTimeJa(c.createdAt)}）: {(c.text ?? '').length > 40 ? `${c.text.slice(0, 40)}…` : (c.text ?? '')}
          </Link>
        ))}
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--sm" onClick={() => void saveDevice({ mentionSeenAt: { ...dev?.mentionSeenAt, [personId]: latest } })}>
            確かめた
          </button>
        </div>
      </div>
    </div>
  );
}
