/**
 * 支援会議メモ（6.10、ワイヤーフレーム 18）。
 * - 日時・場所・参加した人・確かめた成果・決めたこと・次の見直し日
 * - 初めて保存したときに、会議の日の前4週間のグラフ（1週間ごと）と、その時点の支援計画を残す。あとで記録が増えても変わらない
 * - コメント（自分のものだけ消せる。履歴は残る）
 * - 参加者への知らせはアプリの通知ができてから（ストア版、6.11）
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canEditMeeting, saveMeeting, type MeetingInput } from '../db/phase2';
import { CommentThread } from '../components/Comments';
import { addDays, dateRange, formatDateTimeJa, formatShortDate, fromDateTimeLocalInput, localDateOf, nowISO, toDateTimeLocalInput } from '../lib/date';
import { useRecordSet } from '../lib/series';
import { usePlanData } from '../lib/usePlan';
import { useRevisions } from '../lib/useRevisions';
import { takeSnapshots } from '../lib/snapshot';
import { fieldText } from '../lib/planText';
import { AFFILIATION_LABEL, PLAN_FIELD_LABEL, type MeetingNote, type PlanContent } from '../db/types';
import { Chip, TopBar } from '../components/ui';
import SnapshotChart from '../components/SnapshotChart';

export default function MeetingEditRoute() {
  const { id = 'new' } = useParams();
  const note = useLiveQuery(async () => (id === 'new' ? null : ((await db.meetingNotes.get(id)) ?? null)), [id]);
  if (note === undefined) return null;
  if (id !== 'new' && !note) return <p className="empty">会議メモが見つかりません。</p>;
  return <MeetingEdit key={id} note={note} />;
}

/** 会議の日の前4週間 */
const periodOf = (heldAt: string) => {
  const d = localDateOf(heldAt);
  return dateRange(addDays(d, -28), addDays(d, -1));
};

