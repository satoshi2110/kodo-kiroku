/**
 * 端末の共有メニュー（LINE・メールなど）で送る。
 * スマホのアプリの中では、アプリの共有の部品を使う（Android のアプリの中の画面には navigator.share がなく、
 * iPhone ではアプリの中の住所を付けると開かないため）。ブラウザでは navigator.share。どちらもないときは false。
 */
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export const canShare = () => Capacitor.isNativePlatform() || typeof navigator.share === 'function';

/** 送れた・閉じたときは true、共有メニューがない・うまく開けなかったときは false（呼んだ側はコピーに切りかえる） */
export async function shareText(o: { title: string; text: string; url?: string | null }): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: o.title, text: o.text, url: o.url ?? undefined, dialogTitle: o.title });
      return true;
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: o.title, text: o.text, ...(o.url ? { url: o.url } : {}) });
      return true;
    }
  } catch (e) {
    // 自分で閉じたときだけ true（何もしない）。ほかの失敗は false にして、コピーで渡せるようにする（点検 2026-11-08）
    const name = (e as { name?: string })?.name ?? '';
    const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
    return name === 'AbortError' || msg.includes('cancel');
  }
  return false;
}
