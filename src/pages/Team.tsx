/**
 * チーム（6.9、ワイヤーフレーム 4）。対象者のプロフィール、メンバーの一覧と「家族」の印・睡眠の入力の許可（決定37）、申し送り（6.10）。
 * AI・睡眠不足の判定・書き出し・チームの削除は「チームの設定」にある。
 * サーバーにつながる設定があるときは、招待コード・招待リンク・QR を作り、参加した人を承認できる（決定44、7.4.2 #3）。
 * 管理者・副管理者・支援リーダーは、ほかのメンバーの役割を変えたり、停止したりできる（7章 #2）。
 * 所属（家族・施設・学校・その他）で絞って、まとめて停止もできる（7.4.2、14.2 #26。【暫定】2026-11-07 の試作）。
 * 管理者の引き継ぎ（6.9）: 管理者が指名して相手が受ける／副管理者が申し込み、14日のあいだ管理者が断らなければ入れかわる。
 * 申し送りは TeamNotes（ホームにも新しい3件を出す。決定116）。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { inviteUrl } from '../lib/inviteLink';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { assignableRoles, canExport, canInvite, canManageMember, setMemberFlags } from '../db/repo';
import { supabase } from '../server/supabase';
import { runSync, syncStatus } from '../server/sync';
import { TeamNotes } from '../components/TeamNotes';
import { formatDateTimeJa, nowISO } from '../lib/date';
import { AFFILIATION_LABEL, ROLE_LABEL, type Affiliation, type Role, type TeamMember } from '../db/types';
import { Chip, Sheet, TopBar } from '../components/ui';
import { DeviceList } from '../components/Devices';
import { formerAdminRole, isDue, TRANSFER_RESULT_LABEL, useOwnerTransfers } from '../lib/ownerTransfer';

export default function Team() {
  const { person, members, me, userId, aiEnabled } = useApp();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  if (!person || !userId) return null;
  const isAdmin = me?.role === 'admin';
  const admin = members.find((m) => m.role === 'admin');
  const subadmins = members.filter((m) => m.role === 'subadmin').map((m) => m.displayName).join('・');
  const current = editing ? members.find((m) => m.id === editing.id) ?? editing : null;

  return (
    <div className="page">
      <TopBar title="チーム" sub={`${person.displayName} ・ 管理者: ${admin?.displayName ?? '—'}${subadmins ? ` ・ 副管理者: ${subadmins}` : ''} ・ ${members.length}名`} />
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
                  {m.jobTitle && ` ・ ${m.jobTitle}`}
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
                {m.approvedAt !== null && (canInvite(me?.role) || canManageMember(me, m)) && <button type="button" className="btn btn--sm" onClick={() => setEditing(m)}>変更</button>}
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

      {canInvite(me?.role) && <BulkSuspend />}

      {supabase && <Handover personId={person.id} />}

      <TeamNotes />

      <div className="section">
        <Link to="/team/settings" className="card row row--between team-settings-link">
          <span className="stack" style={{ gap: 2 }}>
            <strong>同意と設定</strong>
            <span className="muted">AI利用: {aiEnabled ? 'あり' : 'なし'} ・ 睡眠不足の判定 ・ データの書き出し</span>
          </span>
          <span className="today-row__go" aria-hidden="true">›</span>
        </Link>
      </div>

      <div className="section stack">
        <Link to="/me" className="card row row--between team-settings-link">
          <span className="stack" style={{ gap: 2 }}>
            <strong>あなたの設定</strong>
            <span className="muted">{supabase ? 'アカウント・同意・文字の大きさ・ログアウト' : '同意・文字の大きさ'}</span>
          </span>
          <span className="today-row__go" aria-hidden="true">›</span>
        </Link>
        {canExport(me?.role) && (
          <Link to="/team/audit" className="card row row--between team-settings-link">
            <span className="stack" style={{ gap: 2 }}>
              <strong>監査ログ</strong>
              <span className="muted">誰が・いつ・何を変えたか（支援リーダー以上）</span>
            </span>
            <span className="today-row__go" aria-hidden="true">›</span>
          </Link>
        )}
      </div>

      {supabase && <Account />}

      {current && (
        <Sheet title={`${current.displayName}（${ROLE_LABEL[current.role]}）`} onClose={() => setEditing(null)}>
          <div className="stack">
            {canInvite(me?.role) && <JobTitle key={current.id} member={current} userId={userId} />}
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
                {current.mfaOverrideAt && (
                  <>
                    <label className="field">
                      多要素認証（MFA）
                      <select
                        value={current.mfaOverride ?? ''}
                        onChange={(e) => setMemberFlags(current.id, { mfaOverride: (e.target.value || null) as TeamMember['mfaOverride'] }, userId)}
                      >
                        <option value="">チームの基準どおり</option>
                        <option value="required">この人は必須</option>
                        {current.role !== 'admin' && current.role !== 'subadmin' && <option value="exempt">この人は免除</option>}
                      </select>
                    </label>
                    <p className="help">基準は「同意と設定」で決めます。管理者と副管理者は免除にできません。必須にしたときは、7日のうちに設定してもらいます。</p>
                  </>
                )}
              </>
            )}
            {supabase && !person.isSample && canInvite(me?.role) && current.userId !== userId && !current.deletedAt && (
              <div className="stack">
                <span className="label">ログインしている端末</span>
                <DeviceList
                  key={current.id}
                  userId={current.userId}
                  personId={person.id}
                  mine={false}
                  canLogout={isAdmin || (current.role !== 'admin' && current.role !== 'subadmin')}
                />
                <p className="help">
                  端末をなくした・盗まれたと連絡があったときに使います。すぐにその端末からはチームのデータが読めなくなり、つながったときに端末の中のデータを消します。管理者・副管理者の端末は、管理者だけがログアウトさせられます。
                </p>
              </div>
            )}
            <button type="button" className="btn btn--block" onClick={() => setEditing(null)}>閉じる</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/**
 * 招待コードを作る。コードは使い切りで72時間有効（仕様書 7章 #3）。
 * 同じコードを、リンクと QR でも渡せる（6.9）。送るのは端末の共有メニューかコピーで、アプリからは送らない。メールでの招待はこのあと足す
 */
