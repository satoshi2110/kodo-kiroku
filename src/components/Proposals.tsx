/**
 * 支援者の提案（5章の役割の表「行動定義: 提案」「支援計画編集: 提案」）。【暫定】（2026-11-07 の試作）
 * - 支援者以上が文で提案を出す。行動への提案は、どの行動かを選ぶ。
 * - 支援リーダー以上が、まだ決めていない提案を「採用」か「見送り」にする（1回だけ。サーバーの 0017 でも同じ決まり）。
 * - 採用しても、行動や計画は自動では変わらない。採用した人が編集して反映する。
 * - 閲覧者は見るだけ。提案はアプリからは通知しない（決定75 と同じく、画面に出すだけ）。
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canDecideProposal, canPropose, createProposal, decideProposal } from '../db/repo';
import { useApp } from '../state';
import { formatDateTimeJa } from '../lib/date';
import { PROPOSAL_STATUS_LABEL, type Behavior, type Proposal } from '../db/types';
import { Chip } from './ui';

export function Proposals({ kind, behaviors = [] }: { kind: Proposal['kind']; behaviors?: Behavior[] }) {
  const { person, me, members, userId } = useApp();
  const personId = person?.id ?? '';
  const list = useLiveQuery(
    async () =>
      personId
        ? (await db.proposals.where('personId').equals(personId).filter((p) => !p.deletedAt && p.kind === kind).toArray()).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
        : [],
    [personId, kind],
  );
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [sent, setSent] = useState(false);
  if (!person || !userId || !list) return null;

  const proposable = canPropose(me?.role);
  const decidable = canDecideProposal(me?.role);
  const open = list.filter((p) => p.status === 'open');
  const done = list.filter((p) => p.status !== 'open');
  const nameOf = (uid: string | null) => (uid ? members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー' : '');
  const behaviorName = (id: string | null) => behaviors.find((b) => b.id === id)?.name ?? '（いまはない行動）';
  const needsTarget = kind === 'behavior';
  const ready = body.trim().length > 0 && (!needsTarget || !!target);

  async function send() {
    if (!ready) return;
    await createProposal(person!.id, kind, needsTarget ? target : null, body, userId!);
    setBody('');
    setTarget(null);
    setSent(true);
  }

  async function decide(p: Proposal, status: 'adopted' | 'rejected') {
    const msg =
      status === 'adopted'
        ? 'この提案を「採用」にしますか？ 一度決めると変えられません。採用しても内容は自動では変わらないので、このあと編集して反映してください。'
        : 'この提案を「見送り」にしますか？ 一度決めると変えられません。';
    if (!window.confirm(msg)) return;
    await decideProposal(p.id, status, userId!);
  }

  const row = (p: Proposal) => (
    <div key={p.id} className="today-row stack proposal" style={{ gap: 4 }}>
      {p.kind === 'behavior' && <span className="label">{behaviorName(p.behaviorId)}</span>}
      <span className="proposal__body">{p.body}</span>
      <span className="muted">
        {formatDateTimeJa(p.createdAt)} ・ {nameOf(p.proposedBy)}
        {p.status !== 'open' && (
          <>
            {' ・ '}
            <strong>{PROPOSAL_STATUS_LABEL[p.status]}</strong>
            {p.decidedBy && `（${nameOf(p.decidedBy)}${p.decidedAt ? `、${formatDateTimeJa(p.decidedAt)}` : ''}）`}
          </>
        )}
      </span>
      {p.status === 'open' && decidable && (
        <div className="grid-2">
          <button type="button" className="btn" onClick={() => decide(p, 'rejected')}>見送り</button>
          <button type="button" className="btn btn--primary" onClick={() => decide(p, 'adopted')}>採用</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="section">
      <h2 className="card__title">{kind === 'behavior' ? '行動の定義への提案' : '支援計画への提案'}</h2>
      <div className="card stack">
        {open.length === 0 && <span className="muted">まだ決めていない提案はありません。</span>}
        {open.map(row)}

        {proposable && (
          <div className="stack proposal__form">
            {needsTarget && (
              <>
                <span className="label">どの行動への提案ですか？</span>
                <div className="chips">
                  {behaviors.map((b) => (
                    <Chip key={b.id} on={target === b.id} onClick={() => setTarget(target === b.id ? null : b.id)}>
                      {b.name}
                    </Chip>
                  ))}
                </div>
              </>
            )}
            <label className="field">
              {kind === 'behavior' ? '提案（例: 「たたく」に、机をたたくのも入れてはどうか）' : '提案（例: 学校でも休憩カードを使いたい）'}
              <textarea
                value={body}
                maxLength={2000}
                onChange={(e) => {
                  setBody(e.target.value);
                  setSent(false);
                }}
              />
            </label>
            <button type="button" className="btn btn--primary btn--block" disabled={!ready} onClick={send}>提案を送る</button>
            {sent && <p className="help" role="status">送りました。支援リーダー以上の人が、採用か見送りを決めます。</p>}
          </div>
        )}

        <p className="help">
          {decidable
            ? '採用しても、行動や計画は自動では変わりません。採用した人が編集して反映してください。採用・見送りは1回だけ決められます。'
            : proposable
              ? '提案は、管理者・副管理者・支援リーダーが採用か見送りを決めます。採用しても自動では変わらず、採用した人が編集して反映します。'
              : '提案を出せるのは支援者以上、採用・見送りを決めるのは支援リーダー以上です。'}
        </p>

        {done.length > 0 && (
          <>
            <button type="button" className="btn btn--outline btn--block" onClick={() => setShowDone(!showDone)}>
              {showDone ? '決めた提案を閉じる' : `決めた提案を見る（${done.length}件）`}
            </button>
            {showDone && done.map(row)}
          </>
        )}
      </div>
    </div>
  );
}
