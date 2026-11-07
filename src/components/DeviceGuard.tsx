/**
 * 端末の守り（7.4.2 #1・#4、決定61）。【暫定】（2026-11-07 の試作）ログインして使うときだけ働く。
 * - 共用の端末: はじめに PIN（4〜8けたの数字）を決める。10分さわらなければロックし、PIN で外す。
 *   ロック中は画面をおおうだけで、下の画面（観察のタイマーなど）は止めない。開き直してもロックのまま。
 *   PIN を5回続けてまちがえたら、15分は入れられない。人を替えるときは、ログアウトして次の人がログインする。
 *   画面の上に「操作中: 名前」をいつも出す。
 * - 自分専用の端末: ロックはかけず、スマホのロックに任せる。
 * - どちらも、90日使わなければログアウトして、もう一度ログインしてもらう（送れていない変更があるときは、送れるまで待つ）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getDevice, saveDevice } from '../db/repo';
import { useApp } from '../state';
import { signOut } from '../server/session';
import { runSync, unsentCount } from '../server/sync';
import { PIN_OK, checkPin, hashPin } from '../lib/devicePin';
import { TopBar } from './ui';

const LOCK_MS = 10 * 60_000;
const IDLE_DAYS_MS = 90 * 86_400_000;
const WAIT_MS = 15 * 60_000;
const MAX_FAILS = 5;
const nowIso = () => new Date().toISOString();

export function DeviceGuard({ userId, email, children }: { userId: string; email: string; children: ReactNode }) {
  const dev = useLiveQuery(() => db.device.get('device'), []);
  const { me } = useApp();
  const lastInput = useRef(0);
  const checked = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const shared = !!dev?.shared;
  const locked = shared && !!dev?.lockedAt;

  // 開いたとき: 90日使われていなければログアウト、共用の端末で10分たっていればロック
  useEffect(() => {
    if (dev === undefined || checked.current) return;
    checked.current = true;
    const last = dev?.lastActiveAt ? Date.parse(dev.lastActiveAt) : Date.now();
    lastInput.current = last;
    if (Date.now() - last > IDLE_DAYS_MS) {
      void (async () => {
        await runSync();
        if ((await unsentCount()) > 0) return; // 送れていない変更を消さない。送れたら次に開いたときにログアウト
        await saveDevice({ relogin: 'idle90' });
        await signOut();
      })();
      return;
    }
    if (dev?.shared && !dev.lockedAt && Date.now() - last > LOCK_MS) void saveDevice({ lockedAt: nowIso() });
    else void saveDevice({ lastActiveAt: nowIso() });
    lastInput.current = Date.now();
  }, [dev]);

  // さわったら時刻を覚える（残すのは1分に1回）。共用の端末では、10分さわらなければロック
  useEffect(() => {
    let saved = Date.now();
    const touch = () => {
      lastInput.current = Date.now();
      if (Date.now() - saved > 60_000) {
        saved = Date.now();
        void saveDevice({ lastActiveAt: nowIso() });
      }
    };
    const check = async () => {
      const d = await getDevice();
      if (d.shared && !d.lockedAt && d.pin && Date.now() - lastInput.current > LOCK_MS) await saveDevice({ lockedAt: nowIso() });
    };
    const opts = { capture: true, passive: true } as const;
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((e) => window.addEventListener(e, touch, opts));
    const onVis = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(check, 15_000);
    return () => {
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((e) => window.removeEventListener(e, touch, opts));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, []);

  // ロック中は下の画面を押せない・読み上げないようにする（React 18 は inert を渡せないので、直接付ける）
  useEffect(() => {
    body.current?.toggleAttribute('inert', locked);
  }, [locked]);

  if (dev === undefined) return null;
  const name = me?.displayName || email;
  if (shared && (!dev?.pin || dev.pin.userId !== userId)) return <PinSetup userId={userId} name={name} />;

  return (
    <div className={shared ? 'app app--shared' : 'app'}>
      {shared && (
        <div className="operator-bar" role="status">
          <span>操作中: <strong>{name}</strong>（共用の端末）</span>
          <button type="button" className="operator-bar__lock" onClick={() => void saveDevice({ lockedAt: nowIso() })}>ロックする</button>
        </div>
      )}
      <div ref={body} aria-hidden={locked || undefined} className="app__body">
        {children}
      </div>
      {locked && <LockScreen name={name} />}
    </div>
  );
}

/** 別の人に替わる・PIN を忘れたとき: 送れていない変更を確かめてからログアウト */
async function switchUser() {
  await runSync();
  const n = await unsentCount();
  const msg = n
    ? `まだサーバーに送れていない変更が ${n} 件あります。いまログアウトすると、この端末から消えます。電波のよいところで少し待ってからにしますか？\n（「OK」でログアウトします）`
    : 'ログアウトして、次の人がログインできるようにしますか？ この端末から、チームのデータを消します（サーバーには残ります）。';
  if (window.confirm(msg)) await signOut();
}

