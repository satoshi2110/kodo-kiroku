/**
 * データ操作。すべての作成・更新・削除は AuditLog を残す。削除は論理削除。
 * 権限の判定はサーバーの行レベルセキュリティが正（決定45）。ここでの判定は画面の出し分け用。
 */
import { db } from './db';
import { newId } from '../lib/id';
import { localDateOf, nowISO } from '../lib/date';
import {
  CONSENT_TEXT_VERSION,
  DEFAULT_CHOICES,
  type AbcDetail,
  type AiAnalysis,
  type AiDecision,
  type AiSuggestion,
  type TeamSetting,
  type ChoiceKind,
  type ChoiceOption,
  type Affiliation,
  type AuditAction,
  type AuditEntity,
  type BaseRecord,
  type Behavior,
  type DeviceSetting,
  type Event,
  type IntervalResult,
  type Observation,
  type Person,
  type Role,
  type TeamMember,
} from './types';

async function audit(
  personId: string | null,
  entity: AuditEntity,
  entityId: string,
  action: AuditAction,
  actorId: string,
  before: unknown | null,
  after: unknown | null,
) {
  await db.auditLogs.add({ id: newId(), personId, entity, entityId, action, actorId, at: nowISO(), before, after });
}

function base(): BaseRecord {
  const t = nowISO();
  return { id: newId(), createdAt: t, updatedAt: t, deletedAt: null };
}

// ---------- 端末の設定 ----------

export async function getDevice(): Promise<DeviceSetting> {
  return (await db.device.get('device')) ?? { key: 'device', userId: null, currentPersonId: null };
}

export async function saveDevice(p: Partial<DeviceSetting>) {
  await db.device.put({ ...(await getDevice()), ...p, key: 'device' });
}

// ---------- 権限（画面の出し分け用） ----------

const RANK: Record<Role, number> = { admin: 5, subadmin: 4, leader: 3, supporter: 2, viewer: 1 };
export const canRecord = (r?: Role) => !!r && RANK[r] >= RANK.supporter;
export const canEditBehaviors = (r?: Role) => !!r && RANK[r] >= RANK.leader;
/** 記録の取り消し・編集: 記録した本人と、管理者・副管理者・支援リーダー（6.3.5） */
export const canUndoEvent = (r: Role | undefined, e: Event, userId: string) =>
  !!r && (e.recorderId === userId ? canRecord(r) : RANK[r] >= RANK.leader);

// ---------- 初回セットアップ（7.1） ----------

/**
 * 同意 → あなたの呼び名と対象者 を1回で保存する。登録した人が管理者になる。
 * 開始コードの確認はサーバー接続後に足す（決定44）。
 */
export async function setupTeam(input: {
  userName: string;
  affiliation: Affiliation;
  personName: string;
}): Promise<{ person: Person; userId: string }> {
  const dev = await getDevice();
  const t = nowISO();
  const userId = dev.userId ?? newId();
  const person: Person = { ...base(), displayName: input.personName, birthMonth: null, notes: '' };
  const member: TeamMember = {
    ...base(),
    personId: person.id,
    userId,
    displayName: input.userName,
    affiliation: input.affiliation,
    role: 'admin',
    familyMark: input.affiliation === 'family',
    sleepInputAllowed: false,
  };
  await db.transaction('rw', [db.users, db.persons, db.teamMembers, db.consents, db.auditLogs, db.device], async () => {
    if (!dev.userId) {
      const user = { id: userId, createdAt: t, updatedAt: t, deletedAt: null, displayName: input.userName };
      await db.users.add(user);
      await audit(null, 'user', userId, 'create', userId, null, user);
    }
    const consent = {
      ...base(),
      personId: person.id,
      userId,
      kind: 'terms_privacy_sensitive' as const,
      textVersion: CONSENT_TEXT_VERSION,
      revokedAt: null,
    };
    await db.consents.add(consent);
    await db.persons.add(person);
    await db.teamMembers.add(member);
    await audit(person.id, 'consent', consent.id, 'create', userId, null, consent);
    await audit(person.id, 'person', person.id, 'create', userId, null, person);
    await audit(person.id, 'teamMember', member.id, 'create', userId, null, member);
    await saveDevice({ userId, currentPersonId: person.id });
  });
  return { person, userId };
}

