/**
 * 個人の設定（画面一覧 16 のうち、自分のアカウントの部分）。
 * 【暫定】（2026-11-07 の試作）名前とメール、自分の同意、文字の大きさの案内、ログアウト、ほかの端末をすべてログアウト。通知の設定はまだない。
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
import { unsentCount } from '../server/sync';

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
              端末をなくしたときは、手元の端末で「ほかの端末をすべてログアウト」を押してください。ほかの端末は、次にログインを更新するとき（長くて1時間ほど）にログアウトされ、その端末からチームのデータが消えます。パスワードを変えたいときは、ログイン画面の「パスワードを忘れた」から変えられます。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
