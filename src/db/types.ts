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
  notes: string; // 特性メモ
  belongs?: string; // 通っているところ（任意）
  cautions?: string; // 苦手なこと・気をつけること（苦手な刺激リスト、任意）
  isSample?: boolean; // お試し用のサンプル（端末内だけ）
}

export interface TeamMember extends BaseRecord {
  personId: string;
  userId: string;
  displayName: string;
  affiliation: Affiliation;
  role: Role;
  familyMark: boolean; // 「家族」の印（睡眠の入力に使う、決定37）
  sleepInputAllowed: boolean;
  approvedAt?: ISODateTime | null; // サーバーのチームだけ。null = 招待を受けて承認を待っている（7.4.2 #3）
  suspendedAt?: ISODateTime | null; // サーバーのチームだけ。停止（退職・卒業など）
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

/**
 * インターバル記録・時間サンプリングの観察（6.3.1、決定28）。区間ごとの結果を順に持つ。
 * 'missed' は画面を消した・ほかのアプリに切り替えた・答えなかった区間（未観察）で、○× を推測で埋めない。
 */
export type IntervalResult = 'yes' | 'no' | 'missed';

export interface Observation extends BaseRecord {
  personId: string;
  behaviorId: string;
  method: 'interval' | 'sampling';
  intervalSec: number; // 区間の長さ（時間サンプリングも秒で持つ）
  startedAt: ISODateTime;
  endedAt: ISODateTime | null; // null = 観察中
  localDate: LocalDate;
  results: IntervalResult[];
  recorderId: string;
}

/** 睡眠ログ（6.3.4、決定36・37）。起きた日（その夜が明けた日）に1件。時刻は 'HH:MM' */
export interface SleepLog extends BaseRecord {
  personId: string;
  wakeDate: LocalDate;
  bedTime: string;
  wakeTime: string;
  wakings: number; // 中途覚醒の回数
  note: string;
  recorderId: string;
}

/**
 * 「観察していなかった」日（6.3.3）。自動の 0 を付けない日として、行動ごと・日ごとに1件。
 * 自動の 0 は保存せずにグラフで計算するので、ここに入った日だけ 0 を付けずに線を切る。
 */
export interface NotObservedDay extends BaseRecord {
  personId: string;
  behaviorId: string;
  localDate: LocalDate;
  recorderId: string;
}

/** 登録場所の種類（6.3.3） */
export type PlaceKind = 'home' | 'school' | 'facility' | 'other';

/**
 * 登録場所（6.3.3、決定42・43）。建物・敷地ごとに1つ。中心と半径はチーム内だけで共有し、書き出しには入れない。
 * 支援者の現在地は保存しない。端末の中でこの中心と半径に照らし合わせ、記録には場所の名前だけを残す。
 * 中心がない場所（位置なしで登録）は、手で選ぶだけに使う。
 */
export interface Place extends BaseRecord {
  personId: string;
  name: string;
  kind: PlaceKind;
  lat: number | null;
  lng: number | null;
  radiusM: 50 | 100 | 200;
  createdBy: string; // User.id
  hiddenAt: ISODateTime | null;
}

/**
 * 管理者の引き継ぎ（6.9、データモデル OwnerTransfer）。サーバーのチームだけ。
 * 作る・返事をするのはサーバーの関数（0012）で、端末は受け取って見せるだけ。
 */
export interface OwnerTransfer extends Omit<BaseRecord, 'deletedAt'> {
  personId: string;
  method: 'nominate' | 'subadmin_request'; // 本人指名 / 副管理者申請
  requestedBy: string;
  fromUser: string; // 旧管理者
  toUser: string; // 新管理者
  requestedAt: ISODateTime;
  dueAt: ISODateTime | null; // 副管理者申請だけ（申し込みから14日）
  result: 'pending' | 'completed' | 'declined' | 'rejected' | 'cancelled';
  decidedAt: ISODateTime | null;
  decidedBy: string | null;
}

/**
 * わたしのいつもの時間（6.3.3、データモデル UserSchedule）。記録者ごとの勤務・在宅時間の目安で、観察時間の推定に使う。
 * 1人につき対象者ごとに1つ。直せるのは本人だけで、チームのほかの人は見るだけ。やめるときは論理削除。
 */
export interface UserSchedule extends BaseRecord {
  personId: string;
  userId: string; // User.id（= ログインの id）
  weekdays: number[]; // 0 = 日曜 〜 6 = 土曜
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'（開始より後。日をまたぐ時間はまだ扱わない）
  placeName: string | null;
}

export const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  home: '自宅',
  school: '学校',
  facility: '施設',
  other: 'その他',
};

/** 強化子（好きなもの）の種類（6.14） */
export type ReinforcerCategory = 'thing' | 'activity' | 'food' | 'people' | 'sensory';

/**
 * 強化子（好きなもの、6.14）。写真は別の表（ReinforcerPhoto）に置き、監査ログには入れない。
 * 「いまハマっている」は最近2週間に更新または使ったもの。
 */
