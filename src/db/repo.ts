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
  type SleepLog,
  type NotObservedDay,
  type Reinforcer,
  type Place,
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

/** 睡眠の入力・変更: 管理者・副管理者と、「家族」の印か「睡眠の入力を許可」が付いた人（決定37） */
export const canEditSleep = (m?: TeamMember) => !!m && (RANK[m.role] >= RANK.subadmin || m.familyMark || m.sleepInputAllowed);

/** CSV の書き出し: 管理者・副管理者・支援リーダー（6.12） */
export const canExport = (r?: Role) => !!r && RANK[r] >= RANK.leader;

/** 書き出したことを監査ログに残す（管理者へのメールは、サーバーができてから） */
export async function logExport(personId: string, kind: string, actorId: string) {
  await audit(personId, 'person', personId, 'export', actorId, null, { kind });
}

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

/** 名前・定義・強度の基準などを直す。前の内容は監査ログに残る（定義の変更履歴） */
export async function updateBehavior(id: string, patch: Partial<BehaviorInput>, actorId: string) {
  const before = await db.behaviors.get(id);
  if (!before) return;
  const after: Behavior = { ...before, ...patch, updatedAt: nowISO() };
  await db.behaviors.put(after);
  await audit(after.personId, 'behavior', id, 'update', actorId, before, after);
}

/** 非表示（削除の既定）: ホーム・グラフ・集計から消えるが、記録は残り、元に戻せる */
export async function setBehaviorHidden(id: string, hidden: boolean, actorId: string) {
  const before = await db.behaviors.get(id);
  if (!before) return;
  const t = nowISO();
  const after: Behavior = { ...before, hiddenAt: hidden ? t : null, updatedAt: t };
  await db.behaviors.put(after);
  await audit(after.personId, 'behavior', id, hidden ? 'update' : 'restore', actorId, before, after);
}

/** 記録ごと削除（管理者のみ、6.2）。論理削除で、何件消したかを監査ログに残す */
export async function deleteBehaviorWithRecords(id: string, actorId: string) {
  await db.transaction('rw', [db.behaviors, db.events, db.abcDetails, db.observations, db.notObservedDays, db.auditLogs], async () => {
    const before = await db.behaviors.get(id);
    if (!before) return;
    const t = nowISO();
    const gone = <T extends BaseRecord>(xs: T[]) => xs.map((x) => ({ ...x, deletedAt: t, updatedAt: t }));
    const events = await db.events.where('behaviorId').equals(id).filter((e) => !e.deletedAt).toArray();
    const eventIds = new Set(events.map((e) => e.id));
    const abcs = await db.abcDetails.where('personId').equals(before.personId).filter((d) => !d.deletedAt && eventIds.has(d.eventId)).toArray();
    const obs = await db.observations.where('behaviorId').equals(id).filter((o) => !o.deletedAt).toArray();
    const marks = await db.notObservedDays.where('personId').equals(before.personId).filter((x) => !x.deletedAt && x.behaviorId === id).toArray();
    await db.events.bulkPut(gone(events));
    await db.abcDetails.bulkPut(gone(abcs));
    await db.observations.bulkPut(gone(obs));
    await db.notObservedDays.bulkPut(gone(marks));
    const after: Behavior = { ...before, deletedAt: t, updatedAt: t };
    await db.behaviors.put(after);
    await audit(before.personId, 'behavior', id, 'delete', actorId, before, {
      ...after,
      deletedEvents: events.length,
      deletedAbcDetails: abcs.length,
      deletedObservations: obs.length,
      deletedNotObservedDays: marks.length,
    });
  });
}

/** 行動ごとの記録の件数（一覧と削除の確認に出す） */
export async function recordCounts(personId: string): Promise<Map<string, number>> {
  const [events, obs] = await Promise.all([
    db.events.where('personId').equals(personId).filter((e) => !e.deletedAt).toArray(),
    db.observations.where('personId').equals(personId).filter((o) => !o.deletedAt).toArray(),
  ]);
  const m = new Map<string, number>();
  for (const x of [...events, ...obs]) m.set(x.behaviorId, (m.get(x.behaviorId) ?? 0) + 1);
  return m;
}

// ---------- 記録（6.3） ----------

