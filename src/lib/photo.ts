/**
 * 強化子の写真（6.14a）。長辺 640px に縮小し、canvas に描き直して JPEG の文字（data URL）にする。
 * 写真置き場を作らず表の1つの欄に入れて共有するので、画質より小ささを優先する（発注者回答 2026-11-06）。
 * 描き直すと Exif（撮影場所・日時など）は付かないので、位置情報は残らない。
 */
const MAX_SIDE = 640;
const QUALITY = 0.7;
const MAX_LENGTH = 400_000; // サーバーの表で受け付ける上限（0005）

export async function shrinkPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const data = canvas.toDataURL('image/jpeg', QUALITY);
  if (!data.startsWith('data:image/jpeg;base64,') || data.length > MAX_LENGTH) throw new Error('写真を読み込めませんでした');
  return data;
}
