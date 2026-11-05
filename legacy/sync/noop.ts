import type { ChangeRecord, SyncAdapter } from './types';

/** Phase 1: 何も送受信しないアダプタ。ローカル保存のみで全機能が動く。 */
export class NoopSyncAdapter implements SyncAdapter {
  readonly name = 'local-only';
  async push(changes: ChangeRecord[]) {
    return { accepted: changes.map((c) => c.id) };
  }
  async pull() {
    return { changes: [], serverTime: new Date().toISOString() };
  }
  isOnline() {
    return typeof navigator === 'undefined' ? false : navigator.onLine;
  }
}

export const syncAdapter: SyncAdapter = new NoopSyncAdapter();
