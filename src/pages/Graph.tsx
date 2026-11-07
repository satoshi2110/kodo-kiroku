/**
 * グラフ（6.4.1、ワイヤーフレーム 3）。
 * - 日 / 週 / 月 を切りかえる。週・月は値のある日の平均（【暫定】）
 * - 問題行動とその代替行動は同じ枠に入れる。同じ測り方なら重ね、違えば上下に並べて日付をそろえる（決定33）
 * - 縦に並んだパネルは一緒に横スクロールする（決定73）
 * - 条件変更（支援計画が実施中になった日）は縦の点線、達成基準は横の点線（Phase 2）
 * - 表示する行動と睡眠時間のパネルを選べる
 * - 頻度は「回数」と「1時間あたり」を切りかえる（6.4.1）。既定は回数（【暫定】）
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { canExport } from '../db/repo';
import { formatShortDate } from '../lib/date';
import { allDates, canRate, useRecordSet, type Granularity } from '../lib/series';
import { buildGroups, changeSummary, groupTitle, phasesFor, sleepPanel, type PanelSpec } from '../lib/panels';
import { useRevisions } from '../lib/useRevisions';
import { usePlanData } from '../lib/usePlan';
import { Chip, KindBadge, Segmented, TopBar } from '../components/ui';
import LineChart, { ChartSyncProvider, LineSwatch, useNewSync, type Phase } from '../components/LineChart';
import GraphTabs from '../components/GraphTabs';

export default function Graph() {
  const { person, behaviors, me } = useApp();
  const rs = useRecordSet(person?.id);
  const planData = usePlanData(person?.id);
  const revisions = useRevisions(person?.id) ?? [];
  const [g, setG] = useState<Granularity>('day');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showSleep, setShowSleep] = useState(false);
  const [rate, setRate] = useState(false);
  const sync = useNewSync();
  if (!person || !rs) return null;

  const empty = rs.events.length === 0 && rs.observations.length === 0;
  const days = allDates(rs);
  const shown = behaviors.filter((b) => !hidden.has(b.id));
  const hasFreq = shown.some(canRate);
  const groups = buildGroups(shown, rs, days, g, planData?.plan?.activeContent ?? null, rate && hasFreq);
  const phases = planData?.phases ?? [];
  // 変化のまとめは、区切り（日・週・月）にかかわらず1日ごとの値で出す
  const dayPanels = new Map(
    (g === 'day' ? groups : buildGroups(shown, rs, days, 'day', null, rate && hasFreq)).flatMap((grp) => grp.panels).map((p) => [p.key, p]),
  );
  const toggle = (id: string) => setHidden((h) => {
    const n = new Set(h);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="page">
      <TopBar
        title="グラフ"
        sub={person.displayName}
        right={canExport(me?.role) ? <Link to="/report" className="btn btn--sm">PDF</Link> : undefined}
      />
      <GraphTabs />
      {empty && <p className="empty">記録がたまると、ここにグラフが出ます。</p>}
      {!empty && (
        <>
          <div className="section stack">
            <Segmented
              label="区切り"
              value={g}
              onChange={setG}
              options={[
                { value: 'day', label: '日' },
                { value: 'week', label: '週' },
                { value: 'month', label: '月' },
              ]}
            />
            {hasFreq && (
              <Segmented
                label="頻度の見かた"
                value={rate ? 'rate' : 'count'}
                onChange={(v) => setRate(v === 'rate')}
                options={[
                  { value: 'count', label: '回数' },
                  { value: 'rate', label: '1時間あたり' },
                ]}
              />
            )}
            {rate && hasFreq && (
              <p className="help">
                1時間あたり = その日の回数 ÷ 観察していた時間（推定）。観察していた時間は、記録した人の<Link to="/places">「わたしのいつもの時間」</Link>、登録がなければその人のその日の最初の記録から最後の記録まで。何人かいるときは、重なった時間を1回だけ数えます。30分に満たない日は出しません。達成基準は1日の回数で決めているので、横の点線は出しません。
              </p>
            )}
            {phases.length > 0 && (
              <p className="help">縦の点線 = 条件の変更（{phases.map((p) => `${formatShortDate(p.date)} ${p.label}`).join('、')}）。横の点線 = 支援計画の達成基準。</p>
            )}
            {revisions.length > 0 && (
              <p className="help">「定義の変更」の縦の点線 = その行動の、どんな行動か（定義・例・含まないもの）や測り方・強度の基準を直した日です。前と後は数え方が違うことがあります。</p>
            )}
            {days.length > 0 && (
              <p className="help" style={{ margin: 0 }}>
                <strong>
                  期間: {formatShortDate(days[0])} 〜 {formatShortDate(days[days.length - 1])}（{days.length}日）
                </strong>
                ・ グラフは横にずらすと前の日が見られます。「未記録」は記録のない日です。
              </p>
            )}
            {g !== 'day' && <p className="help">週・月は、記録のある日の平均です。</p>}
          </div>
          <ChartSyncProvider value={sync}>
            {groups.map((grp) => (
              <div key={grp.key} className="section">
                <div className="card stack">
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {grp.behaviors.map((b, i) => (
                      <span key={b.id} className="row" style={{ gap: 6 }}>
                        {i > 0 && <span className="muted">と</span>}
                        {(() => {
                          const l = grp.panels.flatMap((p) => p.lines).find((x) => x.name === b.name);
                          return l ? <LineSwatch color={l.color} dashed={l.dashed} /> : null;
                        })()}
                        <strong className="graph-name">{b.name}</strong>
                        <KindBadge kind={b.kind} />
                      </span>
                    ))}
                  </div>
                  {grp.panels.map((p) => (
                    <Panel key={p.key} p={p} day={dayPanels.get(p.key)} g={g} phases={phasesFor(phases, revisions, grp.behaviors)} title={groupTitle(grp.behaviors)} />
                  ))}
                </div>
              </div>
            ))}
            {showSleep && (
              <div className="section">
                <div className="card stack">
                  <strong className="graph-name">睡眠</strong>
                  <Panel p={sleepPanel(rs, days, g)} day={sleepPanel(rs, days, 'day')} g={g} phases={phases} title="睡眠" />
                </div>
              </div>
            )}
          </ChartSyncProvider>
          <div className="section">
            <div className="card stack">
              <span className="label">表示する行動</span>
              <div className="chips">
                {behaviors.map((b) => (
                  <Chip key={b.id} on={!hidden.has(b.id)} onClick={() => toggle(b.id)} problem={b.kind === 'problem'}>{b.name}</Chip>
                ))}
                <Chip on={showSleep} onClick={() => setShowSleep(!showSleep)} dashed>睡眠時間</Chip>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ p, day, g, phases, title }: { p: PanelSpec; day?: PanelSpec; g: Granularity; phases: Phase[]; title: string }) {
  const sum = day ? changeSummary(day, phases) : null;
  return (
    <div className="stack" style={{ gap: 2 }} aria-label={title}>
      <span className="muted">{p.caption}</span>
      {sum && (
        <span className="graph-change">
          <strong>{sum.text}</strong> <span className="muted">（{sum.label}）</span>
        </span>
      )}
      <LineChart
        dates={p.dates}
        lines={p.lines}
        unit={p.unit}
        granularity={g}
        format={p.format}
        tickFormat={p.tickFormat}
        fixedMax={p.fixedMax}
        fixedMin={p.fixedMin}
        phases={phases}
        targets={p.targets}
      />
    </div>
  );
}
