/**
 * 多要素認証（MFA）（7.4.3、決定34・53）。【暫定】（2026-11-07 の試作）方式は認証アプリのコード（TOTP）だけ。
 * 書き込みを止めるのはサーバー（0020）。ここは画面から使う薄い入れ物。
 */
import { supabase } from './supabase';

export type MfaRule = 'all' | 'leader' | 'optional';
export type MfaOverride = 'required' | 'exempt';

export const MFA_RULE_LABEL: Record<MfaRule, string> = {
  all: '全員必須',
  leader: '支援リーダー以上は必須',
  optional: '任意（管理者・副管理者だけ必須）',
};

/** サーバーの MFA_REQUIRED のエラーか */
export const isMfaError = (msg: string | null | undefined) => !!msg && msg.includes('MFA_REQUIRED');

/** いまのログインで、認証アプリのコードを入れる必要があるか（MFA を設定した人が、パスワードだけでログインしたとき） */
export async function needsMfaCode(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}

/** いまのログインが MFA を通しているか */
export async function isAal2(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === 'aal2';
}

/** 設定済みの認証アプリ（確かめ終わったもの） */
export async function verifiedTotp(): Promise<{ id: string; createdAt: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).map((f) => ({ id: f.id, createdAt: f.created_at }));
}

/** 認証アプリの登録を始める。途中でやめた登録が残っていたら先に消す（同じ名前だと登録できないため） */
export async function startTotp(): Promise<{ id: string; qr: string; secret: string } | { error: string }> {
  if (!supabase) return { error: 'サーバーにつながっていません' };
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: '認証アプリ', issuer: '行動の記録' });
  if (error || !data) return { error: error?.message ?? '登録を始められませんでした' };
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** 6けたのコードを確かめる（登録の仕上げと、ログインのときの両方） */
export async function verifyTotp(factorId: string, code: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (!error) return null;
  return /invalid|expired/i.test(error.message) ? 'コードがちがうか、時間が過ぎました。認証アプリの新しいコードを入れてください。' : error.message;
}

/** 認証アプリを外す（MFA を通したログインでだけできる） */
export async function removeTotp(factorId: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return error ? error.message : null;
}

export interface MfaStatus {
  required: boolean;
  dueAt: string | null;
  aal2: boolean;
  ok: boolean;
}

/** このチームでの自分の MFA の状態（0020 の mfa_status）。0020 を流す前やオフラインのときは null */
export async function mfaStatus(personId: string): Promise<MfaStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('mfa_status', { p: personId });
  if (error || !data) return null;
  const d = data as { required: boolean | null; due_at: string | null; aal2: boolean; ok: boolean };
  return { required: !!d.required, dueAt: d.due_at, aal2: d.aal2, ok: d.ok };
}
