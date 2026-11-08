/**
 * ABC分析（6.4.3、ワイヤーフレーム 23）。グラフ画面の「ABC分析」から開く。
 * 行動と期間を選び、きっかけ・結果・場面・状況要因・関わった人（所属ごと、決定71）・記録者の機能の見立てを多い順に並べる。
 * 「支援開始から」は、支援計画が初めて実施中になった日から（計画がなければ記録の始めから）。
 * AI のまとめ（Phase 3、決定72）: AI あり のチームだけ。集計を短い文にするだけで、機能の判断や支援の方法は書かない。
 * 送るのは件数の集計だけ（名前は置きかえる）で、1回分を使う。
 */
import { AiUsageLine } from '../components/AiUsageLine';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { aiTeamUsage, aiUsage, canRunAi } from '../db/repo';
import { saveSummary } from '../db/phase2';
import { requestAi, isMockProvider } from '../ai/adapter';
import { makeMasker, placeNamesFor } from '../ai/build';
import type { SummaryInput } from '../ai/schema';
import { addDays, formatDateTimeJa, formatShortDate, toLocalDate } from '../lib/date';
import { usePlanData } from '../lib/usePlan';
import { AFFILIATION_LABEL, FUNCTION_LABEL, type AbcDetail } from '../db/types';
import { Segmented, TopBar } from '../components/ui';
import GraphTabs from '../components/GraphTabs';
import { count, scene, uniq } from '../lib/tally';

type Period = '2w' | 'all' | 'custom';

