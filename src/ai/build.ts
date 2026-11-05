/**
 * 端末内の記録から、AI に送る入力を作る（6.5、9章）。
 * 仮名化: 対象者の呼び名 →「対象者」、支援者の呼び名 →「支援者A・B…」、場所の名前 →「場所A・B…」。
 * 関わった人は所属だけを送る。写真は送らない。期間は直近4週間まで。
 */
import { db } from '../db/db';
import { addDays, parseLocalDate, toLocalDate } from '../lib/date';
import { AFFILIATION_LABEL, type Behavior, type Person, type TeamMember } from '../db/types';
import { MAX_DAYS, MAX_RECORDS, type AbcRecordInput, type AnalysisInput } from './schema';

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
const letter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');

export async function buildAnalysisInput(person: Person, behavior: Behavior, members: TeamMember[]): Promise<AnalysisInput> {
  const to = toLocalDate();
  const from = addDays(to, -(MAX_DAYS - 1));
  const [events, details, options] = await Promise.all([
    db.events.where('personId').equals(person.id).filter((e) => !e.deletedAt && e.behaviorId === behavior.id && e.localDate >= from && e.localDate <= to).toArray(),
    db.abcDetails.where('personId').equals(person.id).filter((d) => !d.deletedAt).toArray(),
    db.choiceOptions.where('personId').equals(person.id).toArray(),
  ]);
  const optName = new Map(options.map((o) => [o.id, o.name]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const places = [...new Set(events.map((e) => e.placeName).filter((p): p is string => !!p))];
  const mask = makeMasker(person, members, places);

  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.localDate, (counts.get(e.localDate) ?? 0) + e.count);
  const dailyCounts = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

  const abcRecords: AbcRecordInput[] = details
    .flatMap((d) => {
      const e = eventById.get(d.eventId);
      return e ? [{ d, e }] : [];
    })
    .sort((a, b) => a.e.occurredAt.localeCompare(b.e.occurredAt))
    .slice(-MAX_RECORDS)
    .map(({ d, e }) => ({
      date: e.localDate,
      weekday: WEEKDAY[parseLocalDate(e.localDate).getDay()],
      hour: new Date(e.occurredAt).getHours(),
      antecedents: d.antecedentIds.map((id) => mask(optName.get(id) ?? '')).filter(Boolean),
      antecedentNote: mask(d.antecedentNote),
      consequences: d.consequenceIds.map((id) => mask(optName.get(id) ?? '')).filter(Boolean),
      consequenceNote: mask(d.consequenceNote),
      settingEvents: d.settingIds.map((id) => mask(optName.get(id) ?? '')).filter(Boolean),
      place: e.placeName ? `場所${letter(places.indexOf(e.placeName))}` : '',
      activity: mask(e.activity ?? ''),
      involvedAffiliations: [...new Set(d.involvedMemberIds.map((id) => memberById.get(id)).filter(Boolean).map((m) => AFFILIATION_LABEL[m!.affiliation]))],
      intensity: e.intensity,
      recorderGuess: d.funcGuess,
    }));

  return {
    behavior: {
      name: mask(behavior.name),
      definition: mask(behavior.definition),
      intensityCriteria: behavior.intensity?.criteria.map(mask) ?? [],
    },
    period: { from, to },
    dailyCounts,
    abcRecords,
  };
}

/** 名前を置きかえる関数を作る。長い名前から先に置きかえる（「Aさん」と「A」のような重なりを避ける） */
export function makeMasker(person: Person, members: TeamMember[], places: string[]) {
  const pairs = ([
    [person.displayName, '対象者'],
    ...members.map((m, i): [string, string] => [m.displayName, `支援者${letter(i)}`]),
    ...places.map((p, i): [string, string] => [p, `場所${letter(i)}`]),
  ] as [string, string][]).filter(([name]) => name.trim().length > 0);
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (text: string) => pairs.reduce((t, [name, alias]) => t.split(name).join(alias), text);
}
