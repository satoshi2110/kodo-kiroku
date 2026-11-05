/**
 * ログインの状態（7.4.3）。サーバーにつながる設定があるときだけ使う。
 * ログインしたら、この端末の「いまの人」をサーバーのユーザーにそろえ、同期を始める。
 */
import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db } from '../db/db';
import { nowISO } from '../lib/date';
import { getDevice, saveDevice } from '../db/repo';
import { supabase } from './supabase';
import { clearServerData, installSyncHooks, runSync, scheduleSync } from './sync';

interface SessionState {
  ready: boolean; // 最初の確認が終わったか
  session: Session | null;
}
let state: SessionState = { ready: !supabase, session: null };
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
      set({ ready: true, session });
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

/** ログアウト。この端末からサーバーのチームのデータを消す */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  await clearServerData();
}
