/**
 * PDF レポート（6.12、ワイヤーフレーム 19、Phase 2）。支援計画の画面とグラフ画面から開く。
 * - 期間と入れるものを選ぶ。グラフ・ABC集計・支援計画と達成状況・できたことは既定で入れ、時間帯の図・睡眠・身体拘束の記録は選んだときだけ
 * - 写真と住所は入れない。名前は呼び名のまま。A4 縦。白黒でも線の形（実線・点線）で区別できる
 * - 「PDF を作る」でブラウザの印刷画面を開き、「PDF に保存」を選ぶ。作ったことは監査ログに残す（管理者へのメールはサーバーができてから）
 * - 作れるのは管理者・副管理者・支援リーダー（CSV と同じ）
 */
import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canExport, logExport } from '../db/repo';
import { addDays, dateRange, formatDateJa, formatDateTimeJa, formatShortDate, toLocalDate } from '../lib/date';
import { dailyMain, mainFormat, useRecordSet } from '../lib/series';
import { usePlanData } from '../lib/usePlan';
import { useRevisions } from '../lib/useRevisions';
import { takeSnapshots } from '../lib/snapshot';
import { sleepPanel } from '../lib/panels';
import { computeWins } from '../lib/wins';
import { count, scene } from '../lib/tally';
import { criterionText, fieldText } from '../lib/planText';
import { PLAN_FIELD_LABEL, type PlanContent } from '../db/types';
import { Segmented, TopBar } from '../components/ui';
import SnapshotChart from '../components/SnapshotChart';

type Period = '4w' | 'meeting' | '3m' | 'custom';
type Part = 'graph' | 'abc' | 'plan' | 'wins' | 'scatter' | 'sleep' | 'restraint';
const PARTS: { key: Part; label: string; on: boolean }[] = [
  { key: 'graph', label: 'グラフ（行動ごと、条件変更の線と目標の線つき）', on: true },
  { key: 'abc', label: 'ABC の集計（きっかけ・結果・場面の多い順）', on: true },
  { key: 'plan', label: '支援計画と達成状況', on: true },
  { key: 'wins', label: 'できたこと', on: true },
  { key: 'scatter', label: '時間帯の図（1時間ごとの合計）', on: false },
  { key: 'sleep', label: '睡眠', on: false },
  { key: 'restraint', label: '身体拘束の記録（回数と内容）', on: false },
];

