/**
 * AI 呼び出しのアダプタ層（9章）。画面はここだけを呼ぶ。
 * - server: 同じサイトの /api/ai（Cloudflare Pages Functions）に送る。API キーはサーバー側だけにある。
 *   ログインの証（アクセストークン）を添え、サーバーがチームの一員か・回数が残っているかを確かめる（決定84）
 * - mock: 外に何も送らず、決まった見本の結果を返す（開発中と、キー未設定のとき）
 * AI「なし」のチームでは、画面がそもそもここを呼ばない。
 */
import {
  MIN_ABC_RECORDS,
  type AiRequest,
  type AiResponse,
  type AnalysisInput,
  type AnalysisOutput,
  type SuggestionInput,
  type SuggestionOutput,
  type SummaryInput,
  type SummaryOutput,
} from './schema';
import { supabase } from '../server/supabase';

type Provider = 'server' | 'mock';
const provider: Provider = (import.meta.env.VITE_AI_PROVIDER as Provider | undefined) ?? (import.meta.env.DEV ? 'mock' : 'server');

export const isMockProvider = provider === 'mock';

export async function requestAi(req: AiRequest): Promise<AiResponse> {
  if (req.kind === 'analyze' && req.input.abcRecords.length < MIN_ABC_RECORDS) {
    return { status: 'insufficient', message: `ABC記録が ${req.input.abcRecords.length} 件です。${MIN_ABC_RECORDS} 件以上になると分析できます。` };
  }
  if (provider === 'mock') return mock(req);
  // サーバーにつながる版はログインの証を付ける。端末内だけの版はログインなしで呼ぶ（回数はサーバーのサイト全体の上限で守る）
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return { status: 'error', message: 'AI はログインしてチームに入ってから使えます。' };
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => null)) as AiResponse | null;
    if (!body) return { status: 'error', message: `サーバーから返事がありません（${res.status}）` };
    return body;
  } catch {
    return { status: 'error', message: '通信できませんでした。電波のよいところでもう一度お試しください。' };
  }
}

/** 見本の結果。入力の件数だけは実際に数える */
async function mock(req: AiRequest): Promise<AiResponse> {
  await new Promise((r) => setTimeout(r, 600));
  if (req.kind === 'analyze') return { status: 'ok', kind: 'analyze', output: mockAnalysis(req.input), model: 'mock' };
  if (req.kind === 'summarize') return { status: 'ok', kind: 'summarize', output: mockSummary(req.input), model: 'mock' };
  return { status: 'ok', kind: 'suggest', output: mockSuggestion(req.input), model: 'mock' };
}

/** 見本のまとめ。いちばん多い項目を並べるだけ */
function mockSummary(input: SummaryInput): SummaryOutput {
  const top = input.tallies
    .filter((t) => t.items.length > 0)
    .map((t) => `${t.title}は「${t.items[0].name}」（${t.items[0].count}件）`)
    .join('、');
  return { summary: `（見本）${input.abcCount}件のうち、いちばん多いのは ${top || 'まだありません'}。実際のまとめでは、ここに AI が書いた短い文が出ます。` };
}

function mockAnalysis(input: AnalysisInput): AnalysisOutput {
  const n = input.abcRecords.length;
  const count = (f: string) => input.abcRecords.filter((r) => r.recorderGuess === f).length;
  return {
    functions: [
      { func: 'escape', count: count('escape'), evidence: `（見本）${n}件のうち、記録者の見立てが「回避・逃避」だった件数です。` },
      { func: 'attention', count: count('attention'), evidence: '（見本）記録者の見立てが「注目」だった件数です。' },
    ],
    confidence: 'low',
    confidenceReason: '（見本）これは AI を使っていない見本の結果です。実際の分析ではありません。',
    likelyConditions: ['（見本）実際の分析では、起きやすい場面がここに出ます。'],
    unlikelyConditions: ['（見本）実際の分析では、起きにくい場面がここに出ます。'],
    nextObservations: ['（見本）仮説を確かめるために次に見ることが出ます。'],
    recordSuggestions: ['（見本）記録に足すとよい項目が出ます。'],
  };
}

function mockSuggestion(input: SuggestionInput): SuggestionOutput {
  return {
    alternatives: [{ behavior: `（見本）「${input.behavior.name}」と同じ目的を満たす行動`, howToTeach: '（見本）教え方が出ます。', prompting: '（見本）手がかりの出し方が出ます。' }],
    antecedentStrategies: [{ strategy: '（見本）先にできる工夫', detail: '（見本）くわしい内容が出ます。' }],
    reinforcement: [{ method: '（見本）望ましい行動をほめる・認める方法', detail: '（見本）くわしい内容が出ます。' }],
  };
}
