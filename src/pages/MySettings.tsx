/**
 * 個人の設定（画面一覧 16 のうち、自分のアカウントの部分）。
 * 【暫定】（2026-11-07 の試作）名前とメール、自分の同意、文字の大きさの案内、多要素認証（認証アプリ）、ログインしている端末と遠隔ログアウト（0021）、ログアウト、ほかの端末をすべてログアウト、画面の知らせのオン・オフ（この端末だけ。決定106・107）。
 * チームを抜ける（決定98、7.6）: 管理者は引き継いでから。抜ける前にまだ送っていない記録を送り、サーバーの leave_team（0019）を呼んで、この端末からそのチームのデータを消す。
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { formatDateTimeJa } from '../lib/date';
import { AFFILIATION_LABEL, ROLE_LABEL, type Consent } from '../db/types';
import { TopBar } from '../components/ui';
import { supabase } from '../server/supabase';
import { signOut, signOutOthers, useSession } from '../server/session';
import { runSync, unsentCount } from '../server/sync';
import { forgetTeam, saveDevice } from '../db/repo';
import { useNavigate } from 'react-router-dom';
import { MfaCard } from '../components/Mfa';
import { DeviceList } from '../components/Devices';
import { DEFAULT_REMINDER, prefsOf } from '../components/Notices';
import type { NotifyPrefs } from '../db/types';

const CONSENT_LABEL: Record<Consent['kind'], string> = {
  terms_privacy_sensitive: '利用規約・プライバシー・要配慮個人情報の取り扱い',
  ai_overseas: 'AI の利用（記録を仮名にして海外のサーバーへ送る）',
};

export default function MySettings() {
  const { person, me, userId } = useApp();
  const { session } = useSession();
  const [othersDone, setOthersDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const navigate = useNavigate();
  const consents = useLiveQuery(
    async () =>
      userId && person
        ? (await db.consents.where('userId').equals(userId).filter((c) => !c.deletedAt && (c.personId == null || c.personId === person.id)).toArray()).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
        : [],
    [userId, person?.id],
  );
  if (!person || !userId) return null;

  async function logout() {
    const n = await unsentCount();
    const msg = n
      ? `まだサーバーに送れていない変更が ${n} 件あります。ログアウトすると、この端末から消えます。ログアウトしますか？`
      : 'ログアウトしますか？ この端末から、このチームのデータを消します（サーバーには残ります）。';
    if (window.confirm(msg)) await signOut();
  }

  async function leave() {
    if (!supabase || !person) return;
    const p = person;
    if (!window.confirm(`「${p.displayName}」のチームを抜けますか？\nすぐにこのチームの記録が見られなくなり、この端末からもこのチームのデータを消します。あなたが付けた記録はチームに残り、「退会したメンバー」と出ます。もう一度入るには、招待し直してもらう必要があります。`)) return;
    setBusy(true);
    setLeaveError('');
    await runSync();
    const n = await unsentCount(p.id);
    if (n) {
      setBusy(false);
      setLeaveError(`まだサーバーに送れていない変更が ${n} 件あります。電波のあるところで、もう一度押してください。`);
      return;
    }
    const { error: e } = await supabase.rpc('leave_team', { p_person: p.id });
    if (e) {
      setBusy(false);
      setLeaveError(`抜けられませんでした（${e.message}）`);
      return;
    }
    await forgetTeam(p.id);
    setBusy(false);
    navigate('/', { replace: true });
  }

  async function logoutOthers() {
    if (!window.confirm('この端末はそのままで、あなたのアカウントでログインしているほかの端末を、すべてログアウトしますか？ ほかの端末でまだ送れていない変更は消えます。')) return;
    setBusy(true);
    setError('');
    const e = await signOutOthers();
    setBusy(false);
    if (e) setError(`できませんでした。通信を確かめて、もう一度押してください。（${e}）`);
    else setOthersDone(true);
  }

  return (
    <div className="page">
      <TopBar title="あなたの設定" back="/team" />

      <div className="section">
        <div className="card stack">
          <h2 className="card__title" style={{ margin: 0 }}>アカウント</h2>
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted">このチームでの名前</span>
            <strong>{me?.displayName || '—'}</strong>
            {me && <span className="muted">{AFFILIATION_LABEL[me.affiliation]} ・ {ROLE_LABEL[me.role]}</span>}
          </div>
          {session?.user.email && (
            <div className="stack" style={{ gap: 2 }}>
              <span className="muted">メールアドレス</span>
              <span style={{ overflowWrap: 'anywhere' }}>{session.user.email}</span>
            </div>
          )}
          <p className="help">名前はチームごとに付いています。ほかのメンバーにはこの名前で表示されます。</p>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <h2 className="card__title" style={{ margin: 0 }}>あなたの同意（{person.displayName}のチーム）</h2>
          {(consents ?? []).length === 0 && <span className="muted">この端末には、あなたの同意の記録がありません。</span>}
          {(consents ?? []).map((c) => (
            <div key={c.id} className="today-row stack" style={{ gap: 2 }}>
              <span>{CONSENT_LABEL[c.kind]}</span>
              <span className="muted">
                {formatDateTimeJa(c.createdAt)} に同意 ・ 文の版 {c.textVersion}
                {c.revokedAt && ` ・ ${formatDateTimeJa(c.revokedAt)} に取り消し`}
              </span>
            </div>
          ))}
          <p className="help">チームの AI の利用（あり・なし）は「同意と設定」で管理者が決めます。</p>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <h2 className="card__title" style={{ margin: 0 }}>文字の大きさ</h2>
          <p className="help" style={{ margin: 0 }}>
            文字の大きさは、端末の設定に合わせて変わります。iPhone は「設定」→「画面表示と明るさ」→「テキストサイズを変更」、Android は「設定」→「ディスプレイ」→「フォントサイズ」、パソコンはブラウザの拡大（Ctrl または ⌘ と ＋）で変えられます。
          </p>
        </div>
      </div>

      <NotifySettings />

      {supabase && !person.isSample && <MfaCard />}

      {supabase && <DeviceKind />}

      {supabase && !person.isSample && (
        <div className="section">
          <div className="card stack">
            <h2 className="card__title" style={{ margin: 0 }}>ログインしている端末</h2>
            <DeviceList userId={userId} mine canLogout />
            <p className="help" style={{ margin: 0 }}>
              端末をなくしたときは、ここでその端末をログアウトさせてください。すぐにその端末からはチームのデータが読めなくなり、その端末が次につながったときに、端末の中のデータを消します。手元に端末がないときは、チームの管理者か支援リーダーに頼めば、同じことができます。
            </p>
          </div>
        </div>
      )}

      {supabase && (
        <div className="section">
          <div className="card stack">
            <h2 className="card__title" style={{ margin: 0 }}>ログアウト</h2>
            <button type="button" className="btn btn--block" onClick={logout}>この端末からログアウト</button>
            <button type="button" className="btn btn--outline btn--block" disabled={busy || othersDone} onClick={logoutOthers}>
              {othersDone ? 'ほかの端末をログアウトしました' : 'ほかの端末をすべてログアウト'}
            </button>
            {error && <p className="ai-error" role="alert">{error}</p>}
            <p className="help">
              「この端末からログアウト」は、この端末だけをログアウトします。「ほかの端末をすべてログアウト」は、ほかの端末を、次にログインを更新するとき（長くて1時間ほど）にログアウトさせ、その端末からチームのデータを消します。パスワードを変えたいときは、ログイン画面の「パスワードを忘れた」から変えられます。
            </p>
          </div>
        </div>
      )}

      {supabase && !person.isSample && (
        <div className="section">
          <div className="card stack">
            <h2 className="card__title" style={{ margin: 0 }}>チームを抜ける</h2>
            {me?.role === 'admin' ? (
              <p className="help">管理者は、チームを抜ける前に「管理者の引き継ぎ」（チームの画面）で、ほかの人に管理者を渡してください。</p>
            ) : (
              <>
                <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={leave}>このチームを抜ける</button>
                {leaveError && <p className="ai-error" role="alert">{leaveError}</p>}
                <p className="help">
                  あなたが付けた記録はチームに残り、記録した人は「退会したメンバー」と出ます。アカウント（メールアドレス）そのものを消したいときは、運営に連絡してください。
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** この端末を自分専用にするか共用にするか（7.4.2 #1、決定61）。共用なら PIN を決め直せる。【暫定】（2026-11-07 の試作） */
function DeviceKind() {
  const dev = useLiveQuery(() => db.device.get('device'), []);
  if (!dev) return null;
  const shared = !!dev.shared;
  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>この端末</h2>
        <p className="help" style={{ margin: 0 }}>
          {shared
            ? 'いまは「共用の端末」です。10分さわらないとロックがかかり、PIN で外します。画面の上に、操作中の人の名前が出ます。'
            : 'いまは「自分専用の端末」です。アプリのロックはかけず、スマホのロックに任せます。90日使わなければ、もう一度ログインします。'}
        </p>
        {shared ? (
          <>
            <button type="button" className="btn btn--block" onClick={() => window.confirm('PIN を決め直しますか？ いまの PIN は使えなくなります。') && void saveDevice({ pin: null })}>
              PIN を決め直す
            </button>
            <button type="button" className="btn btn--outline btn--block" onClick={() => window.confirm('この端末を自分専用にしますか？ アプリのロックをやめ、PIN を消します。') && void saveDevice({ shared: false, pin: null, lockedAt: null })}>
              自分専用の端末にする
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--outline btn--block" onClick={() => window.confirm('この端末を共用にしますか？ このあと PIN を決めます。') && void saveDevice({ shared: true, pin: null, lockedAt: null })}>
            共用の端末にする（PIN と10分のロック）
          </button>
        )}
      </div>
    </div>
  );
}

