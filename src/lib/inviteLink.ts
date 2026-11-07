/**
 * 招待リンク（6.9）。リンクは「アプリの住所 + ?invite=招待コード」で、中身は招待コードと同じもの。
 * 開くと、アカウントを作る画面と、はじめの画面（チームに参加する）のコードの欄に最初から入る。
 * コードは使い切りで72時間有効（サーバーが確かめる）。リンクを開いただけでは参加しない。
 * ログインやメールの確認で画面が移ってもなくならないように、開いたときにこのタブの中だけに覚えておく。
 */
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

/** 相手に送る招待リンク */
export const inviteUrl = (code: string) => `${location.origin}/?${PARAM}=${encodeURIComponent(code)}`;
