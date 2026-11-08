/**
 * AI に送る入力と、AI から受け取る出力の形（6.5・6.6・9章）。画面とサーバー関数（functions/）の両方で使う。
 * 入力は仮名化したものだけ（対象者・支援者・場所の名前は入れない）。出力は JSON の形を決めて受け取り、自由文のままは出さない。
 */

export const AI_FUNCTIONS = ['attention', 'demand', 'escape', 'sensory'] as const;
export type AiFunction = (typeof AI_FUNCTIONS)[number];

/** ABC記録が10件未満なら推定しない（6.5） */
export const MIN_ABC_RECORDS = 10;
/** 送る期間は直近4週間まで、記録は200件まで（必要最小限、9章） */
export const MAX_DAYS = 28;
export const MAX_RECORDS = 200;

export interface AbcRecordInput {
  date: string; // YYYY-MM-DD
  weekday: string; // 月〜日
  hour: number; // 0〜23
  antecedents: string[];
  antecedentNote: string;
  consequences: string[];
  consequenceNote: string;
  note?: string; // 支援者メモ（置きかえ済み、200文字まで）
  settingEvents: string[];
  place: string; // 「場所A」のように置きかえた名前
  activity: string;
  involvedAffiliations: string[]; // 家族 / 施設の職員 / 学校の先生 など。個人名は送らない
  intensity: number | null;
  recorderGuess: AiFunction | null;
}

export interface AnalysisInput {
  behavior: {
    name: string;
    definition: string;
    intensityCriteria: string[]; // 強度を記録しない行動は空
  };
  period: { from: string; to: string };
  dailyCounts: { date: string; count: number }[]; // クイック記録の1日ごとの回数
  abcRecords: AbcRecordInput[];
}

export interface AnalysisOutput {
  functions: { func: AiFunction; count: number; evidence: string }[];
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  likelyConditions: string[];
  unlikelyConditions: string[];
  nextObservations: string[];
  recordSuggestions: string[];
}

export interface SuggestionInput {
  behavior: AnalysisInput['behavior'];
  adoptedFunctions: AiFunction[];
  hypothesisNote: string; // 修正して採用したときのメモ（仮名化済み）
  likelyConditions: string[];
  existingAlternatives: string[]; // すでに登録している代替行動・望ましい行動
  /** 対象者の「好きなもの」（6.6 #4）。名前（仮名化済み）・種類・ハマり度だけ。写真と「使い方」のメモは送らない */
  reinforcers?: { name: string; category: string; level: number }[];
}

export interface SuggestionOutput {
  alternatives: { behavior: string; howToTeach: string; prompting: string }[];
  antecedentStrategies: { strategy: string; detail: string }[];
  reinforcement: { method: string; detail: string }[];
}

/** ABC分析の AI のまとめ（6.4.3、決定72）に送る集計。件数だけで、記録の文章は送らない */
export interface SummaryInput {
  behaviorName: string;
  period: { from: string; to: string };
  abcCount: number;
  tallies: { title: string; items: { name: string; count: number }[] }[];
}

export interface SummaryOutput {
  summary: string;
}

/** まとめは短く（受け取る量の上限、14.2 #36） */
export const SUMMARY_MAX_CHARS = 300;

/**
 * 手順（課題分析）の下書き（6.15、決定128・129）。行動の名前・定義・種類と、代替行動なら元の問題行動の名前と機能、
 * すでにある望ましい行動・代替行動の名前だけを送る（仮名化済み）。対象者の特性メモと「苦手なこと・気をつけること」は送らない（決定128）
 */
export interface StepsInput {
  behavior: { name: string; definition: string; kind: 'desirable' | 'alternative' };
  replaces: { name: string; func: AiFunction | null } | null;
  existingBehaviors: string[];
}

export interface StepsOutput {
  steps: { action: string; support: string }[];
  hardSteps: string[]; // はじめに手助けが多く要りそうなステップ
  materials: string[]; // 準備するもの
  chain: 'total' | 'forward' | 'backward';
  chainReason: string;
  cautions: string[];
}

/** AI の下書きのステップは7個まで（6.15） */
export const AI_STEPS_MAX = 7;

/** personId: どのチームの回数として数えるか（サーバーが確かめる、決定84） */
export type AiRequest = { personId: string } & (
  | { kind: 'analyze'; input: AnalysisInput }
  | { kind: 'suggest'; input: SuggestionInput }
  | { kind: 'summarize'; input: SummaryInput }
  | { kind: 'steps'; input: StepsInput }
);

