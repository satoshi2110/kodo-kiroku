/** アプリ全体の状態: この端末の人、いま見ている対象者、行動の一覧、自分の役割 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { purgeTeam, saveDevice, TEAM_DELETE_DAYS } from './db/repo';
import type { Behavior, Person, Place, RestraintPeriod, TeamMember } from './db/types';

interface AppState {
  loading: boolean;
  userId: string | null;
  persons: Person[];
  person: Person | undefined;
  behaviors: Behavior[]; // 非表示・削除を除き、並び順どおり
  me: TeamMember | undefined; // いまの対象者のチームでの自分
  members: TeamMember[];
  aiEnabled: boolean; // チームの設定で AI を「あり」にしているか（9章）
  places: Place[]; // 非表示を除いた登録場所
  place: Place | undefined; // いまの場所（未設定・登録場所の外なら undefined）
  placeOutside: boolean; // 「登録場所の外」を選んでいる
  useLocation: boolean; // この端末で位置情報を使う
  shortSleepUnderHours: number | null; // 睡眠不足を「○時間未満」で判定する（null = いつもより2時間以上短い）
  deleteRequestedAt: string | null; // チームの削除の申し込み
  restraintPeriod: RestraintPeriod | null; // 身体拘束の見直しをすすめる目安（決定64・74。初期値なし）
  restraintCount: number | null;
  setCurrentPerson: (id: string) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  // 端末の設定・自分の所属・対象者は1回の読み込みでそろえる（途中の古い値で「未登録」と判断しないため）
  const base = useLiveQuery(async () => {
    const device = (await db.device.get('device')) ?? null;
    if (!device?.userId) return { device, persons: [] as Person[] };
    // 承認を待っている・停止されたチームは開かない（サーバーのチームだけにある印）
    const mine = (await db.teamMembers.where('userId').equals(device.userId).toArray()).filter((m) => !m.deletedAt && m.approvedAt !== null && !m.suspendedAt);
    const persons = (await db.persons.bulkGet(mine.map((m) => m.personId))).filter((p): p is Person => !!p && !p.deletedAt);
    return { device, persons };
  }, []);
  const device = base?.device;
  const userId = device?.userId ?? null;
  const persons = base?.persons;
  const personId = device?.currentPersonId ?? persons?.[0]?.id ?? null;
  const person = persons?.find((p) => p.id === personId);
  const behaviors = useLiveQuery(
    async () =>
      personId
        ? (await db.behaviors.where('personId').equals(personId).toArray())
            .filter((b) => !b.deletedAt && !b.hiddenAt)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [personId],
  );
  const teamSetting = useLiveQuery(async () => (personId ? ((await db.teamSettings.get(personId)) ?? null) : null), [personId]);
  const places = useLiveQuery(
    async () =>
      personId
        ? (await db.places.where('personId').equals(personId).toArray())
            .filter((p) => !p.deletedAt && !p.hiddenAt)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    [personId],
  );
  const choice = personId ? device?.placeChoice?.[personId] : undefined;
  const members = useLiveQuery(
    async () => (personId ? (await db.teamMembers.where('personId').equals(personId).toArray()).filter((m) => !m.deletedAt) : []),
    [personId],
  );

  // 削除を申し込んで30日たったチームは、開いたときに消す
  const deleteAt = teamSetting?.deleteRequestedAt;
  useEffect(() => {
    if (!deleteAt || !personId || !userId) return;
    if (Date.now() - new Date(deleteAt).getTime() >= TEAM_DELETE_DAYS * 86400_000) purgeTeam(personId, userId);
  }, [deleteAt, personId, userId]);

  const value = useMemo<AppState>(
    () => ({
      loading: base === undefined,
      userId,
      persons: persons ?? [],
      person,
      behaviors: behaviors ?? [],
      me: members?.find((m) => m.userId === userId),
      members: members ?? [],
      aiEnabled: !!teamSetting?.aiEnabled,
      places: places ?? [],
      place: places?.find((p) => p.id === choice),
      placeOutside: choice === 'outside',
      useLocation: !!device?.useLocation,
      shortSleepUnderHours: teamSetting?.shortSleepUnderHours ?? null,
      deleteRequestedAt: teamSetting?.deleteRequestedAt ?? null,
      restraintPeriod: teamSetting?.restraintPeriod ?? null,
      restraintCount: teamSetting?.restraintCount ?? null,
      setCurrentPerson: (id) => saveDevice({ currentPersonId: id }),
    }),
    [base, userId, persons, person, behaviors, members, teamSetting, places, choice, device],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider がありません');
  return v;
}