// ---------- 行動定義（6.2） ----------

export type BehaviorInput = Omit<Behavior, keyof BaseRecord | 'sortOrder' | 'hiddenAt'>;

export async function createBehavior(input: BehaviorInput, actorId: string): Promise<Behavior> {
  const count = await db.behaviors.where('personId').equals(input.personId).count();
  const b: Behavior = { ...base(), ...input, sortOrder: count, hiddenAt: null };
  await db.behaviors.add(b);
  await audit(b.personId, 'behavior', b.id, 'create', actorId, null, b);
  return b;
}

// ---------- 記録（6.3） ----------

export async function createEvent(
  input: Pick<Event, 'personId' | 'behaviorId'> & Partial<Pick<Event, 'count' | 'durationSec' | 'latencySec' | 'occurredAt'>>,
  actorId: string,
): Promise<Event> {
  const occurredAt = input.occurredAt ?? nowISO();
  const e: Event = {
    ...base(),
    personId: input.personId,
    behaviorId: input.behaviorId,
    occurredAt,
    localDate: localDateOf(occurredAt),
    count: input.count ?? 1,
    durationSec: input.durationSec ?? null,
    latencySec: input.latencySec ?? null,
    intensity: null,
    placeName: null,
    activity: null,
    recorderId: actorId,
    backfilled: false,
  };
  await db.events.add(e);
  await audit(e.personId, 'event', e.id, 'create', actorId, null, e);
  return e;
}

export async function updateEvent(id: string, patch: Partial<Event>, actorId: string) {
  const before = await db.events.get(id);
  if (!before) return;
  const after: Event = { ...before, ...patch, updatedAt: nowISO() };
  await db.events.put(after);
  await audit(after.personId, 'event', id, 'update', actorId, before, after);
}

