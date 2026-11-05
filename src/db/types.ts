/**
 * データモデル（仕様書 8章）。サーバーの表（supabase/migrations/0001_init.sql）と列を合わせる。
 * すべてのレコードは端末で UUID を採番し、updatedAt / deletedAt を持つ。
 * 削除は論理削除（deletedAt を設定）。変更は AuditLog に残す。
 */

export type ISODateTime = string; // 例: 2026-11-03T10:42:00.000+09:00
export type LocalDate = string; // 例: 2026-11-03（端末のローカル日付）

export interface BaseRecord {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

/** 行動の種類: 問題行動 / 望ましい行動 / 代替行動（6.2） */
export type BehaviorKind = 'problem' | 'desirable' | 'alternative';

/** 測定方法。行動ごとに1つ（決定17） */
export type Method = 'frequency' | 'duration' | 'latency' | 'interval' | 'sampling';

/** 4機能 */
export type BehaviorFunction = 'attention' | 'demand' | 'escape' | 'sensory';

/** 5つの役割（6.9、決定41） */
export type Role = 'admin' | 'subadmin' | 'leader' | 'supporter' | 'viewer';

/** 所属（ABC集計の「関わった人」は所属ごとに数える、決定71） */
export type Affiliation = 'family' | 'facility' | 'school' | 'other';

/** ユーザー。ローカルでは「この端末でログインしている人」。サーバー接続後は Supabase Auth のユーザーと同じ id */
export interface User extends BaseRecord {
  displayName: string;
}

/** 対象者（6.1）。実名は必須にしない */
export interface Person extends BaseRecord {
  displayName: string;
  birthMonth: string | null; // YYYY-MM
  notes: string;
}

export interface TeamMember extends BaseRecord {
  personId: string;
  userId: string;
  displayName: string;
  affiliation: Affiliation;
  role: Role;
  familyMark: boolean; // 「家族」の印（睡眠の入力に使う、決定37）
  sleepInputAllowed: boolean;
}

/** 強度（付加項目）。段階ごとに観察できる基準を書く（決定23） */
export interface IntensitySetting {
  levels: 3 | 5;
  criteria: string[]; // levels と同じ数。空文字は「基準未設定」
}

export interface Behavior extends BaseRecord {
  personId: string;
  kind: BehaviorKind;
  name: string;
  definition: string; // 操作的定義
  examples: string;
  nonExamples: string;
  method: Method;
  intervalSec: number | null; // インターバル（5〜60秒、既定10）
  samplingMin: number | null; // 時間サンプリング（1〜30分、既定5）
  intensity: IntensitySetting | null;
  replacesBehaviorId: string | null; // 代替行動: どの問題行動の代わりか
  func: BehaviorFunction | null;
  sortOrder: number;
  hiddenAt: ISODateTime | null; // 非表示（記録は残す）
}

/** 記録（6.3） */
export interface Event extends BaseRecord {
  personId: string;
  behaviorId: string;
  occurredAt: ISODateTime;
  localDate: LocalDate;
  count: number; // 頻度（通常 1）
  durationSec: number | null; // 持続時間
  latencySec: number | null; // 潜時
  intensity: number | null; // null = 未評価
  placeName: string | null; // 場所の名前だけを残す（決定42）
  activity: string | null;
  recorderId: string; // User.id
  backfilled: boolean; // さかのぼって入力した記録
}

/** ABC記録の選択肢（6.3.2）。対象者ごとのテンプレートで、チーム内で共有する。削除は非表示だけで、過去の記録の値は残る */
export type ChoiceKind = 'antecedent' | 'consequence' | 'setting';

export interface ChoiceOption extends BaseRecord {
  personId: string;
  kind: ChoiceKind;
  name: string;
  sortOrder: number;
  hiddenAt: ISODateTime | null;
}

/** ABC記録の詳しい内容。1つの Event に1つ */
export interface AbcDetail extends BaseRecord {
  personId: string;
  eventId: string;
  antecedentIds: string[]; // ChoiceOption.id
  antecedentNote: string;
  consequenceIds: string[];
  consequenceNote: string;
  settingIds: string[]; // 状況要因・確立操作
  involvedMemberIds: string[]; // 関わった人（TeamMember.id）。集計は所属ごと（決定71）
  funcGuess: BehaviorFunction | null; // 記録者が思う機能（任意）
  note: string;
  recorderId: string;
}

/** 初期テンプレート（6.3.2） */
export const DEFAULT_CHOICES: Record<ChoiceKind, string[]> = {
  antecedent: ['要求を断られた', '活動の切り替え', '待ち時間', '騒音', '人が近づいた', '課題提示', '注目がなくなった', '体調不良'],
  consequence: ['注目した（声かけ・制止）', '要求が通った', '活動を中止した', '課題を取り除いた', '無視した', '場所を移した', '物を取り上げた'],
  setting: ['睡眠不足', '空腹', '服薬変更', '体調', '環境の変化'],
};

/** 同意の記録（7.5）。示した文面の版を残す */
export interface Consent extends BaseRecord {
  personId: string | null;
  userId: string;
  kind: 'terms_privacy_sensitive' | 'ai_overseas';
  textVersion: string;
  revokedAt: ISODateTime | null;
}

export type AuditAction = 'create' | 'update' | 'delete' | 'restore';
export type AuditEntity = 'user' | 'person' | 'teamMember' | 'behavior' | 'event' | 'consent' | 'choiceOption' | 'abcDetail';

/** 監査ログ。追記のみで誰も消せない（7.4.2 #6） */
export interface AuditLog {
  id: string;
  personId: string | null;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actorId: string; // User.id
  at: ISODateTime;
  before: unknown | null;
  after: unknown | null;
}

/** 端末内だけの設定（サーバーに送らない） */
export interface DeviceSetting {
  key: 'device';
  userId: string | null; // この端末でログインしている人
  currentPersonId: string | null;
}

export const KIND_LABEL: Record<BehaviorKind, string> = {
  problem: '問題行動',
  desirable: '望ましい行動',
  alternative: '代替行動',
};

export const METHOD_LABEL: Record<Method, string> = {
  frequency: '頻度',
  duration: '持続時間',
  latency: '潜時',
  interval: 'インターバル',
  sampling: '時間サンプリング',
};

export const METHOD_HELP: Record<Method, string> = {
  frequency: '起きるたびに +1 を押す',
  duration: '「開始」「終了」でどのくらい続いたかを測る',
  latency: '「指示を出した」「始まった」で待ち時間を測る',
  interval: '短い区間ごとに、起きたかどうかを ○× で記録する',
  sampling: '決まった間隔で知らせ、その瞬間に起きているかを記録する',
};

export const FUNCTION_LABEL: Record<BehaviorFunction, string> = {
  attention: '注目',
  demand: '要求',
  escape: '回避・逃避',
  sensory: '感覚',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: '管理者',
  subadmin: '副管理者',
  leader: '支援リーダー',
  supporter: '支援者',
  viewer: '閲覧者',
};

export const AFFILIATION_LABEL: Record<Affiliation, string> = {
  family: '家族',
  facility: '施設',
  school: '学校',
  other: 'その他',
};

/** 強度の既定の名前（6.2）。基準は行動ごとに書く */
export const INTENSITY_NAMES: Record<3 | 5, string[]> = {
  3: ['軽微・介入不要', '中・声かけや誘導で収まる', '重・安全確保やけが・物損あり'],
  5: ['とても軽い', '軽い', '中くらい', '重い', 'とても重い'],
};

/** 同意文面の版（下書き、決定79） */
export const CONSENT_TEXT_VERSION = 'draft-2026-11-05';