export default function ABCSummary() {
  const { person, behaviors, members, me, userId, aiEnabled } = useApp();
  const planData = usePlanData(person?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const personId = person?.id ?? '';
  const today = toLocalDate();

  const data = useLiveQuery(async () => {
    if (!personId) return null;
    const [details, events, options] = await Promise.all([
      db.abcDetails.where('personId').equals(personId).filter((d) => !d.deletedAt).toArray(),
      db.events.where('personId').equals(personId).filter((e) => !e.deletedAt).toArray(),
      db.choiceOptions.where('personId').equals(personId).toArray(),
    ]);
    const eventById = new Map(events.map((e) => [e.id, e]));
    // 取り消した記録に付いた ABC は数えない
    const rows = details.flatMap((d) => (eventById.has(d.eventId) ? [{ d, e: eventById.get(d.eventId)! }] : []));
    return { rows, optionName: new Map(options.map((o) => [o.id, o.name])) };
  }, [personId]);

  const withAbc = useMemo(() => new Set((data?.rows ?? []).map((r) => r.e.behaviorId)), [data]);
  const choices = behaviors.filter((b) => withAbc.has(b.id));
  const [behaviorId, setBehaviorId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('2w');
  const [from, setFrom] = useState(addDays(today, -13));
  const [to, setTo] = useState(today);

  const current = choices.find((b) => b.id === behaviorId) ?? choices[0];
  const summaries = useLiveQuery(
    async () => (personId && current ? (await db.aiSummaries.where('personId').equals(personId).filter((x) => x.behaviorId === current.id && !x.deletedAt).toArray()) : []),
    [personId, current?.id],
  );
  const usage = useLiveQuery(async () => (userId && personId ? { mine: await aiUsage(userId, me?.role), team: await aiTeamUsage(personId) } : null), [userId, me?.role, personId, busy]);

  if (!person || !data || !userId) return null;

  const firstDate = data.rows.reduce((m, r) => (r.e.localDate < m ? r.e.localDate : m), today);
  const planStart = planData?.phases[0]?.date ?? null;
  const range: [string, string] = period === '2w' ? [addDays(today, -13), today] : period === 'all' ? [planStart ?? firstDate, today] : [from, to];
  const rows = data.rows.filter((r) => r.e.behaviorId === current?.id && r.e.localDate >= range[0] && r.e.localDate <= range[1]);

  const memberAff = new Map(members.map((m) => [m.id, m.affiliation]));
  const opt = (id: string) => data.optionName.get(id) ?? '（消した選択肢）';
  const tallies: { title: string; note: string; items: string[] }[] = [
    { title: 'きっかけ（A）', note: '多い順', items: rows.flatMap((r) => r.d.antecedentIds.map(opt)) },
    { title: '結果（C）', note: '多い順', items: rows.flatMap((r) => r.d.consequenceIds.map(opt)) },
    { title: '場面（場所 ・ 活動）', note: '多い順', items: rows.map((r) => scene(r.e)) },
    { title: '状況要因', note: '付いた記録の数', items: rows.flatMap((r) => r.d.settingIds.map(opt)) },
    {
      title: '関わった人（所属ごと）',
      note: '個人名では出しません',
      items: rows.flatMap((r) => uniq(r.d.involvedMemberIds.map((id) => memberAff.get(id))).map((a) => (a ? AFFILIATION_LABEL[a] : '不明'))),
    },
  ];
  const summary = (summaries ?? [])
    .filter((x) => x.periodFrom === range[0] && x.periodTo === range[1])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const runnable =
    canRunAi(me?.role) && !!usage && usage.mine.dayLeft > 0 && usage.mine.monthLeft > 0 && usage.team.dayLeft > 0 && usage.team.monthLeft > 0;

  async function summarize() {
    if (!person || !current || !userId) return;
    setBusy(true);
    setError(null);
    // 名前を置きかえる（場所・対象者・通っているところ・支援者）。機能の見立ての集計は送らない（まとめで機能を判断しないため、決定72）
    const mask = makeMasker(person, members, await placeNamesFor(person.id, rows.map((r) => r.e.placeName)));
    const input: SummaryInput = {
      behaviorName: mask(current.name),
      period: { from: range[0], to: range[1] },
      abcCount: rows.length,
      tallies: tallies.map((t) => ({ title: t.title, items: count(t.items).slice(0, 15).map(([name, n]) => ({ name: mask(name), count: n })) })),
    };
    const res = await requestAi({ personId: person.id, kind: 'summarize', input });
    if (res.status === 'ok' && res.kind === 'summarize') {
      await saveSummary({ personId: person.id, behaviorId: current.id, periodFrom: range[0], periodTo: range[1], requestedBy: userId, input, output: res.output, model: res.model });
    } else if (res.status !== 'ok') setError(res.message);
    setBusy(false);
  }

  return (
    <div className="page">
      <TopBar title="ABC分析" sub={`${formatShortDate(range[0])}〜${formatShortDate(range[1])} ・ ABC記録 ${rows.length}件`} />
      <GraphTabs />

      {choices.length === 0 ? (
        <p className="empty">まだ ABC記録がありません。ホームの記録を押して「詳しく書く」と、ここに集計が出ます。</p>
      ) : (
        <>
          <div className="section stack">
            <Segmented<Period>
              label="期間"
              value={period}
              onChange={setPeriod}
              options={[
                { value: '2w', label: '直近2週間' },
                { value: 'all', label: '支援開始から' },
                { value: 'custom', label: '期間を選ぶ' },
              ]}
            />
            {period === 'custom' && (
              <div className="grid-2">
                <label className="field">はじめ<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="field">おわり<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
              </div>
            )}
            {period === 'all' && !planStart && <p className="help">支援計画がまだ実施中になっていないので、記録の始めからを数えています。</p>}
            <label className="field">
              行動
              <select value={current?.id} onChange={(e) => setBehaviorId(e.target.value)}>
                {choices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          {aiEnabled && rows.length > 0 && (
            <div className="section">
              <div className="card stack">
                <div className="row row--between">
                  <span className="label">AI のまとめ</span>
                  <span className="badge badge--role">AI あり</span>
                </div>
                {summary ? (
                  <>
                    {summary.model === 'mock' && <span className="badge badge--problem" style={{ alignSelf: 'flex-start' }}>見本の結果（AI は使っていません）</span>}
                    <p className="reinf__usage">{summary.output.summary}</p>
                    <span className="help">
                      記録の集計を AI が文章にしたものです。機能の判断や支援の方法は含みません（それは「AI分析」で）。{formatDateTimeJa(summary.createdAt)} 作成
                    </span>
                  </>
                ) : (
                  <span className="help">この期間の集計を、AI が短い文章にまとめます。送るのは件数の集計だけで、名前は置きかえます。</span>
                )}
                {isMockProvider && <p className="help">いまは開発用の「見本の結果」モードです。外の AI には何も送りません。</p>}
                {canRunAi(me?.role) ? (
                  <button type="button" className="btn btn--outline btn--block" disabled={!runnable || busy} onClick={summarize}>
                    {busy ? 'AI がまとめています…' : summary ? 'まとめを作り直す（1回分を使います）' : 'まとめを作る（1回分を使います）'}
                  </button>
                ) : (
                  <p className="help">閲覧者はまとめを見るだけです。</p>
                )}
                {usage && <AiUsageLine mine={usage.mine} team={usage.team} />}
                {error && <p className="ai-error" role="alert">{error}</p>}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="empty">この期間の ABC記録はありません。</p>
          ) : (
            <>
              {tallies.map((t) => <Tally key={t.title} title={t.title} note={t.note} items={t.items} />)}
              <Tally title="記録した人が考えた機能" note="AI の仮説と比べる材料" items={rows.map((r) => funcLabel(r.d))} />
            </>
          )}
        </>
      )}
    </div>
  );
}


function funcLabel(d: AbcDetail) {
  return d.funcGuess ? FUNCTION_LABEL[d.funcGuess] : 'わからない';
}



function Tally({ title, note, items }: { title: string; note: string; items: string[] }) {
  const counts = count(items);
  const max = counts[0]?.[1] ?? 1;
  return (
    <div className="section">
      <div className="card stack">
        <div className="row row--between">
          <span className="label">{title}</span>
          <span className="muted">{note}</span>
        </div>
        {counts.length === 0 && <span className="muted">まだ付いていません</span>}
        {counts.map(([name, n]) => (
          <div key={name} className="tally">
            <span className="tally__name">{name}</span>
            <span className="tally__bar"><span style={{ width: `${(n / max) * 100}%` }} /></span>
            <span className="tally__n">{n}件</span>
          </div>
        ))}
      </div>
    </div>
  );
}
