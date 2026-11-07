/**
 * 多要素認証（MFA）の画面（7.4.3、決定34・53）。【暫定】（2026-11-07 の試作）方式は認証アプリのコード（TOTP）だけ。
 * - MfaCode: MFA を設定した人がパスワードでログインしたあと、6けたのコードを聞く画面
 * - MfaCard: 「あなたの設定」で、認証アプリを設定する・外す
 * - MfaBanner: このチームで MFA が必須なのに、まだ通していないとき（猶予の期限・閲覧だけ）の知らせ
 * 書き込みを止めるのはサーバー（0020）。ここは知らせて、設定してもらうための画面。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { formatDateTimeJa } from '../lib/date';
import { signOut, useSession } from '../server/session';
import { isAal2, mfaStatus, removeTotp, startTotp, verifiedTotp, verifyTotp, type MfaStatus } from '../server/mfa';
import { TopBar } from './ui';

const CODE_OK = /^\d{6}$/;

function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="field">
      認証アプリに出ている6けたのコード
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  );
}

/** ログインのあと: 認証アプリのコードを入れる */
export function MfaCode() {
  const { session } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const [f] = await verifiedTotp();
    const err = f ? await verifyTotp(f.id, code) : '認証アプリの設定が見つかりません。ログアウトして、もう一度ログインしてください。';
    setBusy(false);
    setCode('');
    if (err) setError(err);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="認証アプリのコード" sub={session?.user.email ?? undefined} />
      <form className="section stack" onSubmit={submit}>
        <p className="help" style={{ marginTop: 0 }}>
          このアカウントは多要素認証（MFA。パスワードのほかに、スマホの認証アプリのコードでも確かめるしくみ）を使っています。認証アプリを開いて、「行動の記録」の6けたのコードを入れてください。コードは30秒ごとに変わります。
        </p>
        <div className="card stack">
          <CodeInput value={code} onChange={setCode} autoFocus />
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !CODE_OK.test(code)}>
          {busy ? '確かめています…' : '確かめる'}
        </button>
        <button type="button" className="btn btn--outline btn--block" onClick={() => void signOut()}>ログアウト</button>
        <p className="help">認証アプリの入ったスマホをなくしたときは、運営に連絡してください。本人と確かめてから、認証アプリの設定を外します。</p>
      </form>
    </div>
  );
}

