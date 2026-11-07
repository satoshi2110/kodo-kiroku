/**
 * AI分析と AI提案（6.5・6.6、ワイヤーフレーム 5）。AI「あり」のチームだけに出る（9章）。
 * 結果はいつも「AI による仮説（支援者の確認が必要）」と示す。採否（採用 / 修正して採用 / 却下）は管理者・副管理者・支援リーダーが決める。
 * 採用したものは「採用した仮説」「採用した案」として残り、支援計画ができたら（Phase 2）計画に取り込む。
 */
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { aiTeamUsage, aiUsage, canDecideAi, canRunAi, decideAi, saveAnalysis, saveSuggestion } from '../db/repo';
import { buildAnalysisInput, makeMasker, placeNamesFor } from '../ai/build';
import { isMockProvider, requestAi } from '../ai/adapter';
import { MAX_REINFORCERS, MIN_ABC_RECORDS } from '../ai/schema';
import { formatDateTimeJa, formatShortDate } from '../lib/date';
import { FUNCTION_LABEL, REINFORCER_CATEGORY_LABEL, type AiAnalysis, type AiDecision, type AiSuggestion, type Behavior } from '../db/types';
import { FBA_LINK } from '../lib/links';
import { TopBar } from '../components/ui';

const CONFIDENCE_LABEL = { high: '高', medium: '中', low: '低' } as const;
const DECISION_LABEL: Record<AiDecision, string> = { adopted: '採用', modified: '修正して採用', rejected: '却下' };