function Invite({ personId, isAdmin }: { personId: string; isAdmin: boolean }) {
  // 初めは一番小さい権限（閲覧者）にしておき、必要なときだけ上げる（仕様書 7.4.2 #3）
  const [role, setRole] = useState<Role>('viewer');
  const [family, setFamily] = useState(false); // 「家族」の印（管理者だけが付けられる。サーバーの 0018 でも同じ決まり）
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roles: Role[] = isAdmin ? ['subadmin', 'leader', 'supporter', 'viewer'] : ['leader', 'supporter', 'viewer'];
  async function make() {
    setError(null);
    // 印を付けないときは、前と同じ形で呼ぶ
    const args = isAdmin && family ? { p_person: personId, p_role: role, p_family: true } : { p_person: personId, p_role: role };
    const { data, error } = await supabase!.rpc('create_invite', args);
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
      {isAdmin && (
        <>
          <label className="row row--between">
            <span className="label">「家族」の印を付ける</span>
            <input type="checkbox" checked={family} onChange={(e) => { setFamily(e.target.checked); setCode(null); }} style={{ width: 22, height: 22 }} />
          </label>
          <p className="help" style={{ marginTop: 0 }}>父・きょうだいなど。睡眠の入力ができるようになります。参加する人が所属を「家族」と選んでも、ここで付けないと印は付きません。</p>
        </>
      )}
      <button type="button" className="btn btn--outline btn--block" onClick={make}>招待コードを作る</button>
      {code && (
        <>
          <p className="notice-inline" role="status">
            招待コード: <strong style={{ letterSpacing: 2 }}>{code}</strong>（{ROLE_LABEL[role]}{isAdmin && family ? '・「家族」の印つき' : ''}として参加。72時間・1回だけ使えます）
          </p>
          <InviteLink code={code} />
        </>
      )}
      {error && <p className="ai-error" role="alert">{error}</p>}
      <p className="help">
        コード・リンク・QR のどれか1つを、相手に直接渡してください。相手はリンクか QR から開くか、「はじめて使う」でコードを入れてアカウントを作ります。
        参加したあと、ここで承認すると記録が見られます。リンクを知っている人はだれでも参加を申し込めるので、グループのチャットなどには貼らないでください。
      </p>
    </div>
  );
}

/** 招待リンクと QR。QR はこの端末の中で作る（外のサービスには送らない） */
function InviteLink({ code }: { code: string }) {
  const url = inviteUrl(code);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);
  const canShare = typeof navigator.share === 'function';
  async function share() {
    try {
      await navigator.share({ title: '行動の記録への招待', text: 'チームへの招待です。72時間以内に開いてください。', url });
    } catch {
      // 閉じたときは何もしない
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="stack">
      <span className="label">招待リンク</span>
      <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="招待リンク" />
      <div className={canShare ? 'grid-2' : undefined}>
        {canShare && <button type="button" className="btn btn--primary" onClick={share}>リンクを送る</button>}
        <button type="button" className="btn btn--outline" onClick={copy}>{copied ? 'コピーしました' : 'リンクをコピー'}</button>
      </div>
      {qr && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <img src={qr} width={200} height={200} alt={`招待リンクの QR コード（${code}）`} />
          <span className="help">目の前の人には、この QR を読んでもらえます。</span>
        </div>
      )}
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

/** サーバーとの同期の状態（ログアウトは「あなたの設定」） */
function Account() {
  const st = useSyncExternalStore(syncStatus.subscribe, syncStatus.get);
  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>サーバーとの同期</h2>
        <span className="muted">
          {st.running ? '同期しています…' : st.lastAt ? `最後に同期: ${formatDateTimeJa(st.lastAt)}` : 'まだ同期していません'}
          {st.pending > 0 && ` ・ 送れていない変更 ${st.pending} 件`}
        </span>
        {st.error && <p className="ai-error" role="alert">{st.error}</p>}
        <p className="help">いまサーバーと共有しているのは、対象者・メンバー・チームの設定・行動・記録・インターバル記録・ABC記録・睡眠・場所・「観察していなかった日」・好きなもの（写真も）・支援計画（変更と合意）・支援者の提案・行動の定義の変更・身体拘束の記録・支援会議メモ・申し送り・管理者の引き継ぎ・AI の分析と提案（採否も）です。ABC集計の AI のまとめは、この端末の中だけです。ログアウトは「あなたの設定」からできます。</p>
      </div>
    </div>
  );
}

