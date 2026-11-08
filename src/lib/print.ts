/**
 * PDF レポートの印刷（6.12）。
 * ブラウザでは印刷の画面（window.print）を開く。
 * スマホのアプリの中の画面では window.print が開かないので、アプリに入れた印刷の部品（Print）を呼ぶ。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const NativePrint = registerPlugin<{ print(options: { name: string }): Promise<void> }>('Print');

export async function printPage(name: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await NativePrint.print({ name });
    return;
  }
  window.print();
}
