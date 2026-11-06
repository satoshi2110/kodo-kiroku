/**
 * チーム（6.9、ワイヤーフレーム 4）。対象者のプロフィール、メンバーの一覧と「家族」の印・睡眠の入力の許可（決定37）、申し送り（6.10）。
 * AI・睡眠不足の判定・書き出し・チームの削除は「チームの設定」にある。
 * サーバーにつながる設定があるときは、招待コードを作り、参加した人を承認できる（決定44、7.4.2 #3）。
 * 管理者・副管理者・支援リーダーは、ほかのメンバーの役割を変えたり、停止したりできる（7章 #2）。
 * 管理者の引き継ぎ（6.9）: 管理者が指名して相手が受ける／副管理者が申し込み、14日のあいだ管理者が断らなければ入れかわる。
 * 申し送りは、いまはこの端末の中だけ（同期はこのあと足す）。
 */
import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { assignableRoles, canInvite, canManageMember, canRecord, setMemberFlags } from '../db/repo';
import { supabase } from '../server/supabase';
import { runSync, syncStatus, unsentCount } from '../server/sync';
import { signOut } from '../server/session';
import { addComment, removeComment } from '../db/phase2';
import { formatDateTimeJa, nowISO } from '../lib/date';
import { AFFILIATION_LABEL, ROLE_LABEL, type Role, type TeamMember } from '../db/types';
import { Sheet, TopBar } from '../components/ui';
import { formerAdminRole, isDue, TRANSFER_RESULT_LABEL, useOwnerTransfers } from '../lib/ownerTransfer';