/** 職種（0019）。支援リーダー以上が書きかえる。権限とは関係ない。入れ終えたとき（欄から離れたとき・シートを閉じたとき）に保存する */
function JobTitle({ member, userId }: { member: TeamMember; userId: string }) {
  const [v, setV] = useState(member.jobTitle ?? '');
  const latest = useRef({ v, saved: member.jobTitle ?? '' });
  latest.current.v = v;
  const save = () => {
    const t = latest.current.v.trim();
    if (t === latest.current.saved) return;
    latest.current.saved = t;
    void setMemberFlags(member.id, { jobTitle: t }, userId);
  };
  // シートを閉じると欄が消えるので、そのときにも保存する
  useEffect(() => save, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <label className="field">
        職種（任意）
        <input className="input" value={v} maxLength={40} placeholder="例: サービス管理責任者・支援員・担任" onChange={(e) => setV(e.target.value)} onBlur={save} />
      </label>
      <p className="help">メンバー一覧に「所属 ・ 職種」で出ます。できること（役割）は変わりません。</p>
    </>
  );
}

/**
 * 所属でまとめて停止（退職・異動・卒業がまとまってあるとき。7.4.2、14.2 #26）。【暫定】（2026-11-07 の試作）
 * 1人ずつの停止と同じ決まり: 自分・管理者は入らない。副管理者を停止できるのは管理者だけ。停止はあとで1人ずつ外せる。
 */
function BulkSuspend() {
  const { me, members, userId } = useApp();
  const [aff, setAff] = useState<Affiliation | null>(null);
  const [done, setDone] = useState('');
  if (!me || !userId) return null;
  const isAdmin = me.role === 'admin';
  const can = (m: TeamMember) =>
    m.userId !== me.userId && m.approvedAt !== null && !m.suspendedAt && m.role !== 'admin' && (isAdmin || m.role !== 'subadmin');
  const targets = aff ? members.filter((m) => m.affiliation === aff && can(m)) : [];
  async function run() {
    if (!aff || !targets.length || !userId) return;
    const names = targets.map((m) => m.displayName).join('、');
    if (!window.confirm(`所属が「${AFFILIATION_LABEL[aff]}」の ${targets.length}人を停止しますか？\n${names}\nすぐにこのチームの記録が見られなくなり、その人たちの端末に残った記録も次の通信で消えます。停止はあとで1人ずつ外せます。`)) return;
    const t = nowISO();
    for (const m of targets) await setMemberFlags(m.id, { suspendedAt: t }, userId);
    setDone(`${targets.length}人を停止しました（${names}）。`);
    setAff(null);
  }
  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>所属でまとめて停止</h2>
        <p className="help" style={{ margin: 0 }}>職員の異動・退職や卒業がまとまってあるときに使います。あなた自身と管理者は入りません{isAdmin ? '' : '。副管理者を停止できるのは管理者だけです'}。</p>
        <div className="chips">
          {(Object.keys(AFFILIATION_LABEL) as Affiliation[]).map((a) => (
            <Chip key={a} on={aff === a} onClick={() => { setAff(aff === a ? null : a); setDone(''); }}>{AFFILIATION_LABEL[a]}</Chip>
          ))}
        </div>
        {aff && (
          <p className="help" style={{ margin: 0 }}>
            {targets.length ? `停止する人: ${targets.map((m) => m.displayName).join('、')}（${targets.length}人）` : 'この所属で停止できる人はいません。'}
          </p>
        )}
        <button type="button" className="btn btn--danger btn--block" disabled={!targets.length} onClick={run}>
          {aff && targets.length ? `「${AFFILIATION_LABEL[aff]}」の ${targets.length}人を停止する` : '所属を選んでください'}
        </button>
        {done && <p className="help" role="status" style={{ margin: 0 }}>{done}</p>}
      </div>
    </div>
  );
}
