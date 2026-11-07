/**
 * ログインの状態（7.4.3）。サーバーにつながる設定があるときだけ使う。
 * ログインしたら、この端末の「いまの人」をサーバーのユーザーにそろえ、同期を始める。
 */
import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db } from '../db/db';
import { nowISO } from '../lib/date';
import { getDevice, saveDevice } from '../db/repo';
import { authRedirect, supabase } from './supabase';
import { clearServerData, installSyncHooks, runSync, scheduleSync } from './sync';

interface SessionState {
  ready: boolean; // 最初の確認が終わったか
  session: Session | null;
  recovery: boolean; // パスワード再設定のリンクから開いた（新しいパスワードを決めるまで、ほかの画面は出さない）
}
let state: SessionState = { ready: !supabase, session: null, recovery: authRedirect.reset };
const listeners = new Set<() => void>();
const set = (s: SessionState) => {
  state = s;
  listeners.forEach((f) => f());
};

async function onLogin(session: Session) {
  const uid = session.user.id;
  const dev = await getDevice();
  if (!(await db.users.get(uid))) {
    const t = nowISO();
    await db.users.put({ id: uid, createdAt: t, updatedAt: t, deletedAt: null, displayName: '' });
  }
  if (dev.userId !== uid) await saveDevice({ userId: uid, currentPersonId: null });
  await runSync();
}

if (supabase) {
  installSyncHooks();
  supabase.auth.onAuthStateChange((event, session) => {
    // 中で await しない（supabase-js の決まり）。ログインの処理は次の順番で行う
    setTimeout(async () => {
      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) await onLogin(session);
      // ほかの端末から「すべてログアウト」された・ログインが無効になったときも、この端末からチームのデータを消す
      if (event === 'SIGNED_OUT') await clearServerData();
      set({ ready: true, session, recovery: state.recovery || event === 'PASSWORD_RECOVERY' });
    }, 0);
  });
  window.addEventListener('online', () => scheduleSync(0));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(0));
  setInterval(() => scheduleSync(0), 60_000);
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}

/** パスワード再設定のメールを送る（決定62）。登録がないメールでも同じ表示にして、登録の有無を知らせない */
export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/?reset=1` });
  return error ? error.message : null;
}

/** 新しいパスワードを決める（再設定のリンクから開いたとき） */
export async function setNewPassword(password: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message;
  history.replaceState(null, '', '/');
  set({ ...state, recovery: false });
  return null;
}

/** ログイン画面を出したとき: 再設定のリンクが使えなかったので、ふつうのログインに戻す */
export function clearRecovery() {
  if (!state.recovery) return;
  history.replaceState(null, '', '/');
  set({ ...state, recovery: false });
}

/** ログアウト。この端末からサーバーのチームのデータを消す */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  await clearServerData();
}

/**
 * この端末はそのままで、同じアカウントのほかの端末をすべてログアウトする（端末をなくしたとき）。
 * ほかの端末は、次にログインを更新するとき（最長で1時間ほど）にログアウトされ、チームのデータが消える。
 */
export async function signOutOthers(): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  return error ? error.message : null;
}
