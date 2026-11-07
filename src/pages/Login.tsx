/**
 * ログイン（画面一覧 1、ワイヤーフレーム 12）。サーバーにつながる設定があるときだけ出る。
 * アプリは一般公開しない（決定44）。アカウントは、使える招待コードか開始コードを入れたときだけ作れる（サーバーでも確かめる、0014）。
 * 入れたコードはアカウントの情報に残し、ログインしたあとの「招待コード」「開始コード」の欄に最初から入れておく。
 * パスワードを忘れたときは、登録したメールに再設定のリンクを送る（決定62）。
 * 招待コードを入れると、役割・招待した人・期限を出す（決定97。チームの名前はログインしてから）。
 * ログインとアカウントを作るときに「自分専用／共用の端末」を選ぶ（7.4.2 #1、決定61。【暫定】2026-11-07 の試作）。
 * 90日使われなかったためにログアウトしたときは、そのことを知らせる。
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { saveDevice } from '../db/repo';
import { authRedirect, supabase } from '../server/supabase';
import { clearRecovery, requestPasswordReset } from '../server/session';
import { Segmented, TopBar } from '../components/ui';
import { pendingInviteCode } from '../lib/inviteLink';
import { InvitePreview, useInvitePreview } from '../components/InvitePreview';

type Mode = 'login' | 'signup' | 'forgot';

const CODE_NG = 'このコードではアカウントを作れません（まちがい・使用済み・期限切れ）。コードを確かめるか、渡した人に聞いてください。';

export default function Login() {
  // 招待リンクから開いたときは、アカウントを作る画面で、コードを入れた状態から始める
  const [mode, setMode] = useState<Mode>(() => (pendingInviteCode() ? 'signup' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(pendingInviteCode);
  const [busy, setBusy] = useState(false);
  const preview = useInvitePreview(code);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    authRedirect.linkError ? 'このリンクは期限が切れたか、すでに使われています。もう一度「パスワードを忘れた」からメールを送ってください。' : null,
  );

  useEffect(clearRecovery, []);
  const dev = useLiveQuery(() => db.device.get('device'), []);
  const shared = !!dev?.shared;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setMessage(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === 'forgot') {
      const err = await requestPasswordReset(email.trim());
      // 登録があるかどうかは知らせない（どのメールでも同じ表示）
      if (err) setError(err);
      else setMessage('登録されているメールアドレスなら、パスワードを決め直すリンクを送りました。英語のメールの「Reset password」を押してください（30分以内・1回だけ使えます）。届かないときは迷惑メールのフォルダも見てください。');
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === 'Invalid login credentials' ? 'メールアドレスかパスワードがちがいます。' : error.message);
    } else {
      // 先に確かめて分かりやすく知らせる。サーバーもアカウントを作る前に確かめる（0014。そのときの文は英語の「Database error …」になる）
      const { data: ok, error: checkError } = await supabase.rpc('signup_code_ok', { p_code: code });
      if (checkError) {
        setError(checkError.message);
        setBusy(false);
        return;
      }
      if (!ok) {
        setError(CODE_NG);
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { invite_code: code.trim().toUpperCase() } } });
      if (error) setError(/database error/i.test(error.message) ? CODE_NG : error.message);
      else if (!data.session) setMessage('確認のメールを送りました（いまは英語のメールです）。メールの中のリンクを押してから、ログインしてください。');
    }
    setBusy(false);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="行動の記録" sub="招待された人だけが使えます。一般には公開していません。" />
      <form className="section stack" onSubmit={submit}>
        {mode === 'forgot' ? (
          <p className="help">
            登録したメールアドレスに、パスワードを決め直すためのリンクを送ります。いまは英語のメール（件名「Reset your password」）が届くので、中の「Reset password」を押してください。
          </p>
        ) : (
          <Segmented<Mode>
            label="ログインのしかた"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'login', label: 'ログイン' },
              { value: 'signup', label: 'はじめて使う' },
            ]}
          />
        )}
        <div className="card stack">
          <label className="field">
            メールアドレス
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && <label className="field">
            パスワード{mode === 'signup' && '（8文字以上）'}
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>}
          {mode === 'signup' && (
            <>
              <label className="field">
                招待コード または 開始コード
                <input required value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" />
              </label>
              <InvitePreview info={preview} />
              <p className="help">
                招待された人は、招待した人から受け取った「招待コード」を、新しいチームを作る保護者の方は、運営から受け取った「開始コード」を入れます。
                コードがないと、アカウントは作れません。招待リンクから開いたときは、コードが最初から入っています。
              </p>
              {pendingInviteCode() && <p className="help">すでにアカウントがある人は「ログイン」からログインしてください。参加の画面にコードが入っています。</p>}
            </>
          )}
          {mode !== 'forgot' && (
            <>
              <Segmented<'own' | 'shared'>
                label="この端末は"
                value={shared ? 'shared' : 'own'}
                onChange={(v) => void saveDevice({ shared: v === 'shared' })}
                options={[
                  { value: 'own', label: '自分専用' },
                  { value: 'shared', label: '共用（職場の端末など）' },
                ]}
              />
              <p className="help">
                {shared
                  ? '共用の端末では、ログインのあとに PIN を決めます。10分さわらないとロックがかかり、PIN で外します。'
                  : '自分専用の端末では、アプリのロックはかけず、スマホのロックに任せます。ログインしたままになります（90日使わなければ、もう一度ログイン）。'}
              </p>
            </>
          )}
          {dev?.relogin === 'idle90' && !error && !message && (
            <p className="notice-inline" role="status">この端末で90日使われなかったので、ログアウトしました。もう一度ログインしてください。</p>
          )}
          {dev?.relogin === 'remote' && !error && !message && (
            <p className="notice-inline" role="status">
              この端末は、あなたか、チームの管理者・支援リーダーが遠隔でログアウトしました。この端末からチームのデータを消しました。続けて使うときは、もう一度ログインしてください。
            </p>
          )}
          {error && <p className="ai-error" role="alert">{error}</p>}
          {message && <p className="notice-inline" role="status">{message}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? '確かめています…' : mode === 'login' ? 'ログイン' : mode === 'signup' ? 'アカウントを作る' : '再設定のメールを送る'}
        </button>
        {mode === 'login' && (
          <button type="button" className="btn btn--sm btn--block" onClick={() => switchMode('forgot')}>パスワードを忘れた</button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="btn btn--sm btn--block" onClick={() => switchMode('login')}>ログインに戻る</button>
        )}
        {mode === 'forgot' && (
          <p className="help">メールも使えなくなったときは、チームの管理者か支援リーダーに招待し直してもらってください。</p>
        )}
      </form>
    </div>
  );
}