export default function Report() {
  const { person, behaviors, members, me, userId } = useApp();
  const rs = useRecordSet(person?.id);
  const planData = usePlanData(person?.id);
  const revisions = useRevisions(person?.id);
  const today = toLocalDate();
  const [period, setPeriod] = useState<Period>('4w');
  const [cFrom, setCFrom] = useState(addDays(today, -27));
  const [cTo, setCTo] = useState(today);
  const [parts, setParts] = useState(() => new Set(PARTS.filter((p) => p.on).map((p) => p.key)));
  const extra = useLiveQuery(async () => {
    if (!person) return null;
    const [meetings, restraints, details, options] = await Promise.all([
      db.meetingNotes.where('personId').equals(person.id).filter((n) => !n.deletedAt).toArray(),
      db.restraintLogs.where('personId').equals(person.id).toArray(),
      db.abcDetails.where('personId').equals(person.id).filter((d) => !d.deletedAt).toArray(),
      db.choiceOptions.where('personId').equals(person.id).toArray(),
    ]);
    return { meetings, restraints, details, optionName: new Map(options.map((o) => [o.id, o.name])) };
  }, [person?.id]);
  if (!person || !userId || !rs || !planData || !extra || !revisions) return null;
  if (!me) return null; // 役割の読み込みを待つ（待たずに判定すると、権限なしで戻してしまう）
  if (!canExport(me?.role)) return <Navigate to="/plan" replace />;

  const lastMeeting = extra.meetings.map((n) => n.heldAt.slice(0, 10)).sort().pop() ?? null;
  const [from, to] =
    period === '4w' ? [addDays(today, -27), today]
    : period === '3m' ? [addDays(today, -90), today]
    : period === 'meeting' && lastMeeting ? [lastMeeting, today]
    : [cFrom <= cTo ? cFrom : cTo, cFrom <= cTo ? cTo : cFrom];
  const days = dateRange(from, to);
  const g = days.length <= 35 ? 'day' : 'week';
  const has = (p: Part) => parts.has(p);
  const toggle = (p: Part) => setParts((s) => {
    const n = new Set(s);
    if (n.has(p)) n.delete(p);
    else n.add(p);
    return n;
  });

  // 期間中に実施していた支援計画（実施中になった日の順）
  const activated = planData.changes.filter((c) => c.activeSince && (c.status === 'active' || c.status === 'past')).sort((a, b) => a.activeSince!.localeCompare(b.activeSince!));
  const plansInPeriod = activated.filter((c, i) => {
    const end = activated[i + 1] ? addDays(activated[i + 1].activeSince!, -1) : '9999-12-31';
    return c.activeSince! <= to && end >= from;
  });
  const planAtEnd: PlanContent | null = [...activated].reverse().find((c) => c.activeSince! <= to)?.after ?? null;
  const charts = takeSnapshots(behaviors, rs, days, g, planAtEnd, planData.phases, revisions);
  const sleepChart = takeSleep(rs, days, g);
  const last7 = dateRange(addDays(to, -6), to);
  const wins = computeWins(behaviors, rs, planAtEnd, to).filter((w) => w.date >= from);
  const restraints = extra.restraints.filter((l) => l.localDate >= from && l.localDate <= to).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const eventById = new Map(rs.events.map((e) => [e.id, e]));
  const abcRows = extra.details.flatMap((d) => {
    const e = eventById.get(d.eventId);
    return e && e.localDate >= from && e.localDate <= to ? [{ d, e }] : [];
  });
  const opt = (id: string) => extra.optionName.get(id) ?? '（消した選択肢）';
  const creator = members.find((m) => m.userId === userId)?.displayName ?? '';

  async function print() {
    if (!person || !userId) return;
    await logExport(person.id, `PDF レポート ${from}〜${to}`, userId);
    window.print();
  }

  return (
    <div className="page page--no-nav">
      <div className="no-print">
        <TopBar title="PDF レポート" sub="支援会議・個別支援計画・行政への提出用" back="/plan" />
        <div className="section stack">
          <Segmented<Period>
            label="期間"
            value={period}
            onChange={setPeriod}
            options={[
              { value: '4w', label: '直近4週間' },
              ...(lastMeeting ? [{ value: 'meeting' as Period, label: '前回の会議から' }] : []),
              { value: '3m', label: '3か月' },
              { value: 'custom', label: '期間を選ぶ' },
            ]}
          />
          {period === 'custom' && (
            <div className="grid-2">
              <label className="field">はじめ<input type="date" value={cFrom} max={today} onChange={(e) => e.target.value && setCFrom(e.target.value)} /></label>
              <label className="field">おわり<input type="date" value={cTo} max={today} onChange={(e) => e.target.value && setCTo(e.target.value)} /></label>
            </div>
          )}
          <span className="label">{formatDateJa(from)}〜{formatDateJa(to)}</span>
        </div>
        <div className="section">
          <div className="card stack">
            <span className="label">入れるもの</span>
            {PARTS.map((p) => (
              <label key={p.key} className="row check-row">
                <input type="checkbox" checked={has(p.key)} onChange={() => toggle(p.key)} style={{ width: 22, height: 22 }} />
                <span>{p.label}</span>
              </label>
            ))}
            <p className="help">写真と住所は入りません。名前は呼び名のままです。</p>
          </div>
        </div>
        <div className="section stack">
          <button type="button" className="btn btn--primary btn--block" onClick={print}>PDF を作る</button>
          <p className="help">印刷の画面が開きます。送り先で「PDF に保存」を選んでください（A4 縦）。作ったことは履歴に残ります。管理者へのメールはサーバーができてから届くようになります。</p>
        </div>
        <div className="section"><span className="label">見本</span></div>
      </div>

      <article className="report">
        <header className="report__head">
          <h1>{person.displayName} さんの支援の記録</h1>
          <p>期間: {formatDateJa(from)}〜{formatDateJa(to)} ・ 作成: {formatDateJa(today)} {creator}</p>
        </header>

        {has('graph') && (
          <Block title="グラフ">
            {charts.length === 0 ? <p>行動が登録されていません。</p> : charts.map((s, i) => <SnapshotChart key={i} s={s} />)}
            <p className="report__note">{g === 'day' ? '1日ごと' : '1週間ごとの平均'}。縦の線は支援開始・計画の変更、横の点線は達成基準。回数・時間は、記録した日で書かなかった日を 0 にしています。</p>
          </Block>
        )}

        {has('abc') && (
          <Block title={`ABC の集計（ABC記録 ${abcRows.length}件）`}>
            {behaviors.filter((b) => abcRows.some((r) => r.e.behaviorId === b.id)).map((b) => {
              const rows = abcRows.filter((r) => r.e.behaviorId === b.id);
              const lists: [string, string[]][] = [
                ['きっかけ（A）', rows.flatMap((r) => r.d.antecedentIds.map(opt))],
                ['結果（C）', rows.flatMap((r) => r.d.consequenceIds.map(opt))],
                ['場面', rows.map((r) => scene(r.e))],
              ];
              return (
                <div key={b.id} className="report__abc">
                  <strong>{b.name}（{rows.length}件）</strong>
                  {lists.map(([t, items]) => (
                    <p key={t}>{t}: {count(items).slice(0, 5).map(([n, c]) => `${n} ${c}件`).join('、') || 'なし'}</p>
                  ))}
                </div>
              );
            })}
            {abcRows.length === 0 && <p>この期間の ABC記録はありません。</p>}
          </Block>
        )}

        {has('plan') && (
          <Block title="支援計画と達成状況">
            {plansInPeriod.length === 0 && <p>この期間に実施していた支援計画はありません。</p>}
            {plansInPeriod.map((c, i) => (
              <div key={c.id} className="report__plan">
                <strong>{formatDateJa(c.activeSince!)} から実施{c.status === 'active' ? '（いまも実施中）' : ''}{i > 0 ? ' ・ 変わったところ' : ''}</strong>
                {i > 0 && c.reason && <p><span className="report__k">変えた理由</span> {c.reason}</p>}
                {(Object.keys(PLAN_FIELD_LABEL) as (keyof PlanContent)[]).filter((k) => i === 0 || c.fields.includes(k)).map((k) => {
                  const t = fieldText(c.after, k, behaviors);
                  return t === '（なし）' ? null : <p key={k}><span className="report__k">{PLAN_FIELD_LABEL[k]}</span> {t}</p>;
                })}
              </div>
            ))}
            {planAtEnd && planAtEnd.criteria.length > 0 && (
              <div className="report__plan">
                <strong>達成状況（期間の最後の7日の平均）</strong>
                {planAtEnd.criteria.map((cr, i) => {
                  const b = behaviors.find((x) => x.id === cr.behaviorId);
                  if (!b) return null;
                  const v = dailyMain(b, last7, rs).filter((x): x is number => x != null);
                  const m = v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10 : null;
                  const ok = m != null && (cr.op === 'lte' ? m <= cr.value : m >= cr.value);
                  return <p key={i}>{criterionText(cr, behaviors)} → {m == null ? '記録なし' : `${mainFormat(b)(m)}（${ok ? '届いた' : 'まだ'}）`}</p>;
                })}
              </div>
            )}
          </Block>
        )}

        {has('wins') && (
          <Block title="できたこと">
            {wins.length === 0 ? <p>この期間はまだありません。</p> : (
              <ul>{wins.map((w, i) => <li key={i}>{formatShortDate(w.date)} {w.text}{w.place ? `（${w.place}）` : ''}</li>)}</ul>
            )}
          </Block>
        )}

        {has('scatter') && (
          <Block title="時間帯の図（期間の合計、1時間ごと）">
            {behaviors.filter((b) => b.method === 'frequency' || b.method === 'duration').map((b) => <HourStrip key={b.id} name={b.name} events={rs.events.filter((e) => e.behaviorId === b.id && e.localDate >= from && e.localDate <= to)} />)}
          </Block>
        )}

        {has('sleep') && (
          <Block title="睡眠">
            <SnapshotChart s={sleepChart} showTitle={false} />
          </Block>
        )}

        {has('restraint') && (
          <Block title={`身体拘束の記録（${restraints.length}件）`}>
            <p className="report__note">身体拘束は治療や支援の方法ではありません。緊急やむを得ない場合だけ行い、減らしていくために記録しています。</p>
            {restraints.length === 0 && <p>この期間の記録はありません。</p>}
            {restraints.map((l) => {
              const min = Math.max(0, Math.round((new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) / 60000));
              return (
                <div key={l.id} className="report__plan">
                  <strong>{formatDateTimeJa(l.startedAt)} ・ {min}分{l.placeName ? ` ・ ${l.placeName}` : ''}</strong>
                  <p>状況: {l.situation}</p>
                  <p>3要件: 切迫性 {l.checks.urgency ? '確認' : '未確認'}・非代替性 {l.checks.nonAlternative ? '確認' : '未確認'}・一時性 {l.checks.temporary ? '確認' : '未確認'}</p>
                  {l.method && <p>方法: {l.method}</p>}
                  <p>家族への報告: {l.familyReported ? `あり ${l.familyReportNote}` : 'まだ'}</p>
                  {l.review && <p>あとの組織での検討: {l.review}</p>}
                </div>
              );
            })}
          </Block>
        )}
      </article>
    </div>
  );
}

