/**
 * ログイン（画面一覧 1、ワイヤーフレーム 12）。サーバーにつながる設定があるときだけ出る。
 * アプリは一般公開しない（決定44）。アカウントを作っても、招待コードか開始コードがなければチームのデータは見られない。
 * パスワードを忘れたときは、登録したメールに再設定のリンクを送る（決定62）。
 * 【暫定】「自分専用／共用の端末」・パスキーは次に足す。
 */
import { useEffect, useState } from 'react';
import { authRedirect, supabase } from '../server/supabase';
import { clearRecovery, requestPasswordReset } from '../server/session';
import { Segmented, TopBar } from '../components/ui';

type Mode = 'login' | 'signup' | 'forgot';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    authRedirect.linkError ? 'このリンクは期限が切れたか、すでに使われています。もう一度「パスワードを忘れた」からメールを送ってください。' : null,
  );

  useEffect(clearRecovery, []);

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
      else setMessage('登録されているメールアドレスなら、パスワードを決め直すリンクを送りました。メールのリンクを開いてください（30分以内・1回だけ使えます）。届かないときは迷惑メールのフォルダも見てください。');
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === 'Invalid login credentials' ? 'メールアドレスかパスワードがちがいます。' : error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setError(error.message);
      else if (!data.session) setMessage('確認のメールを送りました。メールのリンクを開いてから、ログインしてください。');
    }
    setBusy(false);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="行動の記録" sub="招待された人だけが使えます。一般には公開していません。" />
      <form className="section stack" onSubmit={submit}>
        {mode === 'forgot' ? (
          <p className="help">登録したメールアドレスに、パスワードを決め直すためのリンクを送ります。</p>
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
            <p className="help">
              アカウントを作ったあと、招待された人は「招待コード」、新しいチームを作る保護者の方は運営から受け取った「開始コード」を入れます。
              コードがないと、チームのデータは見られません。
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