function MeetingEdit({ note }: { note: MeetingNote | null }) {
  const { person, behaviors, members, me, userId } = useApp();
  const nav = useNavigate();
  const rs = useRecordSet(person?.id);
  const planData = usePlanData(person?.id);
  const revisions = useRevisions(person?.id);
  const [f, setF] = useState<MeetingInput>(() =>
    note
      ? { ...note }
      : {
          personId: person?.id ?? '',
          heldAt: nowISO(),
          place: '',
          participantIds: me ? [me.id] : [],
          otherParticipants: '',
          charts: [],
          results: '',
          decisions: '',
          nextReview: null,
          planSnapshot: null,
        },
  );
  const [saving, setSaving] = useState(false);
  // 新しいメモでは、書いている人を参加者に入れておく（読み込みが後になることがある）
  useEffect(() => {
    if (!note && me) setF((x) => (x.participantIds.length ? x : { ...x, participantIds: [me.id] }));
  }, [note, me]);
  if (!person || !userId || !rs || !planData || !revisions) return null;
  if (!me) return null; // 役割の読み込みを待つ（待たずに判定すると、権限なしで戻してしまう）
  const editable = canEditMeeting(me?.role, note ?? undefined, userId);
  if (!note && !editable) return <Navigate to="/meetings" replace />;
  const set = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const days = periodOf(f.heldAt);
  const planNow: PlanContent | null = planData.plan?.activeContent ?? null;
  // 保存済みのメモは保存したときのグラフ。新しいメモは今の記録から作った見本
  const charts = note ? note.charts : takeSnapshots(behaviors, rs, days, 'week', planNow, planData.phases, revisions);
  const planShown = note ? note.planSnapshot : planNow;
  const toggle = (mid: string) => set('participantIds', f.participantIds.includes(mid) ? f.participantIds.filter((x) => x !== mid) : [...f.participantIds, mid]);

  async function save() {
    if (!userId || !person) return;
    setSaving(true);
    const input: MeetingInput = note ? f : { ...f, charts, planSnapshot: planNow };
    const saved = await saveMeeting(note?.id ?? null, input, userId);
    if (!note) nav(`/meetings/${saved.id}`, { replace: true });
    else setSaving(false);
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="支援会議メモ" sub={`${formatDateTimeJa(f.heldAt)}${f.place ? ` ・ ${f.place}` : ''}`} back="/meetings" />

      <div className="section">
        <div className="card stack">
          <div className="stack">
            <label className="field">
              日時
              <input type="datetime-local" value={toDateTimeLocalInput(f.heldAt)} disabled={!editable || !!note} onChange={(e) => e.target.value && set('heldAt', fromDateTimeLocalInput(e.target.value))} />
            </label>
            <label className="field">
              場所
              <input value={f.place} disabled={!editable} onChange={(e) => set('place', e.target.value)} placeholder="例: 施設の会議室" />
            </label>
          </div>
          <span className="label">参加した人</span>
          <div className="chips">
            {members.map((m) => (
              <Chip key={m.id} on={f.participantIds.includes(m.id)} onClick={editable ? () => toggle(m.id) : undefined}>
                {m.displayName}（{AFFILIATION_LABEL[m.affiliation]}）
              </Chip>
            ))}
          </div>
          <input className="input" value={f.otherParticipants} disabled={!editable} onChange={(e) => set('otherParticipants', e.target.value)} placeholder="チームにいない参加者（例: 父）" aria-label="チームにいない参加者" />
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">
            見たグラフ（会議の日の時点で保存） {formatShortDate(note?.charts[0]?.dates[0] ?? days[0])}〜{formatShortDate(days[days.length - 1])}
          </span>
          {!note && <p className="help">保存すると、会議の日の前4週間のグラフ（1週間ごとの平均）をこのメモに残します。あとで記録が増えても変わりません。</p>}
          {charts.length === 0 && <p className="muted">行動が登録されていません。</p>}
          {charts.map((s, i) => <SnapshotChart key={i} s={s} />)}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <label className="field">
            確かめた成果（できたこと）
            <textarea value={f.results} disabled={!editable} onChange={(e) => set('results', e.target.value)} placeholder="例: 休憩カードが3週続けて増えた" />
          </label>
          {/* これまでの「できたこと」を見ながら書けるように（決定51） */}
          <Link to="/wins">これまでの「できたこと」を見る</Link>
          <label className="field">
            決めたこと
            <textarea value={f.decisions} disabled={!editable} onChange={(e) => set('decisions', e.target.value)} placeholder="例: 午前の課題の量を2つ減らし、終わりの合図を写真カードで見せる" />
          </label>
          <label className="field">
            次の見直し日
            <input type="date" value={f.nextReview ?? ''} disabled={!editable} onChange={(e) => set('nextReview', e.target.value || null)} />
          </label>
          <p className="help">支援計画を変えるときは、計画の画面の「編集」から変えて合意をもらいます（会議メモだけでは計画は変わりません）。</p>
        </div>
      </div>

      {planShown && (
        <div className="section">
          <details className="card">
            <summary className="label">その時点の支援計画</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              {(Object.keys(PLAN_FIELD_LABEL) as (keyof PlanContent)[]).map((k) => {
                const t = fieldText(planShown, k, behaviors);
                return t !== '（なし）' ? (
                  <div key={k} className="stack" style={{ gap: 2 }}>
                    <span className="muted">{PLAN_FIELD_LABEL[k]}</span>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>
                  </div>
                ) : null;
              })}
            </div>
          </details>
        </div>
      )}

      {editable && (
        <div className="section stack">
          <button type="button" className="btn btn--primary btn--block" disabled={saving} onClick={save}>{note ? '修正を保存する' : '保存する'}</button>
          <p className="help">参加者への知らせは、アプリの通知ができてから（ストア版）。修正の履歴は残ります。</p>
        </div>
      )}

      {note && <CommentThread target="meeting" targetId={note.id} />}
    </div>
  );
}
