/**
 * 強化子の写真（6.14a）。長辺 640px に縮小し、canvas に描き直して JPEG の文字（data URL）にする。
 * 写真置き場を作らず表の1つの欄に入れて共有するので、画質より小ささを優先する（発注者回答 2026-11-06）。
 * 描き直すと Exif（撮影場所・日時など）は付かないので、位置情報は残らない。
 * 読み込みは <img> で行う。createImageBitmap はもとの大きさ（スマホの写真だと数千万画素）のまま広げるため、
 * iPhone のアプリの箱（WKWebView）では記憶が足りなくなり、画面ごと読み込み直されることがある。
 * <img> なら、大きな写真は iPhone のほうで小さめに広げてくれる。向き（Exif の回転）も <img> が直す。
 */
const MAX_SIDE = 640;
const QUALITY = 0.7;
const MAX_LENGTH = 400_000; // サーバーの表で受け付ける上限（0005）

export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) throw new Error('写真を読み込めませんでした');
    const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    img.src = ''; // 広げた写真を早めに手放す
    const data = canvas.toDataURL('image/jpeg', QUALITY);
    canvas.width = canvas.height = 0;
    if (!data.startsWith('data:image/jpeg;base64,') || data.length > MAX_LENGTH) throw new Error('写真を読み込めませんでした');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