export type AiResponse =
  | { status: 'ok'; kind: 'analyze'; output: AnalysisOutput; model: string }
  | { status: 'ok'; kind: 'suggest'; output: SuggestionOutput; model: string }
  | { status: 'ok'; kind: 'summarize'; output: SummaryOutput; model: string }
  | { status: 'ok'; kind: 'steps'; output: StepsOutput; model: string }
  | { status: 'insufficient'; message: string }
  | { status: 'error'; message: string };

const str = { type: 'string' } as const;
const strList = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** 構造化出力の JSON スキーマ（output_config.format） */
export const ANALYSIS_SCHEMA = obj({
  functions: {
    type: 'array',
    items: obj({ func: { type: 'string', enum: [...AI_FUNCTIONS] }, count: { type: 'integer' }, evidence: str }),
  },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  confidenceReason: str,
  likelyConditions: strList,
  unlikelyConditions: strList,
  nextObservations: strList,
  recordSuggestions: strList,
});

export const SUGGESTION_SCHEMA = obj({
  alternatives: { type: 'array', items: obj({ behavior: str, howToTeach: str, prompting: str }) },
  antecedentStrategies: { type: 'array', items: obj({ strategy: str, detail: str }) },
  reinforcement: { type: 'array', items: obj({ method: str, detail: str }) },
});

export const SUMMARY_SCHEMA = obj({ summary: str });

export const STEPS_SCHEMA = obj({
  steps: { type: 'array', items: obj({ action: str, support: str }) },
  hardSteps: strList,
  materials: strList,
  chain: { type: 'string', enum: ['total', 'forward', 'backward'] },
  chainReason: str,
  cautions: strList,
});

/**
 * 出力に出てはいけない言葉（6.6 の絶対条件、9章、決定76）。
 * 罰・弱化・嫌悪刺激・身体拘束・隔離・叱責を提案しない。計画的無視は専門家が決めるまで提案しない。診断・治療方針の語を使わない。
 */
export const BANNED_WORDS = ['罰', '弱化', '嫌悪', '拘束', '隔離', '取り上げ', '叱', '無視', 'タイムアウト', '診断', '治療方針', '服薬', '投薬', '消去', 'お預け', '没収'];

/**
 * 支援の候補と手順の下書きだけに足す禁止語（決定139）。計画的無視を言いかえた言葉。
 * 分析では「周りが反応しないときは起きにくい」のような事実の書き方があるので、分析には使わない
 */
export const IGNORE_WORDS = ['注目しない', '反応しない', '相手にしない'];

/**
 * 出力の文字をすべて集めて、禁止語を探す。
 * 入力の選択肢（例: C「物を取り上げた」「無視した」）を「」付きでそのまま引用した部分だけは、記録の事実なので除いて調べる。
 */
export function findBannedWords(output: unknown, quotedInputs: string[]): string[] {
  let text = collectText(output);
  for (const q of quotedInputs) if (q) text = text.split(`「${q}」`).join('「」');
  return BANNED_WORDS.filter((w) => text.includes(w));
}

function collectText(v: unknown): string {
  if (typeof v === 'string') return v + '\n';
  if (Array.isArray(v)) return v.map(collectText).join('');
  if (v && typeof v === 'object') return Object.values(v).map(collectText).join('');
  return '';
}

/** 受け取った入力が決めた形と大きさに収まっているかを確かめる（サーバー側で使う） */
export function validateAnalysisInput(x: AnalysisInput): string | null {
  if (!x?.behavior?.name || !Array.isArray(x.abcRecords) || !Array.isArray(x.dailyCounts)) return '入力の形が正しくありません';
  if (x.abcRecords.length > MAX_RECORDS) return `ABC記録は ${MAX_RECORDS} 件までです`;
  if (x.dailyCounts.length > MAX_DAYS + 1) return `期間は ${MAX_DAYS} 日までです`;
  if (JSON.stringify(x).length > 120_000) return '入力が大きすぎます';
  return null;
}

/** AI に渡す「好きなもの」の上限（ハマり度の高い順） */
export const MAX_REINFORCERS = 20;