/** −1・取消バッジ: 自分が付けた、その行動の最後の記録（今日の分）を取り消す。履歴は残る */
export async function undoLastEvent(personId: string, behaviorId: string, localDate: string, actorId: string): Promise<Event | null> {
  const list = (await db.events.where('[personId+localDate]').equals([personId, localDate]).toArray())
    .filter((e) => e.behaviorId === behaviorId && !e.deletedAt && e.recorderId === actorId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const last = list[0];
  if (!last) return null;
  const t = nowISO();
  const after = { ...last, deletedAt: t, updatedAt: t };
  await db.events.put(after);
  await audit(personId, 'event', last.id, 'delete', actorId, last, after);
  return last;
}

// ---------- インターバル記録・時間サンプリング（6.3.1） ----------

/** 観察を始める。区間の結果は区切りごとに保存するので、途中で閉じても答えた分は残る */
export async function startObservation(b: Behavior, actorId: string): Promise<Observation> {
  const t = nowISO();
  const o: Observation = {
    ...base(),
    personId: b.personId,
    behaviorId: b.id,
    method: b.method === 'sampling' ? 'sampling' : 'interval',
    intervalSec: b.method === 'sampling' ? (b.samplingMin ?? 5) * 60 : (b.intervalSec ?? 10),
    startedAt: t,
    endedAt: null,
    localDate: localDateOf(t),
    results: [],
    recorderId: actorId,
  };
  await db.observations.add(o);
  await audit(o.personId, 'observation', o.id, 'create', actorId, null, o);
  return o;
}

export async function saveObservationResults(id: string, results: IntervalResult[]) {
  await db.observations.update(id, { results, updatedAt: nowISO() });
}

export async function endObservation(id: string, results: IntervalResult[], actorId: string) {
  const before = await db.observations.get(id);
  if (!before) return;
  const t = nowISO();
  const after: Observation = { ...before, results, endedAt: t, updatedAt: t };
  await db.observations.put(after);
  await audit(after.personId, 'observation', id, 'update', actorId, before, after);
}

/** 観察した区間のうち、起きた区間の割合（%）。未観察は分母に入れない */
export function observedRatio(list: Observation[]): number | null {
  const all = list.flatMap((o) => o.results);
  const seen = all.filter((r) => r !== 'missed').length;
  return seen ? Math.round((all.filter((r) => r === 'yes').length / seen) * 100) : null;
}

// ---------- ABC記録（6.3.2） ----------

/** 選択肢がまだない対象者に、初期テンプレートを入れる */
export async function ensureChoiceOptions(personId: string, actorId: string) {
  // 数えるのと入れるのを1つのトランザクションにして、同時に2回呼ばれても二重に入らないようにする
  await db.transaction('rw', [db.choiceOptions, db.auditLogs], async () => {
    if ((await db.choiceOptions.where('personId').equals(personId).count()) > 0) return;
    const list: ChoiceOption[] = (Object.keys(DEFAULT_CHOICES) as ChoiceKind[]).flatMap((kind) =>
      DEFAULT_CHOICES[kind].map((name, i) => ({ ...base(), personId, kind, name, sortOrder: i, hiddenAt: null })),
    );
    await db.choiceOptions.bulkAdd(list);
    for (const o of list) await audit(personId, 'choiceOption', o.id, 'create', actorId, null, o);
  });
}

export async function addChoiceOption(personId: string, kind: ChoiceKind, name: string, actorId: string): Promise<ChoiceOption> {
  const count = await db.choiceOptions.where('personId').equals(personId).filter((o) => o.kind === kind).count();
  const o: ChoiceOption = { ...base(), personId, kind, name, sortOrder: count, hiddenAt: null };
  await db.choiceOptions.add(o);
  await audit(personId, 'choiceOption', o.id, 'create', actorId, null, o);
  return o;
}

/** 選択肢の削除は非表示にするだけ。過去の記録に付いた値と集計は残る */
export async function hideChoiceOption(id: string, actorId: string) {
  const before = await db.choiceOptions.get(id);
  if (!before) return;
  const t = nowISO();
  const after = { ...before, hiddenAt: t, updatedAt: t };
  await db.choiceOptions.put(after);
  await audit(before.personId, 'choiceOption', id, 'update', actorId, before, after);
}

export type AbcInput = Omit<AbcDetail, keyof BaseRecord | 'personId' | 'eventId' | 'recorderId'>;

/** ABC記録を保存する（1つの記録に1つ。2回目以降は上書きして、前の内容は監査ログに残す） */
export async function saveAbc(event: Event, input: AbcInput, eventPatch: Partial<Pick<Event, 'intensity' | 'activity'>>, actorId: string) {
  await db.transaction('rw', [db.abcDetails, db.events, db.auditLogs], async () => {
    const before = await db.abcDetails.where('eventId').equals(event.id).filter((d) => !d.deletedAt).first();
    if (before) {
      const after: AbcDetail = { ...before, ...input, updatedAt: nowISO() };
      await db.abcDetails.put(after);
      await audit(event.personId, 'abcDetail', after.id, 'update', actorId, before, after);
    } else {
      const d: AbcDetail = { ...base(), ...input, personId: event.personId, eventId: event.id, recorderId: actorId };
      await db.abcDetails.add(d);
      await audit(event.personId, 'abcDetail', d.id, 'create', actorId, null, d);
    }
    if (eventPatch.intensity !== event.intensity || eventPatch.activity !== event.activity) {
      await updateEvent(event.id, eventPatch, actorId);
    }
  });
}

// ---------- AI（6.5・6.6・9章） ----------

/** 採否を決められるのは管理者・副管理者・支援リーダー。分析・提案は支援者も実行できる（決定63） */
export const canDecideAi = (r?: Role) => !!r && RANK[r] >= RANK.leader;
export const canRunAi = canRecord;

/** 1人ごとの上限（決定63）。ログインができるまでは端末内の記録で数える */
export const AI_LIMITS = {
  lead: { day: 10, month: 100 },
  supporter: { day: 3, month: 30 },
};

export async function aiUsage(userId: string, role: Role | undefined) {
  const today = nowISO().slice(0, 10);
  const month = today.slice(0, 7);
  const [a, s] = await Promise.all([
    db.aiAnalyses.where('requestedBy').equals(userId).toArray(),
    db.aiSuggestions.filter((x) => x.requestedBy === userId).toArray(),
  ]);
  const runs = [...a, ...s].filter((x) => x.model !== 'mock' && (!('output' in x) || x.output !== null));
  const limit = canDecideAi(role) ? AI_LIMITS.lead : AI_LIMITS.supporter;
  const day = runs.filter((x) => x.createdAt.slice(0, 10) === today).length;
  const mon = runs.filter((x) => x.createdAt.slice(0, 7) === month).length;
  return { dayLeft: Math.max(0, limit.day - day), monthLeft: Math.max(0, limit.month - mon), limit };
}

export async function getTeamSetting(personId: string): Promise<TeamSetting | undefined> {
  return db.teamSettings.get(personId);
}

/** AI の あり／なし を切りかえる（管理者のみ）。「あり」にするときは、送り先と仮名化の内容への同意を残す（9章） */
export async function setAiEnabled(personId: string, enabled: boolean, actorId: string) {
  await db.transaction('rw', [db.teamSettings, db.consents, db.auditLogs], async () => {
    const before = (await db.teamSettings.get(personId)) ?? null;
    const after: TeamSetting = { personId, aiEnabled: enabled, updatedAt: nowISO(), updatedBy: actorId };
    await db.teamSettings.put(after);
    await audit(personId, 'teamSetting', personId, 'update', actorId, before, after);
    if (enabled) {
      const consent = { ...base(), personId, userId: actorId, kind: 'ai_overseas' as const, textVersion: CONSENT_TEXT_VERSION, revokedAt: null };
      await db.consents.add(consent);
      await audit(personId, 'consent', consent.id, 'create', actorId, null, consent);
    }
  });
}

export async function saveAnalysis(a: Omit<AiAnalysis, keyof BaseRecord | 'decision' | 'decisionNote' | 'decidedBy' | 'decidedAt'>): Promise<AiAnalysis> {
  const rec: AiAnalysis = { ...base(), ...a, decision: null, decisionNote: '', decidedBy: null, decidedAt: null };
  await db.aiAnalyses.add(rec);
  await audit(a.personId, 'aiAnalysis', rec.id, 'create', a.requestedBy, null, rec);
  return rec;
}

export async function saveSuggestion(s: Omit<AiSuggestion, keyof BaseRecord | 'decision' | 'decisionNote' | 'decidedBy' | 'decidedAt'>): Promise<AiSuggestion> {
  const rec: AiSuggestion = { ...base(), ...s, decision: null, decisionNote: '', decidedBy: null, decidedAt: null };
  await db.aiSuggestions.add(rec);
  await audit(s.personId, 'aiSuggestion', rec.id, 'create', s.requestedBy, null, rec);
  return rec;
}

/** 採用 / 修正して採用 / 却下 を記録する。採用したものが「採用した仮説・案」になる（Phase 1b、4章） */
export async function decideAi(table: 'aiAnalyses' | 'aiSuggestions', id: string, decision: AiDecision, note: string, actorId: string) {
  const patch = { decision, decisionNote: note, decidedBy: actorId, decidedAt: nowISO(), updatedAt: nowISO() };
  if (table === 'aiAnalyses') {
    const before = await db.aiAnalyses.get(id);
    if (!before) return;
    await db.aiAnalyses.put({ ...before, ...patch });
    await audit(before.personId, 'aiAnalysis', id, 'update', actorId, before, { ...before, ...patch });
  } else {
    const before = await db.aiSuggestions.get(id);
    if (!before) return;
    await db.aiSuggestions.put({ ...before, ...patch });
    await audit(before.personId, 'aiSuggestion', id, 'update', actorId, before, { ...before, ...patch });
  }
}
