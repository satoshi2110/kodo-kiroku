/**
 * 同期層のインターフェース（Phase 1 はローカル IndexedDB のみ）。
 * 将来 PostgreSQL + 行レベルセキュリティ（Supabase 等）のアダプタを実装する。
 * 記録は追記型なので競合はほぼ起きない。同一記録の編集競合は「後勝ち + 履歴保持」。
 */
import type { AuditEntity } from '../db/types';

export interface ChangeRecord {
  entity: AuditEntity;
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  data: unknown;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  serverTime: string | null;
}

export interface SyncAdapter {
  readonly name: string;
  /** ローカルの未送信変更をサーバへ送る */
  push(changes: ChangeRecord[]): Promise<{ accepted: string[] }>;
  /** since 以降のサーバ側の変更を取得する */
  pull(since: string | null): Promise<{ changes: ChangeRecord[]; serverTime: string }>;
  /** 接続可否 */
  isOnline(): boolean;
}
