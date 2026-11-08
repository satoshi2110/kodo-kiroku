/**
 * 端末内の記録から、AI に送る入力を作る（6.5、9章）。
 * 仮名化: 対象者の呼び名 →「対象者」、通っているところ →「通っているところ」、支援者の呼び名 →「支援者A・B…」、場所の名前 →「場所A・B…」。
 * 場所は、登録した場所すべてと記録に残る場所の名前を置きかえる（メモに別の場所の名前が書かれていても送らない）。
 * 関わった人は所属だけを送る。写真は送らない。期間は直近4週間まで。
 */
import { db } from '../db/db';
import { addDays, parseLocalDate, toLocalDate } from '../lib/date';
import { AFFILIATION_LABEL, type Behavior, type Person, type TeamMember } from '../db/types';
import { MAX_DAYS, MAX_RECORDS, type AbcRecordInput, type AnalysisInput, type StepsInput } from './schema';

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
  // 抜けた人が書いた記録も、所属が分かるように、抜けた人も含めて引く
  const allMembers = await membersForMask(person.id);
  const memberById = new Map([...allMembers, ...members].map((m) => [m.id, m]));

  const places = await placeNamesFor(person.id, events.map((e) => e.placeName));
  const mask = makeMasker(person, allMembers, places);

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
      // 支援者メモ（6.5「支援者メモ（仮名化済み）」）。入力の大きさを抑えるため1件200文字まで
      note: mask(d.note ?? '').slice(0, 200),
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

/**
 * 置きかえる場所の名前の一覧。登録した場所（隠した場所も）を作った順に並べ、そのあとに記録だけに残る名前を足す。
 * 同じ対象者なら毎回同じ順になるので、分析と提案で「場所A」が同じ場所を指す。
 */
export async function placeNamesFor(personId: string, extra: (string | null | undefined)[] = []): Promise<string[]> {
  const registered = await db.places.where('personId').equals(personId).toArray();
  registered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...new Set([...registered.map((p) => p.name), ...extra].filter((p): p is string => !!p && p.trim().length > 0))];
}

/**
 * 置きかえる支援者の名前。チームを抜けた人も入れる（前に書いたメモに名前が残っていることがあるため。点検 2026-11-08）。
 * 並びは参加した順にして、同じ人がいつも同じ記号になるようにする
 */
export async function membersForMask(personId: string): Promise<TeamMember[]> {
  const all = await db.teamMembers.where('personId').equals(personId).toArray();
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 名前を置きかえる関数を作る。長い名前から先に置きかえる（「Aさん」と「A」のような重なりを避ける） */
export function makeMasker(person: Person, members: TeamMember[], places: string[]) {
  const pairs = ([
    [person.displayName, '対象者'],
    [person.belongs ?? '', '通っているところ'],
    ...members.map((m, i): [string, string] => [m.displayName, `支援者${letter(i)}`]),
    ...places.map((p, i): [string, string] => [p, `場所${letter(i)}`]),
  ] as [string, string][]).filter(([name]) => name.trim().length > 0);
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (text: string) => pairs.reduce((t, [name, alias]) => t.split(name).join(alias), text);
}

/**
 * 手順の下書き（6.15）に送る入力。行動の名前・定義・種類、代替行動なら元の問題行動の名前と機能、
 * ほかの望ましい行動・代替行動の名前だけ（仮名化済み）。対象者の特性メモと「苦手なこと・気をつけること」は読まない（決定128）
 */
export async function buildStepsInput(person: Person, behavior: Behavior, behaviors: Behavior[]): Promise<StepsInput> {
  const mask = makeMasker(person, await membersForMask(person.id), await placeNamesFor(person.id));
  const original = behavior.kind === 'alternative' && behavior.replacesBehaviorId ? behaviors.find((x) => x.id === behavior.replacesBehaviorId) : undefined;
  return {
    behavior: { name: mask(behavior.name), definition: mask(behavior.definition), kind: behavior.kind === 'alternative' ? 'alternative' : 'desirable' },
    replaces: original ? { name: mask(original.name), func: original.func ?? behavior.func ?? null } : null,
    existingBehaviors: behaviors
      .filter((x) => x.id !== behavior.id && x.kind !== 'problem' && !x.deletedAt)
      .slice(0, 50)
      .map((x) => mask(x.name)),
  };
}