export default function Team() {
  const { person, members, me, userId, aiEnabled } = useApp();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [text, setText] = useState('');
  const notes = useLiveQuery(
    async () =>
      person
        ? (await db.comments.where('personId').equals(person.id).filter((c) => c.target === 'team' && !c.deletedAt).toArray())
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 30)
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
  const isAdmin = me?.role === 'admin';
  const admin = members.find((m) => m.role === 'admin');
  const current = editing ? members.find((m) => m.id === editing.id) ?? editing : null;

  return (
    <div className="page">
      <TopBar title="チーム" sub={`${person.displayName} ・ 管理者: ${admin?.displayName ?? '—'} ・ ${members.length}名`} />
      <div className="section">
        <Link to="/person" className="card row row--between team-settings-link">
          <span className="stack" style={{ gap: 2 }}>
            <strong>対象者: {person.displayName}</strong>
            <span className="muted">{[person.belongs, person.cautions ? '気をつけること あり' : ''].filter(Boolean).join(' ・ ') || 'プロフィール（生まれた年月・通っているところ・気をつけること）'}</span>
          </span>
          <span className="today-row__go" aria-hidden="true">›</span>
        </Link>
      </div>

      <div className="section">
        <div className="card">
          <h2 className="card__title">メンバー</h2>
          {members.map((m) => (
            <div key={m.id} className="row row--between today-row">
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span>
                  {m.displayName}
                  {m.userId === userId && <span className="muted">（あなた）</span>}
                </span>
                <span className="muted">
                  {AFFILIATION_LABEL[m.affiliation]}
                  {m.familyMark && ' ・ 家族の印'}
                  {m.sleepInputAllowed && ' ・ 睡眠の入力を許可'}
                </span>
              </span>
              <span className="row">
                <span className="badge badge--role">{ROLE_LABEL[m.role]}</span>
                {m.approvedAt === null && <span className="badge badge--problem">承認待ち</span>}
                {m.suspendedAt && <span className="badge badge--problem">停止中</span>}
                {m.approvedAt === null && canInvite(me?.role) && (m.role !== 'subadmin' || isAdmin) && (
                  <button type="button" className="btn btn--sm" onClick={() => setMemberFlags(m.id, { approvedAt: nowISO() }, userId)}>承認する</button>
                )}
                {((isAdmin && m.approvedAt != null) || canManageMember(me, m)) && <button type="button" className="btn btn--sm" onClick={() => setEditing(m)}>変更</button>}
              </span>
            </div>
          ))}
        </div>
        {supabase && canInvite(me?.role) ? (
          <Invite personId={person.id} isAdmin={isAdmin} />
        ) : (
          <p className="help">
            {supabase ? '' : 'ほかの人の招待は、サーバーとログインの準備ができてから使えるようになります。'}「家族」の印の人は睡眠も入力できます。
          </p>
        )}
      </div>

      {supabase && <Handover personId={person.id} />}

      <div className="section">
        <div className="card stack">
          <h2 className="card__title" style={{ margin: 0 }}>申し送り</h2>
          {canRecord(me?.role) && (
            <div className="row">
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="今日の様子を一言で書く" maxLength={200} />
              <button type="button" className="btn btn--sm" disabled={!text.trim()} onClick={post}>送る</button>
            </div>
          )}
          {(notes ?? []).length === 0 && <span className="muted">まだありません。</span>}
          {(notes ?? []).map((c) => (
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
          <p className="help">責める言い方を避け、できたことや気づいたことを短く書きましょう。{supabase ? 'チームの人に共有されます。' : 'いまはこの端末の中だけに残ります（共有はログインができてから）。'}</p>
        </div>
      </div>

      <div className="section">
        <Link to="/team/settings" className="card row row--between team-settings-link">
          <span className="stack" style={{ gap: 2 }}>
            <strong>同意と設定</strong>
            <span className="muted">AI利用: {aiEnabled ? 'あり' : 'なし'} ・ 睡眠不足の判定 ・ データの書き出し</span>
          </span>
          <span className="today-row__go" aria-hidden="true">›</span>
        </Link>
      </div>

      {supabase && <Account />}

      {current && (
        <Sheet title={`${current.displayName}（${ROLE_LABEL[current.role]}）`} onClose={() => setEditing(null)}>
          <div className="stack">
            {canManageMember(me, current) && (
              <>
                <label className="field">
                  役割
                  <select value={current.role} onChange={(e) => setMemberFlags(current.id, { role: e.target.value as Role }, userId)}>
                    {assignableRoles(me?.role).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </label>
                <p className="help">閲覧者は見るだけ、支援者は記録できる、支援リーダーは行動の設定や招待もできます。{isAdmin ? '' : '副管理者にできるのは管理者だけです。'}</p>
                {current.suspendedAt ? (
                  <button type="button" className="btn btn--outline btn--block" onClick={() => setMemberFlags(current.id, { suspendedAt: null }, userId)}>停止を外す</button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--danger btn--block"
                    onClick={() =>
                      window.confirm(`${current.displayName}さんを停止しますか？\nすぐにこのチームの記録が見られなくなり、その人の端末に残った記録も次の通信で消えます。あとで停止を外すこともできます。`) &&
                      setMemberFlags(current.id, { suspendedAt: nowISO() }, userId)
                    }
                  >
                    停止する
                  </button>
                )}
                <p className="help">退職・異動・卒業のときに使います。{current.suspendedAt ? `${formatDateTimeJa(current.suspendedAt)}に停止しました。` : ''}</p>
              </>
            )}
            {isAdmin && (
              <>
                <label className="row row--between">
                  <span className="label">「家族」の印</span>
                  <input type="checkbox" checked={current.familyMark} onChange={(e) => setMemberFlags(current.id, { familyMark: e.target.checked }, userId)} style={{ width: 22, height: 22 }} />
                </label>
                <p className="help">父・きょうだいなど。役割とは別の印で、睡眠の入力ができるようになります。ほかの権限は変わりません。</p>
                <label className="row row--between">
                  <span className="label">睡眠の入力を許可</span>
                  <input type="checkbox" checked={current.sleepInputAllowed} onChange={(e) => setMemberFlags(current.id, { sleepInputAllowed: e.target.checked }, userId)} style={{ width: 22, height: 22 }} />
                </label>
                <p className="help">入所施設などで、夜のようすを職員が分かっているときに付けます。</p>
              </>
            )}
            <button type="button" className="btn btn--block" onClick={() => setEditing(null)}>閉じる</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** 招待コードを作る。コードは使い切りで72時間有効（仕様書 7章 #3）。メールでの招待はこのあと足す */
function Invite({ personId, isAdmin }: { personId: string; isAdmin: boolean }) {
  // 初めは一番小さい権限（閲覧者）にしておき、必要なときだけ上げる（仕様書 7.4.2 #3）
  const [role, setRole] = useState<Role>('viewer');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roles: Role[] = isAdmin ? ['subadmin', 'leader', 'supporter', 'viewer'] : ['leader', 'supporter', 'viewer'];
  async function make() {
    setError(null);
    const { data, error } = await supabase!.rpc('create_invite', { p_person: personId, p_role: role });
    if (error) setError(error.message);
    else setCode(data as string);
  }
  return (
    <div className="card stack" style={{ marginTop: 8 }}>
      <h2 className="card__title" style={{ margin: 0 }}>招待する</h2>
      <label className="field">
        役割
        <select value={role} onChange={(e) => { setRole(e.target.value as Role); setCode(null); }}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn--outline btn--block" onClick={make}>招待コードを作る</button>
      {code && (
        <p className="notice-inline" role="status">
          招待コード: <strong style={{ letterSpacing: 2 }}>{code}</strong>（{ROLE_LABEL[role]}として参加。72時間・1回だけ使えます）
        </p>
      )}
      {error && <p className="ai-error" role="alert">{error}</p>}
      <p className="help">相手に直接伝えてください。相手は「はじめて使う」でアカウントを作り、このコードを入れます。参加したあと、ここで承認すると記録が見られます。</p>
    </div>
  );
}

/**
 * 管理者の引き継ぎ（6.9）。管理者は副管理者か「家族」の印の人を指名し、相手が受けたら入れかわる。
 * 管理者が操作できないときは、副管理者が申し込む。14日のあいだ管理者が断らなければ、副管理者が管理者になる。
 * 進んでいる間も、記録と閲覧は止まらない。申し込み・返事・入れかわりはサーバーの監査ログに残る。
 */
function Handover({ personId }: { personId: string }) {
  const { members, me, userId } = useApp();
  const transfers = useOwnerTransfers(personId);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me || !userId || !transfers) return null;
  const { pending, last } = transfers;
  const isAdmin = me.role === 'admin';
  const isSub = me.role === 'subadmin';
  if (!pending && !last && !isAdmin && !isSub) return null;
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '（チームにいない人）';
  const candidates = members.filter((m) => m.userId !== userId && m.approvedAt != null && !m.suspendedAt && (m.role === 'subadmin' || m.familyMark));

  async function call(fn: string, args: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase!.rpc(fn, args);
    setBusy(false);
    if (error) return setError(error.message);
    setTo('');
    await runSync();
  }
  const answer = (accept: boolean, confirmText?: string) => call('answer_owner_transfer', { p_id: pending!.id, p_accept: accept }, confirmText);

  let body: JSX.Element;
  if (pending) {
    const from = nameOf(pending.fromUser);
    const toName = nameOf(pending.toUser);
    const after = `${toName}さんが管理者に、${from}さんは${formerAdminRole(pending, members)}になります。`;
    const due = pending.dueAt ? formatDateTimeJa(pending.dueAt) : '';
    if (pending.method === 'nominate') {
      body =
        pending.toUser === userId ? (
          <>
            <p className="notice-inline" role="status">管理者の{from}さんから、管理者の引き継ぎを頼まれています。受けると、{after}</p>
            <button type="button" className="btn btn--block" disabled={busy} onClick={() => answer(true, `管理者を引き継ぎますか？\n${after}`)}>受けて管理者になる</button>
            <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => answer(false, '引き継ぎを断りますか？')}>断る</button>
          </>
        ) : pending.fromUser === userId ? (
          <>
            <span>{toName}さんに引き継ぎをお願いしています。返事を待っています（{formatDateTimeJa(pending.requestedAt)}）。</span>
            <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => answer(false, '引き継ぎのお願いを取り下げますか？')}>取り下げる</button>
          </>
        ) : (
          <span>{from}さん（管理者）が{toName}さんに引き継ぎをお願いしています。受けると、{after}</span>
        );
    } else {
      body =
        pending.fromUser === userId ? (
          <>
            <p className="notice-inline" role="status">
              副管理者の{toName}さんが、管理者になる申し込みをしました。{isDue(pending) ? '期限を過ぎたので、もう断れません。' : `${due}までに断らなければ、${after}`}
            </p>
            {!isDue(pending) && (
              <button type="button" className="btn btn--block" disabled={busy} onClick={() => answer(false, '申し込みを断りますか？ あなたが管理者のままです。')}>断る（管理者のまま）</button>
            )}
            <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => answer(true, `いま引き継ぎますか？\n${after}`)}>いま引き継ぐ</button>
          </>
        ) : pending.toUser === userId ? (
          <>
            <span>管理者になる申し込みをしました（{formatDateTimeJa(pending.requestedAt)}）。{isDue(pending) ? '期限を過ぎました。' : `${due}まで管理者の返事を待ちます。断られなければ、そのあと管理者になります。`}</span>
            {isDue(pending) && (
              <button type="button" className="btn btn--block" disabled={busy} onClick={() => call('finish_admin_request', { p_id: pending.id })}>管理者になる</button>
            )}
            <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => answer(false, '申し込みを取り下げますか？')}>取り下げる</button>
          </>
        ) : (
          <span>副管理者の{toName}さんが、管理者になる申し込みをしています。{due}までに{from}さん（管理者）が断らなければ、{after}</span>
        );
    }
  } else {
    body = (
      <>
        {last && (
          <span className="muted">
            前回: {formatDateTimeJa(last.decidedAt ?? last.requestedAt)} ・ {nameOf(last.fromUser)} → {nameOf(last.toUser)}（{last.method === 'nominate' ? '指名' : '副管理者の申し込み'}）・ {TRANSFER_RESULT_LABEL[last.result]}
          </span>
        )}
        {isAdmin &&
          (candidates.length ? (
            <>
              <label className="field">
                引き継ぐ人
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">選んでください</option>
                  {candidates.map((m) => <option key={m.id} value={m.userId}>{m.displayName}（{m.role === 'subadmin' ? ROLE_LABEL[m.role] : '家族の印'}）</option>)}
                </select>
              </label>
              <button
                type="button"
                className="btn btn--outline btn--block"
                disabled={busy || !to}
                onClick={() => call('nominate_admin', { p_person: personId, p_to_user: to }, `${nameOf(to)}さんに管理者の引き継ぎをお願いしますか？\n相手が受けると入れかわります。`)}
              >
                引き継ぎをお願いする
              </button>
              <p className="help">指名できるのは、副管理者か「家族」の印がある人です。相手が受けると、あなたは{to ? formerAdminRole({ toUser: to }, members) : '副管理者（ほかに副管理者がいるときは支援リーダー）'}になります。</p>
            </>
          ) : (
            <p className="help">引き継げるのは、副管理者か「家族」の印がある人です。先にメンバーの「変更」で決めてください。</p>
          ))}
        {isSub && (
          <>
            <button
              type="button"
              className="btn btn--outline btn--block"
              disabled={busy}
              onClick={() => call('request_admin', { p_person: personId }, '管理者になる申し込みをしますか？\n管理者に知らせ、14日のあいだに断られなければ、あなたが管理者になります。')}
            >
              管理者になる申し込みをする
            </button>
            <p className="help">管理者が病気などで操作できないときに使います。14日のあいだ、管理者は断ることができます。</p>
          </>
        )}
      </>
    );
  }
  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>管理者の引き継ぎ</h2>
        {body}
        {error && <p className="ai-error" role="alert">{error}</p>}
        {pending && <p className="help">引き継ぎの間も、記録と閲覧はいつもどおりできます。お願い・返事・入れかわりは記録に残ります。</p>}
      </div>
    </div>
  );
}

/** サーバーとの同期の状態とログアウト */
function Account() {
  const st = useSyncExternalStore(syncStatus.subscribe, syncStatus.get);
  async function logout() {
    const n = await unsentCount();
    const msg = n
      ? `まだサーバーに送れていない変更が ${n} 件あります。ログアウトすると、この端末から消えます。ログアウトしますか？`
      : 'ログアウトしますか？ この端末から、このチームのデータを消します（サーバーには残ります）。';
    if (window.confirm(msg)) await signOut();
  }
  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>サーバーとの同期</h2>
        <span className="muted">
          {st.running ? '同期しています…' : st.lastAt ? `最後に同期: ${formatDateTimeJa(st.lastAt)}` : 'まだ同期していません'}
          {st.pending > 0 && ` ・ 送れていない変更 ${st.pending} 件`}
        </span>
        {st.error && <p className="ai-error" role="alert">{st.error}</p>}
        <p className="help">いまサーバーと共有しているのは、対象者・メンバー・チームの設定・行動・記録・インターバル記録・ABC記録・睡眠・場所・「観察していなかった日」・好きなもの（写真も）・支援計画（変更と合意）・身体拘束の記録・支援会議メモ・申し送り・管理者の引き継ぎです。AI の結果は、この端末の中だけです。</p>
        <button type="button" className="btn btn--block" onClick={logout}>ログアウト</button>
      </div>
    </div>
  );
}
