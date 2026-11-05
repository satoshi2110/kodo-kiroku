/** CSV エクスポート（UTF-8 BOM 付き。Excel で文字化けしないように） */
import type { ABCDetail, Behavior, Event, NoEventDay, Person, Session, TeamMember } from '../db/types';
import { BEHAVIOR_KIND_LABEL, FUNCTION_LABEL } from '../db/types';
import { formatDateTimeJa } from './date';

function esc(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function eventsCSV(
  person: Person,
  behaviors: Behavior[],
  members: TeamMember[],
  events: Event[],
  abc: ABCDetail[],
  includeDeleted: boolean,
): string {
  const bmap = new Map(behaviors.map((b) => [b.id, b]));
  const mmap = new Map(members.map((m) => [m.id, m]));
  const amap = new Map(abc.filter((a) => !a.deletedAt).map((a) => [a.eventId, a]));
  const header = [
    '対象者', '日付', '時刻', '日時(ISO)', '行動', '種類', '回数', '持続時間(秒)', '強度',
    '場所', '活動', '関わった支援者', 'メモ', '記録者',
    'A:先行事象', 'A:自由記述', 'C:結果', 'C:自由記述', '状況要因', '状況要因:自由記述', '記録者の機能仮説',
    '削除日時', '記録ID',
  ];
  const rows: unknown[][] = [header];
  const list = events
    .filter((e) => includeDeleted || !e.deletedAt)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const e of list) {
    const b = bmap.get(e.behaviorId);
    const a = amap.get(e.id);
    rows.push([
      person.displayName,
      e.localDate,
      formatDateTimeJa(e.occurredAt).split(' ')[1],
      e.occurredAt,
      b?.name ?? '',
      b ? BEHAVIOR_KIND_LABEL[b.kind] : '',
      e.count,
      e.durationSec ?? '',
      e.intensity ?? '',
      e.place ?? '',
      e.activity ?? '',
      e.staff ?? '',
      e.memo ?? '',
      mmap.get(e.recorderId)?.displayName ?? '',
      a?.antecedents.join('; ') ?? '',
      a?.antecedentNote ?? '',
      a?.consequences.join('; ') ?? '',
      a?.consequenceNote ?? '',
      a?.settingFactors.join('; ') ?? '',
      a?.settingFactorNote ?? '',
      a?.hypothesizedFunction ? FUNCTION_LABEL[a.hypothesizedFunction] : '',
      e.deletedAt ?? '',
      e.id,
    ]);
  }
  return toCSV(rows);
}

export function sessionsCSV(person: Person, members: TeamMember[], sessions: Session[]): string {
  const mmap = new Map(members.map((m) => [m.id, m]));
  const rows: unknown[][] = [['対象者', '開始', '終了', '時間(時間)', '場所', '記録者', 'セッションID']];
  for (const s of sessions.filter((s) => !s.deletedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const h = s.endedAt ? (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 3600000 : '';
    rows.push([person.displayName, s.startedAt, s.endedAt ?? '', h === '' ? '' : h.toFixed(2), s.place ?? '', mmap.get(s.recorderId)?.displayName ?? '', s.id]);
  }
  return toCSV(rows);
}

export function noEventDaysCSV(person: Person, behaviors: Behavior[], members: TeamMember[], days: NoEventDay[]): string {
  const bmap = new Map(behaviors.map((b) => [b.id, b]));
  const mmap = new Map(members.map((m) => [m.id, m]));
  const rows: unknown[][] = [['対象者', '日付', '行動', '記録者']];
  for (const n of days.filter((n) => !n.deletedAt).sort((a, b) => a.localDate.localeCompare(b.localDate))) {
    rows.push([person.displayName, n.localDate, bmap.get(n.behaviorId)?.name ?? '', mmap.get(n.recorderId)?.displayName ?? '']);
  }
  return toCSV(rows);
}