function PinSetup({ userId, name }: { userId: string; name: string }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!PIN_OK.test(pin)) return setError('PIN は 4〜8けたの数字にしてください。');
    if (pin !== again) return setError('2回目の PIN が1回目とちがいます。');
    setBusy(true);
    await saveDevice({ pin: await hashPin(userId, pin), pinFails: 0, pinWaitUntil: null, lockedAt: null, lastActiveAt: nowIso() });
    setBusy(false);
  }
  return (
    <div className="page page--no-nav">
      <TopBar title="共用の端末の PIN" sub={`操作中: ${name}`} />
      <form className="section stack" onSubmit={save}>
        <p className="help" style={{ marginTop: 0 }}>
          この端末は共用にしています。10分さわらないとロックがかかり、あなたが決めた PIN で外します。PIN はこの端末の中にだけ残り、サーバーには送りません。
        </p>
        <div className="card stack">
          <label className="field">
            PIN（4〜8けたの数字）
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            もう一度
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} />
          </label>
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>PIN を決める</button>
        <button type="button" className="btn btn--outline btn--block" onClick={() => void saveDevice({ shared: false, pin: null, lockedAt: null })}>
          この端末は自分専用にする（ロックしない）
        </button>
        <p className="help">自分専用の端末では、アプリのロックはかけず、スマホのロックに任せます。</p>
      </form>
    </div>
  );
}

function LockScreen({ name }: { name: string }) {
  const dev = useLiveQuery(() => db.device.get('device'), []);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const waitUntil = dev?.pinWaitUntil ? Date.parse(dev.pinWaitUntil) : 0;
  const waiting = waitUntil > Date.now();
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, [waiting]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    const d = await getDevice();
    if (!d.pin || waiting) return;
    setBusy(true);
    const ok = await checkPin(d.pin, pin);
    setBusy(false);
    setPin('');
    if (ok) {
      setError('');
      await saveDevice({ lockedAt: null, pinFails: 0, pinWaitUntil: null, lastActiveAt: nowIso() });
      return;
    }
    const fails = (d.pinFails ?? 0) + 1;
    if (fails >= MAX_FAILS) {
      await saveDevice({ pinFails: 0, pinWaitUntil: new Date(Date.now() + WAIT_MS).toISOString() });
      setError(`PIN を${MAX_FAILS}回続けてまちがえました。15分たってから、もう一度入れてください。`);
    } else {
      await saveDevice({ pinFails: fails });
      setError(`PIN がちがいます（あと${MAX_FAILS - fails}回まちがえると、15分は入れられません）。`);
    }
  }

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <form className="lock-screen__box stack" onSubmit={unlock}>
        <h1 id="lock-title" className="topbar__title">この端末はロックしています</h1>
        <p className="help" style={{ margin: 0 }}>
          操作中: <strong>{name}</strong>。10分さわらなかったのでロックしました。続けるには PIN を入れてください。
        </p>
        <label className="field">
          PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            autoFocus
            disabled={waiting}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        {waiting && (
          <p className="ai-error" role="alert">
            PIN を続けてまちがえたので、{new Date(waitUntil).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} まで入れられません。
          </p>
        )}
        {!waiting && error && <p className="ai-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || waiting || !PIN_OK.test(pin)}>ロックを外す</button>
        <button type="button" className="btn btn--outline btn--block" onClick={() => void switchUser()}>別の人に替わる（ログアウト）</button>
        <p className="help" style={{ margin: 0 }}>PIN を忘れたときも「別の人に替わる」からログアウトし、パスワードでログインし直して PIN を決め直します。</p>
      </form>
    </div>
  );
}
