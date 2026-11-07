/** 行動の定義の変更の記録（6.2）。グラフ・会議メモ・PDF レポートの縦線に使う */
import { useLiveQuery } from 'dexie-react-hooks';
import { behaviorRevisions } from '../db/repo';
import type { BehaviorRevision } from '../db/types';

export function useRevisions(personId: string | undefined): BehaviorRevision[] | undefined {
  return useLiveQuery(async () => (personId ? behaviorRevisions(personId) : []), [personId]);
}
