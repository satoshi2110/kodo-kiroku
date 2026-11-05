/** アプリ全体の状態: この端末の人、いま見ている対象者、行動の一覧、自分の役割 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { saveDevice } from './db/repo';
import type { Behavior, Person, TeamMember } from './db/types';

interface AppState {
  loading: boolean;
  userId: string | null;
  persons: Person[];
  person: Person | undefined;
  behaviors: Behavior[]; // 非表示・削除を除き、並び順どおり
  me: TeamMember | undefined; // いまの対象者のチームでの自分
  members: TeamMember[];
  aiEnabled: boolean; // チームの設定で AI を「あり」にしているか（9章）
  setCurrentPerson: (id: string) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  // 端末の設定・自分の所属・対象者は1回の読み込みでそろえる（途中の古い値で「未登録」と判断しないため）
  const base = useLiveQuery(async () => {
    const device = (await db.device.get('device')) ?? null;
    if (!device?.userId) return { device, persons: [] as Person[] };
    const mine = (await db.teamMembers.where('userId').equals(device.userId).toArray()).filter((m) => !m.deletedAt);
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
  const members = useLiveQuery(
    async () => (personId ? (await db.teamMembers.where('personId').equals(personId).toArray()).filter((m) => !m.deletedAt) : []),
    [personId],
  );

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
      setCurrentPerson: (id) => saveDevice({ currentPersonId: id }),
    }),
    [base, userId, persons, person, behaviors, members, teamSetting],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider がありません');
  return v;
}
