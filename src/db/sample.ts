/**
 * お試し用のサンプル（発注者回答 2026-11-05）。審査やお試しで、すぐにグラフ・ABC分析・AI分析を見られるようにする。
 * 架空の対象者「サンプルさん」と、3週間分の記録・支援計画（2回の実施）・支援会議メモを端末内にだけ作る（身体拘束の記録は作らない）。実在の人のデータではない。画面には「サンプル」と表示する。
 */
import { db } from './db';
import { newId } from '../lib/id';
import { addDays, toLocalDate, toLocalISO, parseLocalDate } from '../lib/date';
import { ensureChoiceOptions, getDevice, saveDevice } from './repo';
import { diffFields } from './phase2';
import { loadRecordSet } from '../lib/series';
import { takeSnapshots } from '../lib/snapshot';
import { CONSENT_TEXT_VERSION, type AbcDetail, type Behavior, type ChoiceOption, type Event, type IntervalResult, type MeetingNote, type Observation, type PlanChange, type PlanContent, type PlanSignoff, type Proposal, type BehaviorRevision, type SupportPlan, type Comment, type SleepLog, type Person, type Place, type Reinforcer, type TeamMember } from './types';

const DAYS = 21;

export async function createSampleTeam(): Promise<void> {
  const dev = await getDevice();
  const t = toLocalISO();
  const rec = () => ({ id: newId(), createdAt: t, updatedAt: t, deletedAt: null });
  const userId = dev.userId ?? newId();

  const person: Person = { ...rec(), displayName: 'サンプルさん', birthMonth: null, notes: '', isSample: true };
  const member = (displayName: string, affiliation: TeamMember['affiliation'], role: TeamMember['role'], uid: string): TeamMember => ({
    ...rec(),
    personId: person.id,
    userId: uid,
    displayName,
    affiliation,
    role,
    familyMark: affiliation === 'family',
    sleepInputAllowed: false,
  });
  const me = member('あなた（見本）', 'family', 'admin', userId);
  const staff = member('職員A（見本）', 'facility', 'leader', newId());
  const teacher = member('先生B（見本）', 'school', 'supporter', newId());

  const behavior = (b: Omit<Behavior, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'personId' | 'hiddenAt' | 'examples' | 'nonExamples' | 'intervalSec' | 'samplingMin'>): Behavior => ({
    ...rec(),
    createdAt: toLocalISO(parseLocalDate(addDays(toLocalDate(), -DAYS))), // 見本の記録は DAYS 日前から（自動 0 は作った日から。決定111）
    personId: person.id,
    examples: '',
    nonExamples: '',
    intervalSec: null,
    samplingMin: null,
    hiddenAt: null,
    ...b,
  });
  const hit = behavior({
    kind: 'problem',
    name: '頭たたき',
    definition: '手のひらやこぶしで自分の頭をたたく',
    method: 'frequency',
    intensity: { levels: 3, criteria: ['1〜2回で止まる・赤みなし', '3回以上続く・声かけで止まる・赤みあり', '声かけで止まらない・腫れや出血・安全確保が必要'] },
    replacesBehaviorId: null,
    func: null,
    sortOrder: 0,
  });
  const card = behavior({
    kind: 'alternative',
    name: '休憩カードを渡す',
    definition: '「やすみ」のカードを大人に渡す',
    method: 'frequency',
    intensity: null,
    replacesBehaviorId: hit.id,
    func: 'escape',
    sortOrder: 1,
  });
  const dress = behavior({
    kind: 'desirable',
    name: '自分から着替える',
    definition: '声かけなしで着替えを始める',
    method: 'frequency',
    intensity: null,
    replacesBehaviorId: null,
    func: null,
    sortOrder: 2,
  });

  const voice: Behavior = {
    ...behavior({
      kind: 'problem',
      name: '大きな声を出す',
      definition: '会話の声より明らかに大きな声を1秒以上出す',
      method: 'interval',
      intensity: null,
      replacesBehaviorId: null,
      func: null,
      sortOrder: 3,
    }),
    intervalSec: 10,
  };

  // 好きなもの（6.14）。写真はなし。1つは「以前好きだったもの」になるよう、更新を1か月前にする
  const today0 = toLocalDate();
  const reinf = (name: string, category: Reinforcer['category'], level: number, usage: string, daysAgo: number, by: string): Reinforcer => {
    const at = toLocalISO(new Date(parseLocalDate(addDays(today0, -daysAgo)).getTime() + 18 * 3600_000));
    return { ...rec(), createdAt: at, updatedAt: at, personId: person.id, name, category, level, usage, hasPhoto: false, lastUsedAt: null, updatedBy: by, hiddenAt: null };
  };
  const reinforcers = [
    reinf('電車の図鑑（青い表紙）', 'thing', 5, '課題が終わったら5分見る。取り上げると大声になるので、終わりはタイマーで予告する。', 3, userId),
    reinf('トランポリン', 'activity', 4, '休憩カードを出せたときの休憩に使う。午前の方が喜ぶ。', 1, staff.userId),
    reinf('ぶどうのグミ', 'food', 3, '1日2個まで（家庭と施設で合わせて）。', 8, userId),
    reinf('シャボン玉', 'activity', 2, '外で。風の強い日は目に入るので避ける。', 30, teacher.userId),
  ];

  // 場所（6.3.3）。見本なので位置は持たず、手で選ぶ場所にする
  const place = (name: string, kind: Place['kind'], by: string): Place => ({ ...rec(), personId: person.id, name, kind, lat: null, lng: null, radiusM: 100, createdBy: by, hiddenAt: null });
  const places = [place('自宅', 'home', userId), place('ひまわり園', 'facility', staff.userId), place('さくら特別支援学校', 'school', teacher.userId)];

  await db.transaction('rw', [db.users, db.persons, db.teamMembers, db.behaviors, db.consents, db.device, db.reinforcers, db.places], async () => {
    await db.reinforcers.bulkAdd(reinforcers);
    await db.places.bulkAdd(places);
    if (!dev.userId) await db.users.add({ id: userId, createdAt: t, updatedAt: t, deletedAt: null, displayName: 'あなた（見本）' });
    await db.persons.add(person);
    await db.teamMembers.bulkAdd([me, staff, teacher]);
    await db.behaviors.bulkAdd([hit, card, dress, voice]);
    await db.consents.add({ ...rec(), personId: person.id, userId, kind: 'terms_privacy_sensitive', textVersion: CONSENT_TEXT_VERSION, revokedAt: null });
    await saveDevice({ userId, currentPersonId: person.id });
  });

  await ensureChoiceOptions(person.id, userId);
  const options = await db.choiceOptions.where('personId').equals(person.id).toArray();
  const opt = (name: string) => options.find((o: ChoiceOption) => o.name === name)!.id;

  // 決まった並びの「ゆらぎ」（毎回同じサンプルになるように乱数は使わない）
  const wave = (i: number, k: number) => Math.abs(Math.sin(i * 1.7 + k * 0.9));
  const today = toLocalDate();
  const events: Event[] = [];
  const observations: Observation[] = [];
  const sleeps: SleepLog[] = [];
  const details: AbcDetail[] = [];
  const at = (date: string, hour: number, min: number) => {
    const d = parseLocalDate(date);
    d.setHours(hour, min, 0, 0);
    return toLocalISO(d);
  };
  const ev = (b: Behavior, date: string, hour: number, min: number, extra: Partial<Event> = {}): Event => {
    const occurredAt = at(date, hour, min);
    return {
      ...rec(),
      personId: person.id,
      behaviorId: b.id,
      occurredAt,
      localDate: date,
      count: 1,
      durationSec: null,
      latencySec: null,
      intensity: null,
      // 平日の 9〜16時は施設、それ以外は自宅（見本）
      placeName: parseLocalDate(date).getDay() % 6 !== 0 && hour >= 9 && hour < 16 ? 'ひまわり園' : '自宅',
      activity: null,
      recorderId: userId,
      backfilled: false,
      ...extra,
    };
  };

  // 昨夜（今朝起きた分）の睡眠も入れて、ホームの睡眠カードがすぐ見えるようにする
  sleeps.push({ ...rec(), personId: person.id, wakeDate: today, bedTime: '21:15', wakeTime: '06:35', wakings: 0, note: '', recorderId: userId });

  for (let i = DAYS; i >= 1; i--) {
    const date = addDays(today, -i);
    const day = parseLocalDate(date).getDay();
    const weekday = day >= 1 && day <= 5;
    const shortSleep = i % 5 === 2;
    // 頭たたき: はじめは多く、休憩カードが増えるにつれて少しずつ減る
    const hits = Math.max(1, Math.round(7 - (DAYS - i) * 0.18 + wave(i, 1) * 2 + (shortSleep ? 2 : 0) - (weekday ? 0 : 2)));
    for (let k = 0; k < hits; k++) {
      const escapeCase = weekday && k % 4 !== 3; // 平日の課題の時間に多い
      const hour = escapeCase ? 10 + (k % 2) : 15 + (k % 3);
      const e = ev(hit, date, hour, (k * 13 + i * 7) % 60, {
        intensity: Math.min(3, 1 + Math.round(wave(i, k) * 1.4) + (shortSleep && k === 0 ? 1 : 0)),
        activity: escapeCase ? '個別課題' : k % 2 ? '自由時間' : '食事',
      });
      events.push(e);
      // ABC記録は2件に1件くらい
      if ((k + i) % 2 === 0) {
        const who = escapeCase ? (weekday && i % 3 === 0 ? teacher : staff) : me;
        details.push({
          ...rec(),
          personId: person.id,
          eventId: e.id,
          antecedentIds: escapeCase ? [opt('課題提示')] : k % 2 ? [opt('注目がなくなった')] : [opt('待ち時間')],
          antecedentNote: '',
          consequenceIds: escapeCase ? [opt(k % 3 === 0 ? '注目した（声かけ・制止）' : '課題を取り除いた')] : k % 2 ? [opt('注目した（声かけ・制止）')] : [opt('活動を中止した')],
          consequenceNote: '',
          settingIds: shortSleep ? [opt('睡眠不足')] : [],
          involvedMemberIds: [who.id],
          funcGuess: escapeCase ? (k % 3 === 0 ? null : 'escape') : k % 2 ? 'attention' : null,
          note: '',
          recorderId: userId,
        });
      }
    }
    // 休憩カード: 少しずつ増える
    const cards = Math.max(0, Math.round((DAYS - i) * 0.25 + wave(i, 3) - (weekday ? 0 : 1)));
    for (let k = 0; k < cards; k++) events.push(ev(card, date, 10 + k, (k * 17) % 60, { activity: '個別課題' }));
    if (i % 2 === 0 || i < 6) events.push(ev(dress, date, 7, 30));
    // 睡眠: ふだんは 21時台に寝て 6時半ごろ起きる。睡眠不足の日は夜中まで起きていた
    const bedMin = shortSleep ? 23 * 60 + 40 : 21 * 60 + Math.round(wave(i, 5) * 6) * 5;
    sleeps.push({
      ...rec(),
      personId: person.id,
      wakeDate: date,
      bedTime: `${String(Math.floor(bedMin / 60)).padStart(2, '0')}:${String(bedMin % 60).padStart(2, '0')}`,
      wakeTime: shortSleep ? '05:30' : `06:${String(30 + Math.round(wave(i, 6) * 3) * 5).padStart(2, '0')}`,
      wakings: shortSleep ? 2 : i % 4 === 0 ? 1 : 0,
      note: shortSleep ? '夜中に何度か起きた' : '',
      recorderId: userId,
    });
    // 大きな声: 平日の個別課題で 5分（10秒 × 30区間）の観察。起きた区間の割合が少しずつ下がる
    if (weekday) {
      const rate = 0.45 - (DAYS - i) * 0.012 + (shortSleep ? 0.15 : 0);
      const results: IntervalResult[] = Array.from({ length: 30 }, (_, k) => (k === 17 ? 'missed' : wave(i, k) < rate ? 'yes' : 'no'));
      const startedAt = at(date, 10, 30);
      observations.push({
        ...rec(),
        personId: person.id,
        behaviorId: voice.id,
        method: 'interval',
        intervalSec: 10,
        startedAt,
        endedAt: at(date, 10, 35),
        localDate: date,
        results,
        recorderId: userId,
      });
    }
  }

  await db.transaction('rw', [db.events, db.abcDetails, db.observations, db.sleepLogs], async () => {
    await db.events.bulkAdd(events);
    await db.sleepLogs.bulkAdd(sleeps);
    await db.observations.bulkAdd(observations);
    await db.abcDetails.bulkAdd(details);
  });

  // 支援計画（6.7）: 14日前に支援開始、5日前の支援会議で先行子の工夫を変えた。グラフにベースライン・支援開始・計画の変更の線が入る
  const startDate = addDays(today, -14);
  const changeDate = addDays(today, -5);
  const plan1: PlanContent = {
    problemBehaviorId: hit.id,
    alternativeBehaviorId: card.id,
    func: 'escape',
    goal: '個別課題の時間に、頭をたたく代わりに休憩カードを渡して休めるようになる',
    scene: '施設',
    criteria: [
      { behaviorId: hit.id, op: 'lte', value: 3, note: '' },
      { behaviorId: card.id, op: 'gte', value: 3, note: '' },
    ],
    antecedent: '課題は短く区切り、残りの量を見せる',
    reinforcement: 'カードを渡したら、すぐに2分休める',
    prompting: '課題の前にカードを机に置き、指さしで教える。だんだん指さしを減らす',
    crisis: '頭を守るためクッションを間に入れ、少し離れて見守る。叱らない',
    reviewDate: addDays(today, 23),
    owner: '職員A（見本）',
  };
  const plan2: PlanContent = { ...plan1, scene: '施設・学校', antecedent: '午前の課題の量を2つ減らし、終わりの合図を写真カードで見せる。学校でも同じカードを使う' };
  const stamp = (date: string, hour: number) => at(date, hour, 0);
  const planRec: SupportPlan = { ...rec(), createdAt: stamp(startDate, 17), personId: person.id, content: plan2, activeContent: plan2, activeSince: changeDate };
  const change = (c: Omit<PlanChange, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'personId' | 'planId' | 'closedBy' | 'fields'>, createdAt: string): PlanChange => ({
    ...rec(),
    createdAt,
    updatedAt: createdAt,
    personId: person.id,
    planId: planRec.id,
    closedBy: null,
    fields: diffFields(c.before, c.after),
    ...c,
  });
  const ch1 = change({ savedBy: staff.userId, reason: '支援を始める', before: null, after: plan1, signerMemberIds: [me.id, staff.id, teacher.id], status: 'past', activeSince: startDate }, stamp(addDays(startDate, -1), 17));
  const ch2 = change({ savedBy: staff.userId, reason: '支援会議で、午前の課題の量と終わりの合図を見直し、学校でも同じやり方にした', before: plan1, after: plan2, signerMemberIds: [me.id, staff.id, teacher.id], status: 'active', activeSince: changeDate }, stamp(changeDate, 16));
  const sign = (c: PlanChange, m: TeamMember, state: PlanSignoff['state'], opinion = ''): PlanSignoff => ({ ...rec(), createdAt: c.createdAt, personId: person.id, changeId: c.id, memberId: m.id, state, opinion });
  const signoffs = [sign(ch1, me, 'agreed'), sign(ch1, staff, 'agreed'), sign(ch1, teacher, 'agreed'), sign(ch2, staff, 'agreed'), sign(ch2, me, 'agreed')];

  // 支援会議メモ（6.10）: 計画の変更を決めた日の会議。グラフはその日の時点で保存
  const rs = await loadRecordSet(person.id);
  const meetingDay = changeDate;
  const heldAt = stamp(meetingDay, 15);
  const charts = takeSnapshots(
    [hit, card, dress, voice],
    rs,
    Array.from({ length: 28 }, (_, i) => addDays(meetingDay, -28 + i)),
    'week',
    plan1,
    [{ date: startDate, label: '支援開始' }],
  );
  const meeting: MeetingNote = {
    ...rec(),
    createdAt: heldAt,
    personId: person.id,
    heldAt,
    place: 'ひまわり園の会議室',
    participantIds: [me.id, staff.id, teacher.id],
    otherParticipants: '相談員',
    charts,
    results: '休憩カードを渡せる日が増えてきた。頭たたきは支援開始前より少し減った。',
    decisions: '午前の課題の量を2つ減らし、終わりの合図を写真カードで見せる。学校でも同じカードを使う。',
    nextReview: plan2.reviewDate,
    planSnapshot: plan1,
    recorderId: staff.userId,
  };
  const comment: Comment = { ...rec(), createdAt: stamp(meetingDay, 18), personId: person.id, target: 'meeting', targetId: meeting.id, text: '学校の写真カードを、家庭用にもう1組作ります。', authorId: teacher.userId };

  // 支援者の提案（【暫定】2026-11-07 の試作）: 先生Bが学校でのカードを提案し、職員Aが会議で採用した。もう1つはまだ決めていない
  const proposal = (p: Pick<Proposal, 'kind' | 'behaviorId' | 'proposedBy' | 'body' | 'status' | 'decidedBy' | 'decidedAt'>, createdAt: string): Proposal => ({
    ...rec(),
    createdAt,
    updatedAt: p.decidedAt ?? createdAt,
    personId: person.id,
    ...p,
  });
  const proposals = [
    proposal({ kind: 'plan', behaviorId: null, proposedBy: teacher.userId, body: '学校でも同じ休憩カードを使いたいです。', status: 'adopted', decidedBy: staff.userId, decidedAt: stamp(meetingDay, 16) }, stamp(addDays(today, -7), 17)),
    proposal({ kind: 'behavior', behaviorId: hit.id, proposedBy: teacher.userId, body: '学校では、机に頭をぶつけることもあります。「頭たたき」に入れるか、別の行動にするか決めたいです。', status: 'open', decidedBy: null, decidedAt: null }, stamp(addDays(today, -2), 16)),
  ];
  // 行動の定義の変更（6.2）: 10日前に「大きな声を出す」の定義に「1秒以上」を足した。グラフに「定義の変更」の線が入る
  const revision: BehaviorRevision = { ...rec(), createdAt: stamp(addDays(today, -10), 18), personId: person.id, behaviorId: voice.id, userId: staff.userId, fields: ['definition'] };

  await db.transaction('rw', [db.supportPlans, db.planChanges, db.planSignoffs, db.meetingNotes, db.comments, db.proposals, db.behaviorRevisions], async () => {
    await db.supportPlans.add(planRec);
    await db.planChanges.bulkAdd([ch1, ch2]);
    await db.planSignoffs.bulkAdd(signoffs);
    await db.meetingNotes.add(meeting);
    await db.comments.add(comment);
    await db.proposals.bulkAdd(proposals);
    await db.behaviorRevisions.add(revision);
  });
}
