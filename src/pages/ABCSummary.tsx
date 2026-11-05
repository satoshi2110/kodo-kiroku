/**
 * ABC集計（6.4.3、ワイヤーフレーム 23）。グラフ画面の「ABC集計」から開く。
 * 行動と期間を選び、きっかけ・結果・場面・状況要因・関わった人（所属ごと、決定71）・記録者の機能の見立てを多い順に並べる。
 * 「AI のまとめ」は Phase 3（決定72）なので、ここには出さない。
 */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { addDays, formatShortDate, toLocalDate } from '../lib/date';
import { AFFILIATION_LABEL, FUNCTION_LABEL, type AbcDetail, type Event } from '../db/types';
import { Segmented, TopBar } from '../components/ui';

type Period = '2w' | 'all' | 'custom';

export default function ABCSummary() {
  const { person, behaviors, members } = useApp();
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

  if (!person || !data) return null;
  const current = choices.find((b) => b.id === behaviorId) ?? choices[0];

  const firstDate = data.rows.reduce((m, r) => (r.e.localDate < m ? r.e.localDate : m), today);
  const range: [string, string] = period === '2w' ? [addDays(today, -13), today] : period === 'all' ? [firstDate, today] : [from, to];
  const rows = data.rows.filter((r) => r.e.behaviorId === current?.id && r.e.localDate >= range[0] && r.e.localDate <= range[1]);

  const memberAff = new Map(members.map((m) => [m.id, m.affiliation]));
  const opt = (id: string) => data.optionName.get(id) ?? '（消した選択肢）';

  return (
    <div className="page page--no-nav">
      <TopBar
        title="ABC集計"
        sub={`${formatShortDate(range[0])}〜${formatShortDate(range[1])} ・ ABC記録 ${rows.length}件`}
        back="/graph"
      />

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
            <label className="field">
              行動
              <select value={current?.id} onChange={(e) => setBehaviorId(e.target.value)}>
                {choices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="empty">この期間の ABC記録はありません。</p>
          ) : (
            <>
              <Tally title="きっかけ（A）" note="多い順" items={rows.flatMap((r) => r.d.antecedentIds.map(opt))} />
              <Tally title="結果（C）" note="多い順" items={rows.flatMap((r) => r.d.consequenceIds.map(opt))} />
              <Tally title="場面（場所 ・ 活動）" note="多い順" items={rows.map((r) => scene(r.e))} />
              <Tally title="状況要因" note="付いた記録の数" items={rows.flatMap((r) => r.d.settingIds.map(opt))} />
              <Tally
                title="関わった人（所属ごと）"
                note="個人名では出しません"
                items={rows.flatMap((r) => uniq(r.d.involvedMemberIds.map((id) => memberAff.get(id))).map((a) => (a ? AFFILIATION_LABEL[a] : '不明')))}
              />
              <Tally title="記録した人が考えた機能" note="AI の仮説と比べる材料" items={rows.map((r) => funcLabel(r.d))} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function scene(e: Event) {
  return `${e.placeName ?? '場所なし'} ・ ${e.activity ?? '活動なし'}`;
}

function funcLabel(d: AbcDetail) {
  return d.funcGuess ? FUNCTION_LABEL[d.funcGuess] : 'わからない';
}

/** 1件の記録に同じ所属の人が2人いても、その所属は1件と数える */
function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function Tally({ title, note, items }: { title: string; note: string; items: string[] }) {
  const counts = [...items.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
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