export interface Reinforcer extends BaseRecord {
  personId: string;
  name: string;
  category: ReinforcerCategory;
  level: number; // ハマり度 1〜5
  usage: string; // 使い方と注意
  hasPhoto: boolean;
  lastUsedAt: ISODateTime | null;
  updatedBy: string; // User.id
  hiddenAt: ISODateTime | null;
}

/**
 * 強化子の写真。長辺 640px に縮小し、描き直して Exif（撮影場所など）を落とした JPEG の data URL。
 * 写真を外す・強化子を削除すると data を空にして論理削除する（6.14a）。blob は以前の形で端末に残っている写真だけ
 */
export interface ReinforcerPhoto extends BaseRecord {
  id: string; // Reinforcer.id と同じ
  personId: string;
  data: string;
  blob?: Blob;
}

export const REINFORCER_CATEGORY_LABEL: Record<ReinforcerCategory, string> = {
  thing: '物',
  activity: '活動',
  food: '食べ物',
  people: '人・関わり',
  sensory: '感覚',
};

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

/** チームの設定（8章 TeamSetting）。AI の既定は なし（9章） */
export type RestraintPeriod = 'week' | 'month' | 'quarter';

export const RESTRAINT_PERIOD_LABEL: Record<RestraintPeriod, string> = { week: '1週間', month: '1か月', quarter: '3か月' };

export interface TeamSetting {
  id?: string; // = personId（同期のため）
  personId: string; // チーム = 対象者ごと
  aiEnabled: boolean;
  restraintPeriod?: RestraintPeriod | null; // 身体拘束の見直しをすすめる目安の期間。初期値なし（決定74）
  restraintCount?: number | null; // 目安の件数（この件数を超えたら）。0 なら1件でも記録されたら
  shortSleepUnderHours?: number | null; // 睡眠不足の判定を「○時間未満」にする。null = いつもより2時間以上短い夜（初期設定）
  deleteRequestedAt?: ISODateTime | null; // チームの削除を申し込んだ日時。30日たつと消える
  updatedAt: ISODateTime;
  updatedBy: string;
}

export type AiDecision = 'adopted' | 'modified' | 'rejected';

/** AI の機能仮説（6.5）。送った内容・受け取った内容・採否を残す */
export interface AiAnalysis extends BaseRecord {
  personId: string;
  behaviorId: string;
  requestedBy: string; // User.id
  input: import('../ai/schema').AnalysisInput;
  output: import('../ai/schema').AnalysisOutput | null; // null = データ不足など
  message: string | null;
  model: string | null; // 'mock' は見本の結果
  decision: AiDecision | null;
  decisionNote: string; // 修正して採用したときの内容
  decidedBy: string | null;
  decidedAt: ISODateTime | null;
}

/** AI の提案（6.6）。採用した仮説から作る */
export interface AiSuggestion extends BaseRecord {
  personId: string;
  analysisId: string;
  requestedBy: string;
  output: import('../ai/schema').SuggestionOutput;
  model: string;
  decision: AiDecision | null;
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: ISODateTime | null;
}

/** 同意の記録（7.5）。示した文面の版を残す */
export interface Consent extends BaseRecord {
  personId: string | null;
  userId: string;
  kind: 'terms_privacy_sensitive' | 'ai_overseas';
  textVersion: string;
  revokedAt: ISODateTime | null;
}

/** ABC集計の AI のまとめ（6.4.3、決定72・Phase 3）。集計を文にするだけで、機能の判断や支援の方法は書かない */
export interface AiSummary extends BaseRecord {
  personId: string;
  behaviorId: string;
  periodFrom: LocalDate;
  periodTo: LocalDate;
  requestedBy: string;
  input: import('../ai/schema').SummaryInput;
  output: import('../ai/schema').SummaryOutput;
  model: string;
}

// ---------- 支援計画（6.7、Phase 2） ----------

/** 達成基準（例: 頭たたき 1日2回以下）。グラフに横線で出す */
export interface PlanCriterion {
  behaviorId: string;
  op: 'lte' | 'gte'; // 以下 / 以上
  value: number; // グラフの1日の値と同じ単位（回・分・秒・%）
  note: string; // 例: 2週連続
}

/** 計画の中身。1つの計画を上書きで保存し、変更は PlanChange に残す（決定67） */
export interface PlanContent {
  problemBehaviorId: string | null;
  alternativeBehaviorId: string | null;
  func: BehaviorFunction | null; // 機能仮説
  goal: string; // 支援目標
  criteria: PlanCriterion[];
  antecedent: string; // 先行子操作（予防）
  reinforcement: string; // 代替行動への対応（強化）
  prompting: string; // プロンプト
  crisis: string; // 危機時の対応（安全確保）
  reviewDate: LocalDate | null; // 見直し日
  owner: string; // 担当
}

