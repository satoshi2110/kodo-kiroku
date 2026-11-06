/**
 * 国土地理院の住所検索と地理院タイル（6.3.3、決定85）。無料・登録なし。
 * 送るのは入力した住所の文字だけで、現在地は送らない（6.3.3a）。
 */
import type { Pos } from './place';

export interface AddressHit {
  title: string;
  pos: Pos;
}

/** 地理院タイル（標準地図）。地図には出典「国土地理院」を出す */
export const GSI_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
export const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>';

/** 住所で探す。候補は多くても5件。通信できなければ null */
export async function searchAddress(q: string): Promise<AddressHit[] | null> {
  try {
    const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { geometry?: { coordinates?: [number, number] }; properties?: { title?: string } }[];
    return json
      .filter((f) => Array.isArray(f.geometry?.coordinates) && f.properties?.title)
      .slice(0, 5)
      .map((f) => ({ title: f.properties!.title!, pos: { lat: f.geometry!.coordinates![1], lng: f.geometry!.coordinates![0] } }));
  } catch {
    return null;
  }
}
