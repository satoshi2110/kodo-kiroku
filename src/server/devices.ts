/**
 * 端末ごとのログインと、遠隔ログアウト（7.4.2 #1・#5、決定62・決定101）。【暫定】（2026-11-07 の試作）サーバーは 0021。
 * - 同期のたびに（5分に1回まで）「この端末でログインしている」をサーバーに残す（端末名と時刻だけ。場所・IP は残さない）
 * - 遠隔ログアウトを頼まれていたら、この端末からチームのデータを消してログアウトする（送れていない変更も消える）
 * - 同じアカウントで新しい端末からログインがあったら、画面の上に知らせる
 */
import { useSyncExternalStore } from 'react';
import { getDevice, saveDevice } from '../db/repo';
import { supabase } from './supabase';

const BEAT_MS = 5 * 60_000;

/** 端末の名前（「iPhone・Safari」など）。ブラウザが教える種類だけから作る */
export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'その他';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'ブラウザ';
  return `${os}・${br}`;
}

/** この端末の番号（はじめて使うときに作り、ログアウトしても変えない） */
export async function deviceId(): Promise<string> {
  const d = await getDevice();
  if (d.deviceId) return d.deviceId;
  const id = crypto.randomUUID();
  await saveDevice({ deviceId: id });
  return id;
}

export interface NewDevice {
  label: string;
  createdAt: string;
}

// ---- 新しい端末からのログインの知らせ（画面の上に出す） ----
let newDevices: NewDevice[] = [];
const listeners = new Set<() => void>();
const setNew = (v: NewDevice[]) => {
  newDevices = v;
  listeners.forEach((f) => f());
};
export function useNewDevices(): NewDevice[] {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => newDevices,
  );
}
/** 「心当たりがある」: この時刻までの知らせは出さない */
export async function dismissNewDevices() {
  const last = newDevices[newDevices.length - 1]?.createdAt ?? new Date().toISOString();
  await saveDevice({ newDeviceSeenAt: last });
  setNew([]);
}

let lastBeat = 0;
/** 同期の前に呼ぶ。遠隔ログアウトを頼まれていたら true（呼んだ側は同期をやめる） */
export async function heartbeat(force = false): Promise<boolean> {
  if (!supabase) return false;
  if (!force && Date.now() - lastBeat < BEAT_MS) return false;
  const d = await getDevice();
  const { data, error } = await supabase.rpc('device_heartbeat', {
    p_device: await deviceId(),
    p_label: deviceLabel(),
    p_shared: !!d.shared,
    p_seen: d.newDeviceSeenAt ?? null,
  });
  if (error || !data) return false; // 0021 を流す前・通信の失敗。次の同期でもう一度
  lastBeat = Date.now();
  const r = data as { logout: boolean; new_devices: { label: string; created_at: string }[] };
  if (r.logout) {
    await remoteWipe();
    return true;
  }
  setNew((r.new_devices ?? []).map((x) => ({ label: x.label, createdAt: x.created_at })));
  return false;
}

/** 遠隔ログアウトされた: この端末からチームのデータを消して、ログアウトする */
async function remoteWipe() {
  const { clearServerData } = await import('./sync');
  await clearServerData();
  await saveDevice({ relogin: 'remote' });
  lastBeat = 0;
  // このログインはサーバーで無効になっている。ほかの端末を巻き込まないよう、この端末だけでログアウトする
  await supabase!.auth.signOut({ scope: 'local' });
}

/** ログインしたとき・ログアウトしたときは、次の同期ですぐにサーバーへ残す */
export function resetHeartbeat() {
  lastBeat = 0;
  setNew([]);
}

export interface DeviceRow {
  deviceId: string;
  userId: string;
  label: string;
  shared: boolean;
  createdAt: string;
  lastSeenAt: string;
  logoutRequestedAt: string | null;
}

/** 端末の一覧（自分の端末と、自分が支援リーダー以上のチームのメンバーの端末だけが見える。0021 の RLS） */
export async function listDevices(userId: string): Promise<DeviceRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('device_sessions')
    .select('device_id, user_id, label, shared, created_at, last_seen_at, logout_requested_at')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });
  if (error || !data) return null;
  return data.map((r) => ({
    deviceId: r.device_id,
    userId: r.user_id,
    label: r.label,
    shared: r.shared,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    logoutRequestedAt: r.logout_requested_at,
  }));
}

/** 遠隔ログアウトを頼む。自分の端末なら personId はなくてよい */
export async function requestLogout(device: string, userId: string, personId?: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.rpc('request_device_logout', { p_device: device, p_user: userId, p_person: personId ?? null });
  if (!error) return null;
  return error.message.includes('MFA_REQUIRED') ? 'ほかの人の端末をログアウトするには、多要素認証（MFA）を通してログインしてください。' : error.message;
}
