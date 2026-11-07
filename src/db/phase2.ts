/**
 * Phase 2・3 の画面のデータ操作（決定83）: 支援計画と合意（6.7）、身体拘束の記録（6.8）、支援会議メモと申し送り（6.10）、
 * ABC集計の AI のまとめ（6.4.3）。どれも監査ログを残す。権限の判定は画面の出し分け用で、サーバーの行レベルセキュリティが正（決定45）。
 */
import { db } from './db';
import { audit, base, canRecord, RANK } from './repo';
import { fixedId, newId } from '../lib/id';
import { addDays, nowISO, toLocalDate } from '../lib/date';
import type {
  AiSummary,
  Comment,
  MeetingNote,
  PlanChange,
  PlanContent,
  PlanSignoff,
  RestraintLog,
  RestraintPeriod,
  Role,
  SupportPlan,
  TeamMember,
} from './types';

// ---------- 支援計画（6.7） ----------

/** 計画を編集できるのは管理者・副管理者・支援リーダー（6.9）。支援者は見るだけ（提案は申し送りで） */
export const canEditPlan = (r?: Role) => !!r && RANK[r] >= RANK.leader;
/** 合意をお願いできる人: 閲覧者のほか（決定69） */
export const canSign = (r?: Role) => !!r && r !== 'viewer';
/** 合意待ちの変更を取り下げられる: 保存した人と、管理者・副管理者（6.7） */
export const canWithdraw = (r: Role | undefined, change: PlanChange, userId: string) =>
  change.savedBy === userId || (!!r && RANK[r] >= RANK.subadmin);

export function emptyPlan(): PlanContent {
  return {
    problemBehaviorId: null,
    alternativeBehaviorId: null,
    func: null,
    goal: '',
    scene: '',
    criteria: [],
    antecedent: '',
    reinforcement: '',
    prompting: '',
    crisis: '',
    reviewDate: null,
    owner: '',
  };
}

