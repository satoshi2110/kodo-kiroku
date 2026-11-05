/**
 * 身体拘束の記録の入力・修正（6.8、ワイヤーフレーム 17）。保存すると記録者と日時が付き、修正の履歴が残る。消すことはできない。
 */
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state';
import { canEditRestraint, canRecordRestraint, saveRestraint, type RestraintInput } from '../db/phase2';
import { formatDateTimeJa, fromDateTimeLocalInput, localDateOf, nowISO, toDateTimeLocalInput } from '../lib/date';
import type { RestraintLog } from '../db/types';
import { Chip, TopBar } from '../components/ui';
import { RestraintNotice } from './Restraint';

export default function RestraintEditRoute() {
  const { id = 'new' } = useParams();
  const log = useLiveQuery(async () => (id === 'new' ? null : ((await db.restraintLogs.get(id)) ?? null)), [id]);
  if (log === undefined) return null;
  if (id !== 'new' && !log) return <p className="empty">記録が見つかりません。</p>;
  return <RestraintEdit key={id} log={log} />;
}

function RestraintEdit({ log }: { log: RestraintLog | null }) {
  const { person, places, place, me, userId, members } = useApp();
  const nav = useNavigate();
  const now = nowISO();
  const [f, setF] = useState<RestraintInput>(() =>
    log
      ? { ...log }
      : {
          personId: person?.id ?? '',
          startedAt: now,
          endedAt: now,
          localDate: localDateOf(now),
          placeName: place?.name ?? null,
          activity: '',
          situation: '',
          checks: { urgency: false, nonAlternative: false, temporary: false },
          urgency: '',
          nonAlternative: '',
          temporary: '',
          performer: '',
          decider: '',
          method: '',
          personState: '',
          familyReported: false,
          familyReportNote: '',
          review: '',
        },
  );
  const [saving, setSaving] = useState(false);
  const history = useLiveQuery(
    async () => (log ? (await db.auditLogs.where('entityId').equals(log.id).toArray()).sort((a, b) => b.at.localeCompare(a.at)) : []),
    [log?.id],
  );
  if (!person || !userId) return null;
  if (!me) return null; // 役割の読み込みを待つ（待たずに判定すると、権限なしで戻してしまう）
  const editable = log ? canEditRestraint(me?.role, log, userId) : canRecordRestraint(me?.role);
  if (!log && !editable) return <Navigate to="/restraint" replace />;
  const set = <K extends keyof RestraintInput>(k: K, v: RestraintInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const minutes = Math.round((new Date(f.endedAt).getTime() - new Date(f.startedAt).getTime()) / 60000);
  const allChecked = f.checks.urgency && f.checks.nonAlternative && f.checks.temporary;
  const valid = minutes >= 0 && !!f.situation.trim();
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';

  async function save() {
    if (!userId || !valid) return;
    if (!log && !window.confirm('保存すると、この記録は消せません。保存しますか？')) return;
    setSaving(true);
    await saveRestraint(log?.id ?? null, { ...f, localDate: localDateOf(f.startedAt) }, userId);
    nav('/restraint', { replace: true });
  }

  const req = (key: 'urgency' | 'nonAlternative' | 'temporary', title: string, q: string) => (
    <div className="stack requirement">
      <div className="row row--between">
        <strong>{title}</strong>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={f.checks[key]} disabled={!editable} onChange={(e) => set('checks', { ...f.checks, [key]: e.target.checked })} style={{ width: 22, height: 22 }} />
          <span className="label">確認した</span>
        </label>
      </div>
      <span className="help">{q}</span>
      <textarea className="input textarea" value={f[key]} disabled={!editable} onChange={(e) => set(key, e.target.value)} aria-label={`${title}の根拠`} placeholder="根拠を書く" />
    </div>
  );

  return (
    <div className="page page--no-nav">
      <TopBar title={log ? '身体拘束の記録' : '身体拘束を記録する'} sub={log ? `${formatDateTimeJa(log.createdAt)} に ${nameOf(log.recorderId)} が記録` : '緊急やむを得ない場合だけ'} back="/restraint" />
      <div className="section"><RestraintNotice /></div>

      <div className="section">
        <div className="card stack">
          <span className="label">いつ・どこで・何が起きたか</span>
          <div className="stack">
            <label className="field">
              始めた時刻
              <input type="datetime-local" value={toDateTimeLocalInput(f.startedAt)} disabled={!editable} onChange={(e) => e.target.value && set('startedAt', fromDateTimeLocalInput(e.target.value))} />
            </label>
            <label className="field">
              やめた時刻
              <input type="datetime-local" value={toDateTimeLocalInput(f.endedAt)} disabled={!editable} onChange={(e) => e.target.value && set('endedAt', fromDateTimeLocalInput(e.target.value))} />
            </label>
          </div>
          <span className="muted">{minutes >= 0 ? `${minutes}分間` : 'やめた時刻が始めた時刻より前になっています'}</span>
          <div className="chips">
            {places.map((p) => <Chip key={p.id} on={f.placeName === p.name} onClick={editable ? () => set('placeName', p.name) : undefined}>{p.name}</Chip>)}
            <Chip on={!f.placeName} onClick={editable ? () => set('placeName', null) : undefined}>場所なし</Chip>
          </div>
          <label className="field">
            活動
            <input value={f.activity} disabled={!editable} onChange={(e) => set('activity', e.target.value)} placeholder="例: 個別課題" />
          </label>
          <label className="field">
            状況（必須）
            <textarea value={f.situation} disabled={!editable} onChange={(e) => set('situation', e.target.value)} placeholder="例: 頭たたきが止まらず（強度3）、額から出血。声かけと休憩カードでは収まらなかった" />
          </label>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">3つの要件（すべて必要）</span>
          {req('urgency', '切迫性', '本人や他の人の命・体が危険にさらされる可能性が著しく高かったか')}
          {req('nonAlternative', '非代替性', '拘束のほかに方法がなかったか（何を試したか）')}
          {req('temporary', '一時性', '必要な最小限の時間だったか')}
          {!allChecked && <p className="notice-inline">3つの要件がそろっていない場合も、行ったことはそのまま記録します。チームで必ず検討してください。</p>}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">誰が行い、誰が判断したか</span>
          <div className="grid-2">
            <label className="field">実施者<input value={f.performer} disabled={!editable} onChange={(e) => set('performer', e.target.value)} /></label>
            <label className="field">判断者（組織として）<input value={f.decider} disabled={!editable} onChange={(e) => set('decider', e.target.value)} /></label>
          </div>
          <label className="field">
            方法
            <textarea value={f.method} disabled={!editable} onChange={(e) => set('method', e.target.value)} placeholder="例: 両手首を軽く押さえた" />
          </label>
          <label className="field">
            本人の状態
            <textarea value={f.personState} disabled={!editable} onChange={(e) => set('personState', e.target.value)} placeholder="例: 終わったあと額の手当て。10:55 には落ち着いて水を飲めた" />
          </label>
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">家族への報告</span>
          <div className="chips">
            <Chip on={f.familyReported} onClick={editable ? () => set('familyReported', true) : undefined}>報告した</Chip>
            <Chip on={!f.familyReported} onClick={editable ? () => set('familyReported', false) : undefined}>まだ</Chip>
          </div>
          <input className="input" value={f.familyReportNote} disabled={!editable} onChange={(e) => set('familyReportNote', e.target.value)} placeholder="例: 母・電話 11:30" aria-label="報告のメモ" />
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <span className="label">あとの組織での検討（記録したあとに追記）</span>
          <textarea className="input textarea" value={f.review} disabled={!editable} onChange={(e) => set('review', e.target.value)} placeholder="例: 課題の量を見直す。休憩カードを机の上に常に置く" aria-label="あとの組織での検討" />
        </div>
      </div>

      <div className="section stack">
        {editable && <button type="button" className="btn btn--primary btn--block" disabled={!valid || saving} onClick={save}>{log ? '修正を保存する' : '保存する'}</button>}
        <p className="help">保存すると記録者と日時が付き、修正の履歴が残ります。消すことはできません。この記録は AI に送りません。AI が身体拘束を方法として提案することもありません。</p>
      </div>

      {log && (history ?? []).length > 0 && (
        <div className="section">
          <div className="card stack">
            <span className="label">修正の履歴</span>
            {history!.map((h) => (
              <span key={h.id} className="muted">{formatDateTimeJa(h.at)} ・ {nameOf(h.actorId)} が{h.action === 'create' ? '記録' : '修正'}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
