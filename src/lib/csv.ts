/**
 * CSV の書き出し（6.12）。Excel で文字化けしないように UTF-8 の BOM を付ける。
 * 記録とABC（1行が1回の記録）・インターバル／時間サンプリング・睡眠・観察時間（推定）の4種類。写真と場所の座標は入れない。
 */
import { db } from '../db/db';
import { addDays, formatDateJa, formatTime } from './date';
import { sleepMinutes } from './sleep';
import { loadRecordSet, observedHours, observedSpans } from './series';
import { AFFILIATION_LABEL, FUNCTION_LABEL, KIND_LABEL, METHOD_LABEL, type Person } from '../db/types';

export type CsvKind = 'records' | 'observations' | 'sleep' | 'sessions';

function esc(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const toCSV = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

export async function buildCsv(person: Person, kind: CsvKind): Promise<string> {
  const pid = person.id;
  const [behaviors, members, options] = await Promise.all([
    db.behaviors.where('personId').equals(pid).toArray(),
    db.teamMembers.where('personId').equals(pid).toArray(),
    db.choiceOptions.where('personId').equals(pid).toArray(),
  ]);
  const bName = new Map(behaviors.map((b) => [b.id, b]));
  const byUser = new Map(members.map((m) => [m.userId, m.displayName]));
  const byMember = new Map(members.map((m) => [m.id, m]));
  const opt = (ids: string[]) => ids.map((id) => options.find((o) => o.id === id)?.name ?? '').filter(Boolean).join('、');

  if (kind === 'records') {
    const [events, details] = await Promise.all([
      db.events.where('personId').equals(pid).filter((e) => !e.deletedAt).toArray(),
      db.abcDetails.where('personId').equals(pid).filter((d) => !d.deletedAt).toArray(),
    ]);
    const abc = new Map(details.map((d) => [d.eventId, d]));
    const rows = [...events]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((e) => {
        const b = bName.get(e.behaviorId);
        const d = abc.get(e.id);
        return [
          e.localDate,
          formatTime(e.occurredAt),
          b?.name ?? '',
          b ? KIND_LABEL[b.kind] : '',
          b ? METHOD_LABEL[b.method] : '',
          e.count,
          e.durationSec,
          e.latencySec,
          e.intensity,
          e.placeName,
          e.activity,
          byUser.get(e.recorderId) ?? '',
          d ? opt(d.antecedentIds) : '',
          d?.antecedentNote ?? '',
          d ? opt(d.consequenceIds) : '',
          d?.consequenceNote ?? '',
          d ? opt(d.settingIds) : '',
          d ? [...new Set(d.involvedMemberIds.map((id) => byMember.get(id)).filter(Boolean).map((m) => `${m!.displayName}（${AFFILIATION_LABEL[m!.affiliation]}）`))].join('、') : '',
          d?.funcGuess ? FUNCTION_LABEL[d.funcGuess] : '',
          d?.note ?? '',
        ];
      });
    return toCSV([
      ['日付', '時刻', '行動', '種類', '測り方', '回数', '持続時間（秒）', '待ち時間（秒）', '強度', '場所', '活動', '記録者', 'A 直前のこと', 'A メモ', 'C その後', 'C メモ', '状況要因', '関わった人', '記録者の見立て', 'メモ'],
      ...rows,
    ]);
  }

  if (kind === 'observations') {
    const list = await db.observations.where('personId').equals(pid).filter((o) => !o.deletedAt).toArray();
    const rows = [...list]
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((o) => {
        const yes = o.results.filter((r) => r === 'yes').length;
        const no = o.results.filter((r) => r === 'no').length;
        const missed = o.results.filter((r) => r === 'missed').length;
        return [
          o.localDate,
          formatTime(o.startedAt),
          o.endedAt ? formatTime(o.endedAt) : '',
          bName.get(o.behaviorId)?.name ?? '',
          METHOD_LABEL[o.method],
          o.intervalSec,
          yes,
          no,
          missed,
          yes + no ? Math.round((yes / (yes + no)) * 100) : '',
          o.results.map((r) => (r === 'yes' ? '○' : r === 'no' ? '×' : '－')).join(''),
          byUser.get(o.recorderId) ?? '',
        ];
      });
    return toCSV([
      ['日付', '開始', '終了', '行動', '測り方', '区間（秒）', '起きた', '起きなかった', '未観察', '起きた割合（%）', '区間ごとの結果', '記録者'],
      ...rows,
    ]);
  }

  if (kind === 'sessions') {
    // 観察時間（6.3.3 の推定）: 1行が「その日・記録した人」。最後の列は、何人かの時間帯を重ねて合わせたその日の観察時間
    const rs = await loadRecordSet(pid);
    const rows = [...rs.recordedDays].sort().flatMap((d) => {
      const h = observedHours(d, rs);
      return observedSpans(d, rs).map((x) => [
        d,
        byUser.get(x.userId) ?? '',
        clock(x.start),
        clock(x.end),
        x.placeName,
        x.method === 'template' ? 'いつもの時間' : '記録の最初から最後',
        h == null ? '' : Math.round(h * 10) / 10,
      ]);
    });
    return toCSV([['日付', '記録者', '開始', '終了', '場所', '推定のしかた', 'その日の観察時間（時間）'], ...rows]);
  }

  const logs = await db.sleepLogs.where('personId').equals(pid).filter((l) => !l.deletedAt).toArray();
  const rows = [...logs]
    .sort((a, b) => a.wakeDate.localeCompare(b.wakeDate))
    .map((l) => [formatDateJa(addDays(l.wakeDate, -1), false) + 'の夜', l.wakeDate, l.bedTime, l.wakeTime, sleepMinutes(l), l.wakings, l.note, byUser.get(l.recorderId) ?? '']);
  return toCSV([['夜', '起きた日', '寝た時刻', '起きた時刻', '寝ていた時間（分）', '夜中に起きた回数', 'メモ', '入力した人'], ...rows]);
}

export function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
