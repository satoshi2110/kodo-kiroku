/**
 * 端末の共有メニュー（LINE・メールなど）で送る。
 * スマホのアプリの中では、アプリの共有の部品を使う（Android のアプリの中の画面には navigator.share がなく、
 * iPhone ではアプリの中の住所を付けると開かないため）。ブラウザでは navigator.share。どちらもないときは false。
 */
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export const canShare = () => Capacitor.isNativePlatform() || typeof navigator.share === 'function';

/** 送れた・閉じたときは true、共有メニューがないときは false */
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
  } catch {
    return true; // 閉じたときは何もしない
  }
  return false;
}
