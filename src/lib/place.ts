/**
 * 場所の判定（6.3.3・6.3.3a）。現在地は1回だけ取り、この端末の中で登録場所と照らし合わせるだけ。
 * 取った緯度経度は保存も送信もしない（「いまここを登録」で場所の中心にするときを除く）。
 */
import type { Place } from '../db/types';

export interface Pos {
  lat: number;
  lng: number;
}

/** 位置を1回だけ取る。精度は粗くてよく、5秒で諦める。取れなければ null */
export function getPositionOnce(): Promise<Pos | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    ),
  );
}

/** 2点の距離（m） */
export function distanceM(a: Pos, b: Pos): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 半径の中に入っている場所のうち、いちばん近いもの。どこにも入っていなければ null（登録場所の外） */
export function matchPlace(places: Place[], pos: Pos): Place | null {
  let best: { p: Place; d: number } | null = null;
  for (const p of places) {
    if (p.lat == null || p.lng == null) continue;
    const d = distanceM(pos, { lat: p.lat, lng: p.lng });
    if (d <= p.radiusM && (!best || d < best.d)) best = { p, d };
  }
  return best?.p ?? null;
}