export function validateSuggestionInput(x: SuggestionInput): string | null {
  if (!x?.behavior?.name || !Array.isArray(x.adoptedFunctions) || x.adoptedFunctions.length === 0) return '採用した機能がありません';
  if (!x.adoptedFunctions.every((f) => (AI_FUNCTIONS as readonly string[]).includes(f))) return '機能の値が正しくありません';
  if (x.reinforcers !== undefined && (!Array.isArray(x.reinforcers) || x.reinforcers.length > MAX_REINFORCERS)) return '好きなものの数が多すぎます';
  if (JSON.stringify(x).length > 20_000) return '入力が大きすぎます';
  return null;
}

/** 引用を許す入力の選択肢（分析の出力で「」付きで出てよいもの） */
export function quotedInputsOf(input: AnalysisInput): string[] {
  const s = new Set<string>();
  for (const r of input.abcRecords) for (const x of [...r.antecedents, ...r.consequences, ...r.settingEvents]) s.add(x);
  return [...s];
}

/**
 * まとめでは、機能の判断や支援の方法を書かない（決定72）。その手がかりになる言葉も、引用（「」）の外では使わせない。
 */
export const SUMMARY_BANNED_WORDS = ['機能', '注目', '要求', '回避', '逃避', '感覚', '仮説', '支援方法', 'すべき', 'しましょう', 'ください'];

export function findSummaryBannedWords(output: unknown, quotedInputs: string[]): string[] {
  let text = collectText(output);
  for (const q of quotedInputs) if (q) text = text.split(`「${q}」`).join('「」');
  return [...BANNED_WORDS, ...SUMMARY_BANNED_WORDS].filter((w) => text.includes(w));
}

export function validateSummaryInput(x: SummaryInput): string | null {
  if (!x?.behaviorName || !Array.isArray(x.tallies) || typeof x.abcCount !== 'number') return '入力の形が正しくありません';
  if (x.tallies.length > 10 || x.tallies.some((t) => !Array.isArray(t.items) || t.items.length > 30)) return '入力が大きすぎます';
  if (JSON.stringify(x).length > 20_000) return '入力が大きすぎます';
  return null;
}

/** まとめの出力で「」付きで出てよい集計の項目名 */
export function quotedSummaryInputs(input: SummaryInput): string[] {
  return [...new Set(input.tallies.flatMap((t) => t.items.map((i) => i.name)))];
}

/**
 * 手順の下書きだけに足す禁止語（6.15）。手を添える手助けと身体拘束の境目を越えさせないため。
 * 見つけたら結果を捨てて作り直す。入力の引用は除かない（下書きには引用するものがない）
 */
export const TASK_BANNED_WORDS = [
  '押さえつけ', '押さえ込', '抑えつけ', '抑え込', '体を押さえ', '手を押さえ', '腕を押さえ',
  '制止', '無理に', '引っ張', '羽交い', '閉じ込め', '閉じこめ', '連れて行', '動かないように', '力で',
];
// 「気持ちを抑える」のような言い方まで止めないように、「押さえ」「抑え」は体を押さえる言い方だけにした（決定139）

/** 手順の下書きと、支援の候補（手助けの出し方を書くので）に使う。quotedInputs の「」付きの引用は除く */
export function findTaskBannedWords(output: unknown, quotedInputs: string[] = []): string[] {
  let text = collectText(output);
  for (const q of quotedInputs) if (q) text = text.split(`「${q}」`).join('「」');
  return [...BANNED_WORDS, ...IGNORE_WORDS, ...TASK_BANNED_WORDS].filter((w) => text.includes(w));
}

/** 手順の下書きの出力が決めた大きさに収まっているか（7個まで・1個以上）。収まらなければ作り直す */
export function stepsOutputOk(x: StepsOutput): boolean {
  return Array.isArray(x?.steps) && x.steps.length >= 2 && x.steps.length <= AI_STEPS_MAX && x.steps.every((s) => typeof s?.action === 'string' && s.action.trim().length > 0);
}

export function validateStepsInput(x: StepsInput): string | null {
  if (!x?.behavior?.name || (x.behavior.kind !== 'desirable' && x.behavior.kind !== 'alternative')) return '手順を作れるのは望ましい行動と代替行動だけです';
  if (!Array.isArray(x.existingBehaviors) || x.existingBehaviors.length > 50) return '入力の形が正しくありません';
  if (x.replaces !== null && (typeof x.replaces?.name !== 'string' || (x.replaces.func !== null && !(AI_FUNCTIONS as readonly string[]).includes(x.replaces.func)))) return '入力の形が正しくありません';
  if (JSON.stringify(x).length > 20_000) return '入力が大きすぎます';
  return null;
}