export const PLAN_FIELD_LABEL: Record<keyof PlanContent, string> = {
  problemBehaviorId: '標的とする問題行動',
  alternativeBehaviorId: '代替行動',
  func: '機能仮説',
  goal: '支援目標',
  criteria: '達成基準',
  antecedent: '先行子操作（予防）',
  reinforcement: '代替行動への対応（強化）',
  prompting: 'プロンプト（手がかり）',
  crisis: '危機時の対応（安全確保）',
  reviewDate: '見直し日',
  owner: '担当',
};

/** 支援計画。content は最後に保存した内容、activeContent は実施中の内容（合意待ちの間は前のまま、決定68） */
export interface SupportPlan extends BaseRecord {
  personId: string;
  content: PlanContent;
  activeContent: PlanContent | null;
  activeSince: LocalDate | null;
}

export type PlanChangeStatus = 'pending' | 'active' | 'past' | 'withdrawn' | 'superseded';

/** 支援計画の変更履歴（決定67）。誰も書きかえ・削除できない（状態だけが進む） */
export interface PlanChange extends BaseRecord {
  personId: string;
  planId: string;
  savedBy: string; // User.id
  reason: string;
  before: PlanContent | null;
  after: PlanContent;
  fields: (keyof PlanContent)[]; // 変わった項目
  signerMemberIds: string[]; // 合意をお願いした人（TeamMember.id、決定69）
  status: PlanChangeStatus;
  activeSince: LocalDate | null; // 実施中になった日（グラフの縦線、決定68）
  closedBy: string | null; // 取り下げた人
}

/** 合意の記録（決定69）。まだ返事がない人は「未確認」（記録なし） */
export interface PlanSignoff extends BaseRecord {
  personId: string;
  changeId: string;
  memberId: string; // TeamMember.id
  state: 'agreed' | 'opinion';
  opinion: string;
}

// ---------- 身体拘束の記録（6.8、Phase 2） ----------

/** 身体拘束の記録。取り消し・削除はできない（deletedAt を使わない）。修正は監査ログに残る */
export interface RestraintLog extends BaseRecord {
  personId: string;
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  localDate: LocalDate;
  placeName: string | null;
  activity: string;
  situation: string; // 状況
  checks: { urgency: boolean; nonAlternative: boolean; temporary: boolean }; // 3要件を確認したか
  urgency: string; // 切迫性の根拠
  nonAlternative: string; // 非代替性の根拠（何を試したか）
  temporary: string; // 一時性の根拠
  performer: string; // 実施者
  decider: string; // 判断者（組織的判断）
  method: string; // 方法
  personState: string; // 本人の状態
  familyReported: boolean;
  familyReportNote: string;
  review: string; // あとの組織での検討（追記）
  recorderId: string;
}

// ---------- 支援会議メモ・申し送り（6.10、Phase 2） ----------

/** 会議の日に保存したグラフ（あとで記録が増えても変わらない） */
export interface ChartSnapshot {
  title: string;
  caption: string;
  granularity: 'day' | 'week' | 'month';
  unit: string;
  fixedMin?: number;
  fixedMax?: number;
  dates: string[];
  lines: { name: string; color: string; dashed: boolean; values: (number | null)[] }[];
  phases: { date: string; label: string }[];
  targets: { value: number; label: string; color: string }[];
}

export interface MeetingNote extends BaseRecord {
  personId: string;
  heldAt: ISODateTime;
  place: string;
  participantIds: string[]; // TeamMember.id
  otherParticipants: string;
  charts: ChartSnapshot[];
  results: string; // 確かめた成果
  decisions: string; // 決めたこと
  nextReview: LocalDate | null;
  planSnapshot: PlanContent | null; // その時点の支援計画
  recorderId: string;
}

/** 申し送り（チーム画面）と、会議メモへのコメント */
export interface Comment extends BaseRecord {
  personId: string;
  target: 'team' | 'meeting';
  targetId: string | null;
  text: string;
  authorId: string; // User.id
}

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'export';
export type AuditEntity = 'user' | 'person' | 'teamMember' | 'behavior' | 'event' | 'consent' | 'choiceOption' | 'abcDetail' | 'teamSetting' | 'aiAnalysis' | 'aiSuggestion' | 'aiSummary' | 'observation' | 'sleepLog' | 'notObservedDay' | 'reinforcer' | 'place' | 'supportPlan' | 'planChange' | 'planSignoff' | 'restraintLog' | 'meetingNote' | 'comment' | 'userSchedule';

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
  useLocation?: boolean; // この端末で位置情報を使う（既定はオフ。6.3.3a）
  placeChoice?: Record<string, string>; // 対象者ごとの、いまの場所（Place.id か 'outside'）
  syncSince?: Record<string, string>; // 表ごとに、サーバーから最後に受け取った時刻（server_at）
  syncTeams?: string[]; // 前回の同期で見えていたチーム（対象者の id）。新しく見えたチームがあれば全部取り直す
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
