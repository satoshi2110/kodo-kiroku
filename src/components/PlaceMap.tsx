/**
 * 場所の中心と半径を地図で確かめる（6.3.3、決定85）。ピンは指で動かせ、地図をタップしてもピンが動く。
 * 地図の画像は国土地理院から読みこむので、住所で探した場所と登録済みの場所だけに使う（「いまここ」には出さない。6.3.3a）。
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GSI_ATTRIBUTION, GSI_TILE_URL } from '../lib/gsi';
import type { Pos } from '../lib/place';

const PIN = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] });

export default function PlaceMap({ pos, radiusM, onMove }: { pos: Pos; radiusM: number; onMove: (pos: Pos) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const parts = useRef<{ map: L.Map; pin: L.Marker; circle: L.Circle } | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { center: [pos.lat, pos.lng], zoom: 16, maxZoom: 18, minZoom: 5 });
    L.tileLayer(GSI_TILE_URL, { attribution: GSI_ATTRIBUTION, maxZoom: 18 }).addTo(map);
    map.attributionControl.setPrefix(false);
    const circle = L.circle([pos.lat, pos.lng], { radius: radiusM, color: '#1a6a86', weight: 2, fillOpacity: 0.12 }).addTo(map);
    const pin = L.marker([pos.lat, pos.lng], { icon: PIN, draggable: true, keyboard: false }).addTo(map);
    const move = (ll: L.LatLng) => moveRef.current({ lat: ll.lat, lng: ll.lng });
    pin.on('drag', () => circle.setLatLng(pin.getLatLng()));
    pin.on('dragend', () => move(pin.getLatLng()));
    map.on('click', (e: L.LeafletMouseEvent) => move(e.latlng));
    parts.current = { map, pin, circle };
    // シートが開ききってから大きさを測りなおす
    const t = window.setTimeout(() => map.invalidateSize(), 200);
    return () => {
      window.clearTimeout(t);
      map.remove();
      parts.current = null;
    };
  }, []); // 地図は1回だけ作り、位置と半径の変化は下で反映する

  useEffect(() => {
    const p = parts.current;
    if (!p) return;
    p.pin.setLatLng([pos.lat, pos.lng]);
    p.circle.setLatLng([pos.lat, pos.lng]);
    p.circle.setRadius(radiusM);
    if (!p.map.getBounds().contains([pos.lat, pos.lng])) p.map.panTo([pos.lat, pos.lng]);
  }, [pos.lat, pos.lng, radiusM]);

  return <div ref={el} className="place-map" role="img" aria-label="場所の地図。ピンを動かすか地図をタップすると中心が変わります" />;
}