export async function createEvent(
  input: Pick<Event, 'personId' | 'behaviorId'> &
    Partial<Pick<Event, 'count' | 'durationSec' | 'latencySec' | 'occurredAt' | 'intensity' | 'placeName' | 'backfilled'>>,
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
    intensity: input.intensity ?? null,
    placeName: input.placeName ?? null,
    activity: null,
    recorderId: actorId,
    backfilled: input.backfilled ?? false,
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

/** 自動の 0 を「観察していなかった（未記録）」にする／0 に戻す（6.3.3）。どちらも履歴に残る */
export async function setNotObserved(personId: string, behaviorId: string, localDate: string, notObserved: boolean, actorId: string) {
  const current = (await db.notObservedDays.where('[personId+localDate]').equals([personId, localDate]).toArray()).find(
    (x) => x.behaviorId === behaviorId && !x.deletedAt,
  );
  if (notObserved && !current) {
    const rec: NotObservedDay = { ...base(), personId, behaviorId, localDate, recorderId: actorId };
    await db.notObservedDays.add(rec);
    await audit(personId, 'notObservedDay', rec.id, 'create', actorId, null, rec);
  }
  if (!notObserved && current) {
    const t = nowISO();
    const after = { ...current, deletedAt: t, updatedAt: t };
    await db.notObservedDays.put(after);
    await audit(personId, 'notObservedDay', current.id, 'delete', actorId, current, after);
  }
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

// ---------- 睡眠ログ（6.3.4） ----------

/** 同じ夜（起きた日）に2件目を入れたときは上書きし、前の値は監査ログに残す */
export async function saveSleep(input: Pick<SleepLog, 'personId' | 'wakeDate' | 'bedTime' | 'wakeTime' | 'wakings' | 'note'>, actorId: string) {
  const before = (await db.sleepLogs.where('[personId+wakeDate]').equals([input.personId, input.wakeDate]).toArray()).find((l) => !l.deletedAt);
  const after: SleepLog = before ? { ...before, ...input, recorderId: actorId, updatedAt: nowISO() } : { ...base(), ...input, recorderId: actorId };
  await db.sleepLogs.put(after);
  await audit(input.personId, 'sleepLog', after.id, before ? 'update' : 'create', actorId, before ?? null, after);
}

// ---------- 場所（6.3.3） ----------

/** 場所の追加・編集は支援者以上。削除は非表示で、過去の記録に付いた場所名は残る */
export const canEditPlaces = canRecord;

export type PlaceInput = Pick<Place, 'personId' | 'name' | 'kind' | 'lat' | 'lng' | 'radiusM'>;

export async function savePlace(id: string | null, input: PlaceInput, actorId: string): Promise<Place> {
  const before = id ? await db.places.get(id) : undefined;
  const after: Place = before ? { ...before, ...input, updatedAt: nowISO() } : { ...base(), ...input, createdBy: actorId, hiddenAt: null };
  await db.places.put(after);
  await audit(after.personId, 'place', after.id, before ? 'update' : 'create', actorId, before ?? null, after);
  return after;
}

export async function hidePlace(id: string, actorId: string) {
  const before = await db.places.get(id);
  if (!before) return;
  const t = nowISO();
  const after: Place = { ...before, hiddenAt: t, updatedAt: t };
  await db.places.put(after);
  await audit(after.personId, 'place', id, 'update', actorId, before, after);
}

/** いまの場所を端末に覚える（Place.id / 'outside' / null = 未設定） */
export async function setPlaceChoice(personId: string, choice: string | null) {
  const dev = await getDevice();
  const placeChoice = { ...(dev.placeChoice ?? {}) };
  if (choice) placeChoice[personId] = choice;
  else delete placeChoice[personId];
  await saveDevice({ placeChoice });
}

// ---------- 強化子（好きなもの、6.14） ----------

/** 強化子の追加・編集は支援者以上（6.9）。閲覧者は見るだけ */
export const canEditReinforcers = canRecord;

export type ReinforcerInput = Pick<Reinforcer, 'personId' | 'name' | 'category' | 'level' | 'usage'>;

/** 追加・編集。photo: Blob は差しかえ、null は写真を消す、undefined はそのまま */
export async function saveReinforcer(id: string | null, input: ReinforcerInput, photo: Blob | null | undefined, actorId: string): Promise<Reinforcer> {
  return db.transaction('rw', [db.reinforcers, db.reinforcerPhotos, db.auditLogs], async () => {
    const before = id ? await db.reinforcers.get(id) : undefined;
    const hasPhoto = photo === undefined ? !!before?.hasPhoto : photo !== null;
    const after: Reinforcer = before
      ? { ...before, ...input, hasPhoto, updatedBy: actorId, updatedAt: nowISO() }
      : { ...base(), ...input, hasPhoto, lastUsedAt: null, updatedBy: actorId, hiddenAt: null };
    await db.reinforcers.put(after);
    if (photo) await db.reinforcerPhotos.put({ id: after.id, personId: after.personId, blob: photo });
    if (photo === null) await db.reinforcerPhotos.delete(after.id);
    await audit(after.personId, 'reinforcer', after.id, before ? 'update' : 'create', actorId, before ?? null, after);
    return after;
  });
}

/** ハマり度だけを直す（一覧の ● を押したとき） */
export async function setReinforcerLevel(id: string, level: number, actorId: string) {
  const before = await db.reinforcers.get(id);
  if (!before) return;
  const after: Reinforcer = { ...before, level, updatedBy: actorId, updatedAt: nowISO() };
  await db.reinforcers.put(after);
  await audit(after.personId, 'reinforcer', id, 'update', actorId, before, after);
}

/** 「今日使った」: いまハマっているものに数える */
export async function markReinforcerUsed(id: string, actorId: string) {
  const before = await db.reinforcers.get(id);
  if (!before) return;
  const after: Reinforcer = { ...before, lastUsedAt: nowISO(), updatedAt: nowISO() };
  await db.reinforcers.put(after);
  await audit(after.personId, 'reinforcer', id, 'update', actorId, before, after);
}

/** 削除: 強化子は論理削除し、写真は消す（6.14a） */
export async function deleteReinforcer(id: string, actorId: string) {
  await db.transaction('rw', [db.reinforcers, db.reinforcerPhotos, db.auditLogs], async () => {
    const before = await db.reinforcers.get(id);
    if (!before) return;
    const t = nowISO();
    const after: Reinforcer = { ...before, hasPhoto: false, deletedAt: t, updatedAt: t };
    await db.reinforcers.put(after);
    await db.reinforcerPhotos.delete(id);
    await audit(before.personId, 'reinforcer', id, 'delete', actorId, before, after);
  });
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

/** チームの設定を変えられるのは管理者・副管理者（ワイヤーフレーム 13） */
export const canEditTeamSettings = (r?: Role) => !!r && RANK[r] >= RANK.subadmin;

/** AI 以外のチームの設定を直す。変更は監査ログに残る */
export async function updateTeamSetting(personId: string, patch: Partial<Pick<TeamSetting, 'shortSleepUnderHours' | 'deleteRequestedAt'>>, actorId: string) {
  const before = (await db.teamSettings.get(personId)) ?? null;
  const after: TeamSetting = { aiEnabled: false, ...before, ...patch, personId, updatedAt: nowISO(), updatedBy: actorId };
  await db.teamSettings.put(after);
  await audit(personId, 'teamSetting', personId, 'update', actorId, before, after);
}

/** メンバーの「家族」の印と「睡眠の入力を許可」（決定37）。付け外しは管理者 */
export async function setMemberFlags(memberId: string, patch: Partial<Pick<TeamMember, 'familyMark' | 'sleepInputAllowed'>>, actorId: string) {
  const before = await db.teamMembers.get(memberId);
  if (!before) return;
  const after: TeamMember = { ...before, ...patch, updatedAt: nowISO() };
  await db.teamMembers.put(after);
  await audit(before.personId, 'teamMember', memberId, 'update', actorId, before, after);
}

export const TEAM_DELETE_DAYS = 30;

/**
 * チームの削除（申し込みから30日たったら実行）。記録・写真・場所など対象者のデータを消す。
 * 監査ログは追記だけで誰も消せない決まり（7.4.2 #6）なので残し、削除したことを書き足す。
 */
export async function purgeTeam(personId: string, actorId: string) {
  const tables = [
    db.events, db.abcDetails, db.observations, db.sleepLogs, db.notObservedDays, db.reinforcers, db.reinforcerPhotos,
    db.places, db.behaviors, db.choiceOptions, db.aiAnalyses, db.aiSuggestions, db.teamMembers, db.consents,
  ];
  await db.transaction('rw', [...tables, db.teamSettings, db.persons, db.auditLogs, db.device], async () => {
    for (const t of tables) await t.where('personId').equals(personId).delete();
    await db.teamSettings.delete(personId);
    await db.persons.delete(personId);
    await audit(personId, 'person', personId, 'delete', actorId, null, { purged: true });
    const dev = await getDevice();
    if (dev.currentPersonId === personId) await saveDevice({ currentPersonId: null });
  });
}

/** AI の あり／なし を切りかえる（管理者のみ）。「あり」にするときは、送り先と仮名化の内容への同意を残す（9章） */
export async function setAiEnabled(personId: string, enabled: boolean, actorId: string) {
  await db.transaction('rw', [db.teamSettings, db.consents, db.auditLogs], async () => {
    const before = (await db.teamSettings.get(personId)) ?? null;
    const after: TeamSetting = { ...before, personId, aiEnabled: enabled, updatedAt: nowISO(), updatedBy: actorId };
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