/** 変わった項目 */
export function diffFields(before: PlanContent | null, after: PlanContent): (keyof PlanContent)[] {
  // 場面（scene）を足す前に保存した計画には、その項目がない。空として比べる
  const b = { ...emptyPlan(), ...before };
  const a = { ...emptyPlan(), ...after };
  return (Object.keys(a) as (keyof PlanContent)[]).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

export async function getPlan(personId: string): Promise<SupportPlan | undefined> {
  return db.supportPlans.where('personId').equals(personId).filter((p) => !p.deletedAt).first();
}

/**
 * 保存（上書き、決定67）。変更は「合意待ち」になり、管理者は必ず合意者に入る（決定69）。
 * 合意待ちの変更がほかにあれば「新しい変更に置きかわった」にする（取り下げと同じく履歴に残る）。
 * 保存した人が合意者に入っていれば、保存と同時に合意したものとする。
 * 計画の id は対象者から決めるので、2台で初めて保存しても、サーバーでは1つの計画にまとまる。
 */
export async function savePlan(
  personId: string,
  content: PlanContent,
  reason: string,
  signerMemberIds: string[],
  me: TeamMember,
  members: TeamMember[],
): Promise<PlanChange | null> {
  // id を決める計算は transaction の外で行う（中で待つと transaction が先に閉じるため）
  const planId = await fixedId(`plan:${personId}`);
  const changeId = newId();
  const signoffId = await fixedId(`signoff:${changeId}:${me.id}`);
  return db.transaction('rw', [db.supportPlans, db.planChanges, db.planSignoffs, db.teamMembers, db.auditLogs], async () => {
    const existing = await getPlan(personId);
    const before = existing?.content ?? null;
    const fields = diffFields(before, content);
    if (fields.length === 0) return null;
    const t = nowISO();
    const plan: SupportPlan = existing
      ? { ...existing, content, updatedAt: t }
      : { ...base(), id: planId, personId, content, activeContent: null, activeSince: null };
    await db.supportPlans.put(plan);
    await audit(personId, 'supportPlan', plan.id, existing ? 'update' : 'create', me.userId, existing ?? null, plan);

    for (const c of await db.planChanges.where('planId').equals(plan.id).filter((c) => c.status === 'pending').toArray()) {
      const after: PlanChange = { ...c, status: 'superseded', closedBy: me.userId, updatedAt: t };
      await db.planChanges.put(after);
      await audit(personId, 'planChange', c.id, 'update', me.userId, c, after);
    }

    const admin = members.find((m) => m.role === 'admin');
    const signers = [...new Set([...(admin ? [admin.id] : []), ...signerMemberIds])].filter((id) =>
      canSign(members.find((m) => m.id === id)?.role),
    );
    const change: PlanChange = {
      ...base(),
      id: changeId,
      personId,
      planId: plan.id,
      savedBy: me.userId,
      reason,
      before,
      after: content,
      fields,
      signerMemberIds: signers,
      status: 'pending',
      activeSince: null,
      closedBy: null,
    };
    await db.planChanges.add(change);
    await audit(personId, 'planChange', change.id, 'create', me.userId, null, change);
    if (signers.includes(me.id)) await applySignoff(change.id, me, 'agreed', '', signoffId);
    return change;
  });
}

/**
 * 返事（合意する / 意見を送る、決定69）。管理者が合意した日から、変更後の計画が「実施中」になる（決定68）。
 * 副管理者の代わりの合意は proxySignoff（ふだんの合意では実施中にしない）。
 * 合意したあとでも意見を送れば「意見あり」に変わる。
 */
export async function signoff(changeId: string, me: TeamMember, state: 'agreed' | 'opinion', opinion: string) {
  const signoffId = await fixedId(`signoff:${changeId}:${me.id}`);
  await db.transaction('rw', [db.supportPlans, db.planChanges, db.planSignoffs, db.auditLogs], async () => {
    await applySignoff(changeId, me, state, opinion, signoffId);
  });
}

/** 返事の id は「変更・メンバー」から決める（2台から返事をしても1件にまとまる） */
async function applySignoff(changeId: string, me: TeamMember, state: 'agreed' | 'opinion', opinion: string, signoffId: string) {
  const change = await db.planChanges.get(changeId);
  if (!change || !change.signerMemberIds.includes(me.id)) return;
  if (change.status !== 'pending' && change.status !== 'active') return;
  const t = nowISO();
  const prev = await db.planSignoffs.where('changeId').equals(changeId).filter((s) => s.memberId === me.id && !s.deletedAt).first();
  const rec: PlanSignoff = prev
    ? { ...prev, state, opinion, updatedAt: t }
    : { ...base(), id: signoffId, personId: change.personId, changeId, memberId: me.id, state, opinion };
  await db.planSignoffs.put(rec);
  await audit(change.personId, 'planSignoff', rec.id, prev ? 'update' : 'create', me.userId, prev ?? null, rec);

  if (state === 'agreed' && me.role === 'admin' && change.status === 'pending') await activate(change, me.userId, null);
}

/**
 * 変更を「実施中」にする。前の実施中は「過去」になり、その日がグラフの縦線になる（決定68）。
 * 副管理者が管理者の代わりに行ったときは、だれが代わったかを closedBy に残す。
 */
async function activate(change: PlanChange, actorId: string, proxyBy: string | null) {
  const t = nowISO();
  const today = toLocalDate();
  for (const c of await db.planChanges.where('planId').equals(change.planId).filter((c) => c.status === 'active').toArray()) {
    const after: PlanChange = { ...c, status: 'past', updatedAt: t };
    await db.planChanges.put(after);
    await audit(change.personId, 'planChange', c.id, 'update', actorId, c, after);
  }
  const activated: PlanChange = { ...change, status: 'active', activeSince: today, closedBy: proxyBy, updatedAt: t };
  await db.planChanges.put(activated);
  await audit(change.personId, 'planChange', change.id, 'update', actorId, change, activated);
  const plan = await db.supportPlans.get(change.planId);
  if (plan) {
    const after: SupportPlan = { ...plan, activeContent: change.after, activeSince: today, updatedAt: t };
    await db.supportPlans.put(after);
    await audit(change.personId, 'supportPlan', plan.id, 'update', actorId, plan, after);
  }
}

/** 管理者の代わりに合意できるのは副管理者だけ（決定68。管理者が操作できないときや引き継ぎ中に使う） */
export const canProxySign = (r?: Role) => r === 'subadmin';

/**
 * 副管理者が管理者の代わりに合意し、変更を今日から「実施中」にする（決定68）。
 * 自分が合意者に入っていれば、自分の返事も「合意」にする。管理者の返事は「未確認」のまま残る。
 */
export async function proxySignoff(changeId: string, me: TeamMember) {
  if (!canProxySign(me.role)) return;
  const signoffId = await fixedId(`signoff:${changeId}:${me.id}`);
  await db.transaction('rw', [db.supportPlans, db.planChanges, db.planSignoffs, db.auditLogs], async () => {
    const change = await db.planChanges.get(changeId);
    if (!change || change.status !== 'pending') return;
    if (change.signerMemberIds.includes(me.id)) await applySignoff(changeId, me, 'agreed', '', signoffId);
    await activate(change, me.userId, me.userId);
  });
}

/** 合意待ちの変更を取り下げる。計画の中身は、実施中の内容（なければ変更前）に戻る */
export async function withdrawChange(changeId: string, actorId: string) {
  await db.transaction('rw', [db.supportPlans, db.planChanges, db.auditLogs], async () => {
    const change = await db.planChanges.get(changeId);
    if (!change || change.status !== 'pending') return;
    const t = nowISO();
    const after: PlanChange = { ...change, status: 'withdrawn', closedBy: actorId, updatedAt: t };
    await db.planChanges.put(after);
    await audit(change.personId, 'planChange', change.id, 'update', actorId, change, after);
    const plan = await db.supportPlans.get(change.planId);
    if (plan) {
      const restored: SupportPlan = { ...plan, content: plan.activeContent ?? change.before ?? plan.content, updatedAt: t };
      await db.supportPlans.put(restored);
      await audit(change.personId, 'supportPlan', plan.id, 'update', actorId, plan, restored);
    }
  });
}

/** 機能を選んだときの、代替行動の定型ヒント（決定27。AI なしでも出す） */
export const FUNCTION_HINT: Record<string, string> = {
  escape: '「休みたい」「手伝って」と伝える方法を教えましょう。',
  attention: '「見て」「ねえねえ」と適切に呼ぶ方法を教えましょう。',
  demand: '「貸して」「ちょうだい」と伝える方法、または「待つ」方法を教えましょう。',
  sensory: '同じ感覚を安全に得られる別の活動を用意しましょう。',
};

/** グラフの縦線（フェーズの切り替え）: 実施中になった変更の日。最初は「支援開始」 */
export function phaseLines(changes: PlanChange[]): { date: string; label: string }[] {
  const dates = [...new Set(changes.filter((c) => c.activeSince && (c.status === 'active' || c.status === 'past')).map((c) => c.activeSince!))].sort();
  return dates.map((date, i) => ({ date, label: i === 0 ? '支援開始' : '計画の変更' }));
}

// ---------- 身体拘束の記録（6.8） ----------

/** 入力できるのは支援者以上。修正は記録した人と、管理者・副管理者・支援リーダー。取り消し・削除はない */
export const canRecordRestraint = canRecord;
export const canEditRestraint = (r: Role | undefined, log: RestraintLog, userId: string) =>
  !!r && (log.recorderId === userId ? canRecord(r) : RANK[r] >= RANK.leader);

export type RestraintInput = Omit<RestraintLog, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'recorderId'>;

export async function saveRestraint(id: string | null, input: RestraintInput, actorId: string): Promise<RestraintLog> {
  const before = id ? await db.restraintLogs.get(id) : undefined;
  const after: RestraintLog = before ? { ...before, ...input, updatedAt: nowISO() } : { ...base(), ...input, recorderId: actorId };
  await db.restraintLogs.put(after);
  await audit(after.personId, 'restraintLog', after.id, before ? 'update' : 'create', actorId, before ?? null, after);
  return after;
}

/** 目安の期間の始まり（今日を含む） */
export function restraintPeriodFrom(period: RestraintPeriod, today = toLocalDate()): string {
  return addDays(today, period === 'week' ? -6 : period === 'month' ? -29 : -89);
}

// ---------- 支援会議メモ・申し送り（6.10） ----------

export type MeetingInput = Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'recorderId'>;

export const canEditMeeting = (r: Role | undefined, note: MeetingNote | undefined, userId: string) =>
  !!r && (!note || note.recorderId === userId ? canRecord(r) : RANK[r] >= RANK.leader);

export async function saveMeeting(id: string | null, input: MeetingInput, actorId: string): Promise<MeetingNote> {
  const before = id ? await db.meetingNotes.get(id) : undefined;
  const after: MeetingNote = before ? { ...before, ...input, updatedAt: nowISO() } : { ...base(), ...input, recorderId: actorId };
  await db.meetingNotes.put(after);
  await audit(after.personId, 'meetingNote', after.id, before ? 'update' : 'create', actorId, before ?? null, after);
  return after;
}

export async function addComment(personId: string, target: Comment['target'], targetId: string | null, text: string, authorId: string, mentions: string[] = []) {
  // 呼んだ人がいないときは mentions を付けない（0024 を流す前のサーバーでも、申し送りが送れるように）
  const c: Comment = { ...base(), personId, target, targetId, text, authorId, ...(mentions.length ? { mentions } : {}) };
  await db.comments.add(c);
  await audit(personId, 'comment', c.id, 'create', authorId, null, c);
}

/** 自分の申し送り・コメントを消す（論理削除。履歴は残る） */
export async function removeComment(id: string, actorId: string) {
  const before = await db.comments.get(id);
  if (!before || before.authorId !== actorId) return;
  const t = nowISO();
  const after: Comment = { ...before, deletedAt: t, updatedAt: t };
  await db.comments.put(after);
  await audit(before.personId, 'comment', id, 'delete', actorId, before, after);
}

// ---------- ABC集計の AI のまとめ（6.4.3、Phase 3） ----------

export async function saveSummary(s: Omit<AiSummary, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<AiSummary> {
  const rec: AiSummary = { ...base(), ...s };
  await db.aiSummaries.add(rec);
  await audit(s.personId, 'aiSummary', rec.id, 'create', s.requestedBy, null, rec);
  return rec;
}
