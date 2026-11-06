/**
 * 管理者の引き継ぎ（6.9）の見せ方。中身はサーバーの関数（0012）が決め、端末は受け取ったものを見せる。
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { OwnerTransfer, TeamMember } from '../db/types';

/** このチームの、いま進んでいる引き継ぎと、いちばん最近に終わった引き継ぎ */
export function useOwnerTransfers(personId: string | undefined) {
  return useLiveQuery(async () => {
    if (!personId) return { pending: undefined, last: undefined };
    const all = (await db.ownerTransfers.where('personId').equals(personId).toArray()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return { pending: all.find((t) => t.result === 'pending'), last: all.find((t) => t.result !== 'pending') };
  }, [personId]);
}

export const isDue = (t: OwnerTransfer) => !!t.dueAt && new Date(t.dueAt).getTime() <= Date.now();

/** 自分が返事をする番か（指名された人／申し込まれた管理者／期限が来た申込者） */
export function needsMyAnswer(t: OwnerTransfer, userId: string) {
  if (t.method === 'nominate') return t.toUser === userId;
  return t.fromUser === userId || (t.toUser === userId && isDue(t));
}

/** 入れかわったあとの元の管理者の役割。副管理者は1人（決定39）なので、ほかに副管理者がいれば支援リーダー【暫定】 */
export function formerAdminRole(t: Pick<OwnerTransfer, 'toUser'>, members: TeamMember[]) {
  return members.some((m) => m.role === 'subadmin' && m.userId !== t.toUser && !m.deletedAt) ? '支援リーダー' : '副管理者';
}

export const TRANSFER_RESULT_LABEL: Record<OwnerTransfer['result'], string> = {
  pending: '返事を待っています',
  completed: '引き継ぎました',
  declined: '指名された人が断りました',
  rejected: '管理者が断りました',
  cancelled: '取り下げました',
};
