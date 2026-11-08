/**
 * 招待リンク（6.9）。リンクは「アプリの住所 + ?invite=招待コード」で、中身は招待コードと同じもの。
 * 開くと、アカウントを作る画面と、はじめの画面（チームに参加する）のコードの欄に最初から入る。
 * コードは使い切りで72時間有効（サーバーが確かめる）。リンクを開いただけでは参加しない。
 * ログインやメールの確認で画面が移ってもなくならないように、開いたときにこのタブの中だけに覚えておく。
 * スマホのアプリの中では相手が開ける住所がないので、リンクの代わりにコードを送り、QR にもコードを入れる。
 * 招待された人は、アカウントを作る画面とはじめの画面の「QR を読む」で読める（決定120）。
 */
import { Capacitor } from '@capacitor/core';

const KEY = 'kodo.inviteCode';
const PARAM = 'invite';

/** アプリを開いたときに1回だけ呼ぶ。URL から招待コードを読み、URL からは消す（履歴や画面共有に残さない） */
export function captureInviteCode() {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get(PARAM);
    if (!code) return;
    sessionStorage.setItem(KEY, code.trim().toUpperCase());
    url.searchParams.delete(PARAM);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // 覚えられない端末では、コードを手で入れてもらう
  }
}

/** リンクから開いたときの招待コード。なければ空 */
export function pendingInviteCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** 参加やチーム作りが済んだら忘れる */
export function clearInviteCode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}

/** スマホのアプリ（iPhone・Android）の中で動いているか。アプリの中の住所（capacitor://localhost など）は相手には開けない */
export const isNativeApp = () => Capacitor.isNativePlatform();

/** 相手に送る招待リンク。アプリの中では、相手が開ける住所がないので null（コードを送る） */
export const inviteUrl = (code: string): string | null => (isNativeApp() ? null : `${location.origin}/?${PARAM}=${encodeURIComponent(code)}`);

/** 招待の QR に入れる中身。ブラウザではリンク、アプリの中ではコードそのもの（アプリの「QR を読む」で読む） */
export const inviteQrText = (code: string) => inviteUrl(code) ?? code;

/** 送る文。リンクがないとき（アプリの中）は、コードと入れる場所を書く */
export const inviteMessage = (code: string) =>
  inviteUrl(code)
    ? 'チームへの招待です。72時間以内に開いてください。'
    : `チームへの招待です。「行動の記録」のアプリを開き、「はじめて使う」で招待コード ${code} を入れてください（72時間・1回だけ使えます）。`;

/** 読んだ QR（リンクかコード）から招待コードを取り出す。取り出せなければ null */
export function codeFromScan(text: string): string | null {
  const t = text.trim();
  try {
    const c = new URL(t).searchParams.get(PARAM);
    if (c) return c.trim().toUpperCase();
  } catch {
    // リンクでなければ、コードそのものとして読む
  }
  return /^[A-Za-z0-9-]{6,24}$/.test(t) ? t.toUpperCase() : null;
}
