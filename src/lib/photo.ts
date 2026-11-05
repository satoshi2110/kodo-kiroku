/**
 * 強化子の写真（6.14a）。長辺 1280px に縮小し、canvas に描き直して JPEG にする。
 * 描き直すと Exif（撮影場所・日時など）は付かないので、位置情報は残らない。
 */
const MAX_SIDE = 1280;

export async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('写真を読み込めませんでした'))), 'image/jpeg', 0.85),
  );
}