/** 画面の知らせのオン・オフ（6.11、決定106・107）。この端末だけに残す */
function NotifySettings() {
  const dev = useLiveQuery(() => db.device.get('device'), []);
  if (dev === undefined) return null;
  const p = prefsOf(dev);
  const set = (v: Partial<NotifyPrefs>) => void saveDevice({ notify: { ...dev?.notify, ...v } });
  const items: { key: 'reminder' | 'review' | 'mention' | 'meeting'; label: string; sub: string }[] = [
    { key: 'reminder', label: '記録のリマインド', sub: `毎日 ${p.reminderTime} から・その日の記録がないときだけ` },
    { key: 'review', label: '支援計画の見直し日', sub: '前の日の 9:00 から' },
    { key: 'mention', label: 'コメントで @ で呼ばれたとき', sub: 'すぐに' },
    { key: 'meeting', label: '支援会議のメモができたとき', sub: '参加した会議だけ' },
  ];
  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>知らせ（この端末）</h2>
        <p className="help" style={{ margin: 0 }}>
          知らせは、アプリを開いているときに画面の上に出します。メールやスマホの通知は送りません。この設定はこの端末だけのもので、共用の端末では使う人みんなに同じになります。
        </p>
        {items.map((it) => (
          <label key={it.key} className="row" style={{ minHeight: 48 }}>
            <input type="checkbox" checked={p[it.key]} onChange={(e) => set({ [it.key]: e.target.checked })} style={{ width: 22, height: 22 }} />
            <span className="stack" style={{ gap: 0 }}>
              <span className="label">{it.label}</span>
              <span className="muted">{it.sub}</span>
            </span>
          </label>
        ))}
        {p.reminder && (
          <label className="field">
            リマインドを出す時刻
            <input type="time" value={p.reminderTime} onChange={(e) => set({ reminderTime: e.target.value || DEFAULT_REMINDER })} />
          </label>
        )}
        <p className="help" style={{ margin: 0 }}>強度3や身体拘束の記録が入っても、すぐの知らせは出しません。睡眠の入力も催促しません。</p>
      </div>
    </div>
  );
}