export default function AI() {
  const { person, behaviors, members, me, userId, aiEnabled, teamSettingLoaded } = useApp();
  const problems = behaviors.filter((b) => b.kind === 'problem');
  const [behaviorId, setBehaviorId] = useState<string | null>(null);
  const behavior = problems.find((b) => b.id === behaviorId) ?? problems[0];
  const [busy, setBusy] = useState<'analyze' | 'suggest' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = useLiveQuery(
    async () => (person && behavior ? buildAnalysisInput(person, behavior, members) : null),
    [person?.id, behavior?.id, members],
  );
  const usage = useLiveQuery(async () => (userId ? aiUsage(userId, me?.role) : null), [userId, me?.role, busy]);
  const teamUsage = useLiveQuery(async () => (person ? aiTeamUsage(person.id) : null), [person?.id, busy]);
  const allAnalyses = useLiveQuery(
    async () => (person ? (await db.aiAnalyses.where('personId').equals(person.id).filter((a) => !a.deletedAt).toArray()) : []),
    [person?.id],
  );
  const analyses = useLiveQuery(
    async () =>
      person && behavior
        ? (await db.aiAnalyses.where('personId').equals(person.id).filter((a) => a.behaviorId === behavior.id && !a.deletedAt).toArray()).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
        : [],
    [person?.id, behavior?.id],
  );
  const suggestions = useLiveQuery(
    async () => (person ? (await db.aiSuggestions.where('personId').equals(person.id).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [person?.id],
  );

  if (!person || !userId || !teamSettingLoaded) return null;
  if (!aiEnabled) return <Navigate to="/team" replace />;
  const latest = analyses?.[0];
  const runnable =
    canRunAi(me?.role) && (usage?.dayLeft ?? 0) > 0 && (usage?.monthLeft ?? 0) > 0 && (teamUsage?.dayLeft ?? 0) > 0 && (teamUsage?.monthLeft ?? 0) > 0;

  async function analyze() {
    if (!person || !behavior || !input || !userId) return;
    setBusy('analyze');
    setError(null);
    const res = await requestAi({ personId: person.id, kind: 'analyze', input });
    if (res.status === 'ok' && res.kind === 'analyze') {
      await saveAnalysis({ personId: person.id, behaviorId: behavior.id, requestedBy: userId, input, output: res.output, message: null, model: res.model });
    } else if (res.status === 'insufficient') {
      setError(res.message);
    } else if (res.status === 'error') {
      setError(res.message);
    }
    setBusy(null);
  }

  async function suggest(a: AiAnalysis) {
    if (!person || !behavior || !a.output || !userId) return;
    setBusy('suggest');
    setError(null);
    // 分析と同じ置きかえをする。分析の入力も置きかえ直す（置きかえを直す前に保存した分析のため）
    const mask = makeMasker(person, members, await placeNamesFor(person.id));
    const b0 = a.input.behavior;
    // 好きなもの（6.6 #4）。隠したもの・消したものは除き、ハマり度の高い順に。写真と「使い方」のメモは送らない
    const reinforcers = (await db.reinforcers.where('personId').equals(person.id).toArray())
      .filter((r) => !r.deletedAt && !r.hiddenAt && r.name.trim())
      .sort((x, y) => y.level - x.level)
      .slice(0, MAX_REINFORCERS)
      .map((r) => ({ name: mask(r.name), category: REINFORCER_CATEGORY_LABEL[r.category], level: r.level }));
    const res = await requestAi({
      personId: person.id,
      kind: 'suggest',
      input: {
        behavior: { name: mask(b0.name), definition: mask(b0.definition), intensityCriteria: b0.intensityCriteria.map(mask) },
        adoptedFunctions: a.output.functions.filter((f) => f.count > 0).map((f) => f.func).slice(0, 2),
        hypothesisNote: mask(a.decisionNote),
        likelyConditions: a.output.likelyConditions,
        existingAlternatives: behaviors.filter((b) => b.kind !== 'problem').map((b) => mask(b.name)),
        reinforcers,
      },
    });
    if (res.status === 'ok' && res.kind === 'suggest') {
      await saveSuggestion({ personId: person.id, analysisId: a.id, requestedBy: userId, output: res.output, model: res.model });
    } else if (res.status !== 'ok') {
      setError(res.message);
    }
    setBusy(null);
  }

  return (
    <div className="page">
      <TopBar title="AI分析" sub={behavior ? `${behavior.name} ・ 直近4週間` : undefined} />

      {problems.length === 0 ? (
        <p className="empty">問題行動を登録すると、AI で機能の仮説を立てられます。</p>
      ) : (
        <>
          <div className="section stack">
            {problems.length > 1 && (
              <label className="field">
                行動
                <select value={behavior?.id} onChange={(e) => setBehaviorId(e.target.value)}>
                  {problems.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <div className="ai-note">
              これは <strong>AI による仮説</strong> です（支援者の確認が必要）。診断や治療方針ではありません。採否は管理者・副管理者・支援リーダーが決めます。
            </div>
            <a className="help" href={FBA_LINK} target="_blank" rel="noopener noreferrer">機能分析について（外部のページ）</a>
            {isMockProvider && <p className="help">いまは開発用の「見本の結果」モードです。外の AI には何も送りません。</p>}
            <div className="card stack">
              <div className="stack" style={{ gap: 2 }}>
                <span className="muted">
                  {input ? `${formatShortDate(input.period.from)}〜${formatShortDate(input.period.to)} ・ ABC記録 ${input.abcRecords.length}件` : '読み込み中…'}
                </span>
                {usage && <span className="muted">あなたの残り: 今日 {usage.dayLeft}回 ・ 今月 {usage.monthLeft}回</span>}
                {teamUsage && (
                  <span className="muted">
                    チームの残り: 今日 {teamUsage.dayLeft}回 ・ 今月 {teamUsage.monthLeft}回（上限 1日{teamUsage.limit.day}回・月{teamUsage.limit.month}回）
                  </span>
                )}
              </div>
              {input && input.abcRecords.length < MIN_ABC_RECORDS && (
                <p className="help">ABC記録が {MIN_ABC_RECORDS} 件以上になると分析できます（いま {input.abcRecords.length} 件）。</p>
              )}
              {canRunAi(me?.role) ? (
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  disabled={!runnable || !input || input.abcRecords.length < MIN_ABC_RECORDS || busy !== null}
                  onClick={analyze}
                >
                  {busy === 'analyze' ? 'AI が記録を読んでいます…' : 'AI で分析する（1回分を使います）'}
                </button>
              ) : (
                <p className="help">閲覧者は結果と採否を見るだけです。</p>
              )}
              {error && <p className="ai-error" role="alert">{error}</p>}
            </div>
          </div>

          {latest?.output && (
            <AnalysisCard
              a={latest}
              canDecide={canDecideAi(me?.role)}
              onDecide={(d, note) => decideAi('aiAnalyses', latest.id, d, note, userId)}
              onSuggest={() => suggest(latest)}
              suggesting={busy === 'suggest'}
              canSuggest={runnable}
              suggestions={(suggestions ?? []).filter((s) => s.analysisId === latest.id)}
              onDecideSuggestion={(id, d, note) => decideAi('aiSuggestions', id, d, note, userId)}
            />
          )}

          {(analyses?.length ?? 0) > 1 && (
            <div className="section">
              <div className="card">
                <h2 className="card__title">これまでの分析</h2>
                {analyses!.slice(1).map((a) => (
                  <div key={a.id} className="row row--between today-row">
                    <span className="muted">{formatDateTimeJa(a.createdAt)}</span>
                    <span style={{ flex: 1 }}>{a.output ? topFunctions(a) : 'データ不足'}</span>
                    <span className="muted">{a.decision ? DECISION_LABEL[a.decision] : '未決定'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Adopted analyses={allAnalyses ?? []} suggestions={suggestions ?? []} behaviors={behaviors} />
    </div>
  );
}

/**
 * 採用したもの（決定70）: 採用・修正して採用した仮説と案。支援計画を作るときに取り込める（Phase 2）。
 */
function Adopted({ analyses, suggestions, behaviors }: { analyses: AiAnalysis[]; suggestions: AiSuggestion[]; behaviors: Behavior[] }) {
  const ok = (d: AiDecision | null) => d === 'adopted' || d === 'modified';
  const hyps = analyses.filter((a) => ok(a.decision) && a.output).sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  const plans = suggestions.filter((x) => ok(x.decision)).sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  const nameOf = (id: string) => behaviors.find((b) => b.id === id)?.name ?? '（非表示の行動）';
  return (
    <div className="section">
      <div className="card stack">
        <span className="label">採用したもの</span>
        {hyps.length === 0 && plans.length === 0 && <span className="muted">まだありません。採用すると、ここに残ります。</span>}
        {hyps.map((a) => (
          <div key={a.id} className="today-row stack" style={{ gap: 2 }}>
            <span>
              <span className="badge badge--role">採用した仮説</span> {nameOf(a.behaviorId)}: {topFunctions(a)}
            </span>
            {a.decisionNote && <span className="help">修正した内容: {a.decisionNote}</span>}
            <span className="muted">{a.decidedAt ? formatDateTimeJa(a.decidedAt) : ''} ・ {DECISION_LABEL[a.decision!]}</span>
          </div>
        ))}
        {plans.map((x) => {
          const a = analyses.find((y) => y.id === x.analysisId);
          return (
            <div key={x.id} className="today-row stack" style={{ gap: 2 }}>
              <span>
                <span className="badge badge--role">採用した案</span> {a ? nameOf(a.behaviorId) : ''}: {x.output.alternatives.map((y) => y.behavior).join('、')}
              </span>
              {x.decisionNote && <span className="help">修正した内容: {x.decisionNote}</span>}
              <span className="muted">{x.decidedAt ? formatDateTimeJa(x.decidedAt) : ''} ・ {DECISION_LABEL[x.decision!]}</span>
            </div>
          );
        })}
        {(hyps.length > 0 || plans.length > 0) && <p className="help">支援計画を作るときに、ここから取り込めます（計画の画面の「採用したものから取り込む」）。</p>}
      </div>
    </div>
  );
}

function topFunctions(a: AiAnalysis) {
  return (a.output?.functions ?? [])
    .filter((f) => f.count > 0)
    .map((f) => FUNCTION_LABEL[f.func])
    .join('・');
}

function AnalysisCard({
  a,
  canDecide,
  onDecide,
  onSuggest,
  suggesting,
  canSuggest,
  suggestions,
  onDecideSuggestion,
}: {
  a: AiAnalysis;
  canDecide: boolean;
  onDecide: (d: AiDecision, note: string) => void;
  onSuggest: () => void;
  suggesting: boolean;
  canSuggest: boolean;
  suggestions: AiSuggestion[];
  onDecideSuggestion: (id: string, d: AiDecision, note: string) => void;
}) {
  const o = a.output!;
  const max = Math.max(1, ...o.functions.map((f) => f.count));
  const adopted = a.decision === 'adopted' || a.decision === 'modified';
  return (
    <>
      <div className="section">
        <div className="card stack">
          <div className="row row--between">
            <span className="label">推定される機能</span>
            <span className="badge badge--role">確信度: {CONFIDENCE_LABEL[o.confidence]}</span>
          </div>
          {a.model === 'mock' && <span className="badge badge--problem" style={{ alignSelf: 'flex-start' }}>見本の結果（AI は使っていません）</span>}
          {o.functions.map((f) => (
            <div key={f.func} className="stack" style={{ gap: 2 }}>
              <div className="tally">
                <span className="tally__name">{FUNCTION_LABEL[f.func]}</span>
                <span className="tally__bar"><span style={{ width: `${(f.count / max) * 100}%` }} /></span>
                <span className="tally__n">{f.count}件</span>
              </div>
              <span className="help">{f.evidence}</span>
            </div>
          ))}
          <span className="help">確信度の理由: {o.confidenceReason}</span>
          <span className="muted">{formatDateTimeJa(a.createdAt)} 作成</span>
        </div>
      </div>
      <ListCard title="起きやすい条件" items={o.likelyConditions} />
      <ListCard title="起きにくい条件" items={o.unlikelyConditions} />
      <ListCard title="仮説を確かめるために次に観察すること" items={o.nextObservations} />
      <ListCard title="記録に足すとよい項目" items={o.recordSuggestions} />

      <Decision decision={a.decision} note={a.decisionNote} canDecide={canDecide} onDecide={onDecide} what="この仮説" />

      {adopted && (
        <div className="section stack">
          {suggestions.length === 0 && (
            <button type="button" className="btn btn--outline btn--block" disabled={!canSuggest || suggesting} onClick={onSuggest}>
              {suggesting ? 'AI が支援の候補を考えています…' : '代替行動と支援の候補を提案してもらう（1回分を使います）'}
            </button>
          )}
          {suggestions.slice(0, 1).map((s) => (
            <SuggestionCard key={s.id} s={s} canDecide={canDecide} onDecide={(d, note) => onDecideSuggestion(s.id, d, note)} />
          ))}
        </div>
      )}
    </>
  );
}

function SuggestionCard({ s, canDecide, onDecide }: { s: AiSuggestion; canDecide: boolean; onDecide: (d: AiDecision, note: string) => void }) {
  const o = s.output;
  return (
    <>
      <div className="card stack">
        <span className="label">AI の提案（候補）</span>
        {s.model === 'mock' && <span className="badge badge--problem" style={{ alignSelf: 'flex-start' }}>見本の結果（AI は使っていません）</span>}
        <span className="card__title">代わりの行動</span>
        {o.alternatives.map((x, i) => (
          <div key={i} className="stack" style={{ gap: 2 }}>
            <strong>{x.behavior}</strong>
            <span className="help">教え方: {x.howToTeach}</span>
            <span className="help">手がかりの出し方: {x.prompting}</span>
          </div>
        ))}
        <span className="card__title">先にできる工夫</span>
        {o.antecedentStrategies.map((x, i) => (
          <div key={i} className="stack" style={{ gap: 2 }}>
            <strong>{x.strategy}</strong>
            <span className="help">{x.detail}</span>
          </div>
        ))}
        <span className="card__title">できたときの認め方</span>
        {o.reinforcement.map((x, i) => (
          <div key={i} className="stack" style={{ gap: 2 }}>
            <strong>{x.method}</strong>
            <span className="help">{x.detail}</span>
          </div>
        ))}
      </div>
      <Decision decision={s.decision} note={s.decisionNote} canDecide={canDecide} onDecide={onDecide} what="この提案" inline />
    </>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="section">
      <div className="card stack">
        <span className="label">{title}</span>
        <ul className="ai-list">
          {items.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </div>
    </div>
  );
}

/** 採用 / 修正して採用 / 却下。決めた後は結果を表示する */
function Decision({
  decision,
  note,
  canDecide,
  onDecide,
  what,
  inline,
}: {
  decision: AiDecision | null;
  note: string;
  canDecide: boolean;
  onDecide: (d: AiDecision, note: string) => void;
  what: string;
  inline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const body = decision ? (
    <div className="card stack done-box">
      <span className="card__title">{what}は「{DECISION_LABEL[decision]}」になりました</span>
      {note && <span className="help">修正した内容: {note}</span>}
    </div>
  ) : !canDecide ? (
    <p className="help">採否は管理者・副管理者・支援リーダーが決めます。</p>
  ) : editing ? (
    <div className="card stack">
      <label className="field">
        どう直して採用しますか？
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="例: 回避だけでなく注目もありそう。午後の様子も見る" />
      </label>
      <div className="grid-2">
        <button type="button" className="btn" onClick={() => setEditing(false)}>やめる</button>
        <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={() => onDecide('modified', text.trim())}>修正して採用</button>
      </div>
    </div>
  ) : (
    <div className="ai-decide">
      <button type="button" className="btn btn--primary" onClick={() => onDecide('adopted', '')}>採用</button>
      <button type="button" className="btn btn--outline" onClick={() => setEditing(true)}>修正して採用</button>
      <button type="button" className="btn" onClick={() => onDecide('rejected', '')}>却下</button>
    </div>
  );
  return inline ? body : <div className="section">{body}</div>;
}
