/**
 * 新しいパスワードを決める（決定62）。再設定のメールのリンクから開いたときだけ出る。
 * 決めるまでは、ほかの画面を出さない。
 */
import { useState } from 'react';
import { setNewPassword, signOut } from '../server/session';
import { TopBar } from '../components/ui';

const MIN = 8; // 「はじめて使う」と同じ

export default function NewPassword() {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) return setError('2つのパスワードがちがいます。');
    setBusy(true);
    setError(null);
    const err = await setNewPassword(password);
    if (err) {
      setError(
        /different from the old/i.test(err) ? '前と同じパスワードは使えません。'
          : /weak|pwned|leaked/i.test(err) ? 'このパスワードは漏れたことが知られているか、短すぎます。別のパスワードにしてください。'
          : err,
      );
    }
    setBusy(false);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="新しいパスワード" sub="パスワードを決め直します。ほかのサービスと同じパスワードは使わないでください。" />
      <form className="section stack" onSubmit={submit}>
        <div className="card stack">
          <label className="field">
            新しいパスワード（{MIN}文字以上）
            <input type="password" autoComplete="new-password" required minLength={MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            もう一度
            <input type="password" autoComplete="new-password" required minLength={MIN} value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? '保存しています…' : 'このパスワードにする'}
        </button>
        <button type="button" className="btn btn--sm btn--block" onClick={() => void signOut().then(() => location.replace('/'))}>
          やめる（ログアウト）
        </button>
      </form>
    </div>
  );
}