function takeSleep(rs: Parameters<typeof sleepPanel>[0], days: string[], g: 'day' | 'week') {
  const p = sleepPanel(rs, days, g);
  return { title: '睡眠', caption: p.caption, granularity: g, unit: p.unit, dates: p.dates, lines: p.lines.map((l) => ({ ...l, dashed: !!l.dashed })), phases: [], targets: [] };
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report__block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function HourStrip({ name, events }: { name: string; events: { occurredAt: string; count: number }[] }) {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const e of events) hours[new Date(e.occurredAt).getHours()] += e.count;
  const max = Math.max(1, ...hours);
  return (
    <div className="hourstrip">
      <span className="hourstrip__name">{name}</span>
      <div className="hourstrip__cells">
        {hours.map((n, h) => (
          <span key={h} className="hourstrip__cell" style={{ background: n ? `rgba(194,65,12,${0.15 + 0.85 * (n / max)})` : undefined, color: n / max > 0.5 ? '#fff' : undefined }} title={`${h}時台 ${n}`}>
            {n || ''}
          </span>
        ))}
      </div>
      <div className="hourstrip__cells hourstrip__axis">
        {hours.map((_, h) => <span key={h}>{h % 6 === 0 ? h : ''}</span>)}
      </div>
    </div>
  );
}
