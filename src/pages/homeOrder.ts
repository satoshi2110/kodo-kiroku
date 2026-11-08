/**
 * ホームの行動カードの並べかえ（決定137）。
 * - 並びはこの端末だけのもの（DeviceSetting.homeOrder。サーバーに送らない）。
 * - 代替行動は問題行動とペアのまま動く（決定29 を守る）。動かす単位は「まとまり」（問題行動＋その代替行動）。
 * - カードを長押しすると並べかえの状態に入り、指で引っぱって動かす。並べかえの間は押しても +1 にならない。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Behavior } from '../db/types';

/** まとまり: 先頭の行動の id と、並べる行動（問題行動のあとに、その代替行動） */
export type Group = { head: string; members: Behavior[] };

/** 代替行動を、対応する問題行動のすぐ後ろにまとめる（決定29） */
export function groupBehaviors(behaviors: Behavior[]): Group[] {
  const used = new Set<string>();
  const groups: Group[] = [];
  for (const p of behaviors.filter((b) => b.kind === 'problem')) {
    const members = [p, ...behaviors.filter((b) => b.replacesBehaviorId === p.id)];
    members.forEach((m) => used.add(m.id));
    groups.push({ head: p.id, members });
  }
  for (const b of behaviors) if (!used.has(b.id)) groups.push({ head: b.id, members: [b] });
  return groups;
}

/** 保存した並びに合わせる。保存した並びにない（あとで足した）まとまりは、うしろに元の順で付ける */
export function applyOrder(groups: Group[], order: string[] | undefined): Group[] {
  if (!order?.length) return groups;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...groups].sort((a, b) => (rank.get(a.head) ?? Infinity) - (rank.get(b.head) ?? Infinity));
}

async function saveOrder(personId: string, order: string[] | null) {
  const dev = await db.device.get('device');
  if (!dev) return;
  const homeOrder = { ...(dev.homeOrder ?? {}) };
  if (order) homeOrder[personId] = order;
  else delete homeOrder[personId];
  await db.device.update('device', { homeOrder });
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10; // これより指が動いたら長押しにしない（画面を動かしている）

type Drag = { head: string; el: HTMLElement; grabX: number; grabY: number; tx: number; ty: number; x: number; y: number };

export function useHomeOrder(personId: string, behaviors: Behavior[]) {
  const saved = useLiveQuery(async () => (await db.device.get('device'))?.homeOrder?.[personId], [personId]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null); // 引っぱっている間の並び
  const [dragging, setDragging] = useState<string | null>(null);
  const groups = useMemo(() => applyOrder(groupBehaviors(behaviors), draft ?? saved), [behaviors, draft, saved]);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // 引っぱっているカードを指の位置に合わせる（並びが変わってカードの場所が動いても、指の下に保つ）
  const place = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const r = d.el.getBoundingClientRect();
    d.tx = d.x - d.grabX - (r.left - d.tx);
    d.ty = d.y - d.grabY - (r.top - d.ty);
    d.el.style.translate = `${d.tx}px ${d.ty}px`;
  }, []);
  useLayoutEffect(place, [groups, place]);

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      e.preventDefault();
      d.x = e.clientX;
      d.y = e.clientY;
      place();
      // 指の下にある、ほかのまとまりのカードの場所へ入れる
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n instanceof HTMLElement && n.dataset.head && n !== d.el) as HTMLElement | undefined;
      const target = over?.dataset.head;
      if (!target || target === d.head) return;
      const heads = groupsRef.current.map((g) => g.head);
      const from = heads.indexOf(d.head);
      const to = heads.indexOf(target);
      if (from < 0 || to < 0) return;
      heads.splice(from, 1);
      heads.splice(to, 0, d.head);
      setDraft(heads);
    },
    [place],
  );

  const onUp = useCallback(() => {
    const d = drag.current;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (!d) return;
    d.el.style.translate = '';
    drag.current = null;
    setDragging(null);
    const order = groupsRef.current.map((g) => g.head);
    setDraft(order);
    saveOrder(personId, order).then(() => setDraft(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMove, personId]);

  useEffect(
    () => () => {
      cancelPress();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
    [onMove, onUp],
  );

  /** カード（.bcard）に付ける。並べかえていないときは長押しで並べかえに入り、並べかえ中は引っぱって動かす */
  const bind = (head: string) => ({
    'data-head': head,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('a, .undo-badge')) return; // 「手順」「−1」はそのまま押せる
      if (!editing) {
        const { clientX: x, clientY: y } = e;
        cancelPress();
        press.current = { x, y, timer: window.setTimeout(() => { press.current = null; setEditing(true); }, LONG_PRESS_MS) };
        return;
      }
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      drag.current = { head, el, grabX: e.clientX - r.left, grabY: e.clientY - r.top, tx: 0, ty: 0, x: e.clientX, y: e.clientY };
      setDragging(head);
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => e.preventDefault(), // 長押しのメニューを出さない
  });

  return {
    groups,
    editing,
    dragging,
    bind,
    finish: () => setEditing(false),
    customized: !!saved?.length,
    reset: () => saveOrder(personId, null),
  };
}