/** このチームでの自分の MFA の状態。ログインが変わったら（コードを入れたあとなど）読み直す */
function useMfaStatus(personId: string | undefined, isSample: boolean | undefined) {
  const { session } = useSession();
  const [st, setSt] = useState<MfaStatus | null>(null);
  const token = session?.access_token;
  const reload = useCallback(async () => {
    if (!personId || isSample || !token) return setSt(null);
    setSt(await mfaStatus(personId));
  }, [personId, isSample, token]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return [st, reload] as const;
}

const dueText = (iso: string) => formatDateTimeJa(iso);

/** 画面の上の知らせ: このチームでは MFA が必須なのに、まだ通していない */
export function MfaBanner() {
  const { person } = useApp();
  const [st] = useMfaStatus(person?.id, person?.isSample);
  if (!st || !st.required || st.aal2) return null;
  return (
    <div className="section" style={{ paddingBottom: 0 }}>
      <p className={st.ok ? 'notice-inline' : 'ai-error'} role="status" style={{ margin: 0 }}>
        {st.ok
          ? `このチームでは、あなたは多要素認証（MFA）が必須です。${st.dueAt ? dueText(st.dueAt) + ' までに' : ''}設定してください。過ぎると、記録を見ることはできますが、書くことができなくなります。`
          : 'このチームでは、あなたは多要素認証（MFA）が必須です。いまは閲覧だけで、記録を書けません（書いた分は端末に残っています）。'}{' '}
        <Link to="/me">「あなたの設定」で設定する</Link>
      </p>
    </div>
  );
}

/** 「あなたの設定」: 認証アプリを設定する・外す */
export function MfaCard() {
  const { person } = useApp();
  const [st, reloadSt] = useMfaStatus(person?.id, person?.isSample);
  const [factors, setFactors] = useState<{ id: string; createdAt: string }[] | null>(null);
  const [aal2, setAal2] = useState(false);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setFactors(await verifiedTotp());
    setAal2(await isAal2());
    await reloadSt();
  }, [reloadSt]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function begin() {
    setBusy(true);
    setError('');
    setDone('');
    const r = await startTotp();
    setBusy(false);
    if ('error' in r) setError(`始められませんでした（${r.error}）`);
    else setEnroll(r);
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    setError('');
    const err = await verifyTotp(enroll.id, code);
    setBusy(false);
    setCode('');
    if (err) return setError(err);
    await reload();
    setEnroll(null);
    setDone('設定しました。次からログインのときに、認証アプリのコードを聞きます。');
  }

  async function cancel() {
    if (enroll) await removeTotp(enroll.id);
    setEnroll(null);
    setCode('');
    setError('');
  }

  async function remove(id: string) {
    const warn = st?.required ? '\nこのチームでは、あなたは MFA が必須です。外すと、記録を書けなくなることがあります。' : '';
    if (!window.confirm(`認証アプリの設定を外しますか？ 次からは、パスワードだけでログインします。${warn}`)) return;
    setBusy(true);
    setError('');
    setDone('');
    const err = await removeTotp(id);
    await reload();
    setBusy(false);
    if (err) setError(`外せませんでした（${err}）`);
    else setDone('外しました。');
  }

  if (factors === null) return null;
  const has = factors.length > 0;
  const qrSrc = enroll ? (enroll.qr.startsWith('data:') ? enroll.qr : `data:image/svg+xml;utf-8,${encodeURIComponent(enroll.qr)}`) : '';

  return (
    <div className="section">
      <div className="card stack">
        <h2 className="card__title" style={{ margin: 0 }}>多要素認証（MFA）</h2>
        <p className="help" style={{ margin: 0 }}>
          パスワードのほかに、スマホの認証アプリ（Google Authenticator・Microsoft Authenticator など）に出る6けたのコードでも確かめます。パスワードを知られても、ほかの人がログインできないようにするためです。
        </p>
        {st && (
          <p className={st.required && !st.ok ? 'ai-error' : 'notice-inline'} style={{ margin: 0 }}>
            {!st.required
              ? `${person?.displayName}のチームでは、あなたの MFA は任意です。`
              : st.aal2
                ? `${person?.displayName}のチームでは、あなたは MFA が必須です。いまのログインは MFA を通しています。`
                : st.ok
                  ? `${person?.displayName}のチームでは、あなたは MFA が必須です。${st.dueAt ? dueText(st.dueAt) + ' までに' : ''}設定してください。`
                  : `${person?.displayName}のチームでは、あなたは MFA が必須です。いまは閲覧だけです。設定すると、書けるようになります。`}
          </p>
        )}

        {has && !enroll && (
          <>
            <span>設定ずみ（{formatDateTimeJa(factors[0].createdAt)}）</span>
            {aal2 ? (
              <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => void remove(factors[0].id)}>認証アプリの設定を外す</button>
            ) : (
              <p className="help" style={{ margin: 0 }}>外すときは、いちどログアウトして、コードを入れてログインし直してください。</p>
            )}
          </>
        )}

        {!has && !enroll && (
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void begin()}>認証アプリを設定する</button>
        )}

        {enroll && (
          <form className="stack" onSubmit={finish}>
            <p className="help" style={{ margin: 0 }}>1. 認証アプリで「QR コードをスキャン」を選び、次の QR コードを読み取ります。</p>
            <img src={qrSrc} alt="認証アプリに読み取らせる QR コード" width={180} height={180} style={{ alignSelf: 'center', background: '#fff', padding: 8, borderRadius: 8 }} />
            <details>
              <summary>QR コードを読み取れないとき</summary>
              <p className="help">認証アプリで「セットアップキーを入力」を選び、次のキーを入れます（ほかの人に見せないでください）。</p>
              <code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{enroll.secret}</code>
            </details>
            <p className="help" style={{ margin: 0 }}>2. 認証アプリに出た6けたのコードを入れて、「設定を終える」を押します。</p>
            <CodeInput value={code} onChange={setCode} />
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || !CODE_OK.test(code)}>{busy ? '確かめています…' : '設定を終える'}</button>
            <button type="button" className="btn btn--outline btn--block" disabled={busy} onClick={() => void cancel()}>やめる</button>
            <p className="help" style={{ margin: 0 }}>設定を終えると、あなたのアカウントでログインしているほかの端末は、ログアウトされます。</p>
          </form>
        )}

        {error && <p className="ai-error" role="alert">{error}</p>}
        {done && <p className="notice-inline" role="status">{done}</p>}
      </div>
    </div>
  );
}
