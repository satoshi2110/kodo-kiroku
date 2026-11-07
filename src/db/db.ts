import Dexie, { type Table } from 'dexie';
import { ENCRYPTED, encryptMiddleware } from './encrypt';
import type { AbcDetail, AiAnalysis, AiSuggestion, AiSummary, SupportPlan, PlanChange, PlanSignoff, RestraintLog, MeetingNote, Comment, AuditLog, TeamSetting, Behavior, ChoiceOption, Consent, Observation, SleepLog, NotObservedDay, Place, UserSchedule, Reinforcer, ReinforcerPhoto, DeviceSetting, Event, OwnerTransfer, Person, Proposal, BehaviorRevision, TeamMember, User } from './types';

/**
 * 端末内の保存（IndexedDB）。電波がなくても記録でき（6.3.6）、サーバー接続後は同期の元になる。
 * 試作（仕様書 v0.2）の 'kodo-kiroku' とは別の名前にして、古い形のデータと混ぜない。
 */
export class AppDB extends Dexie {
  users!: Table<User, string>;
  persons!: Table<Person, string>;
  teamMembers!: Table<TeamMember, string>;
  behaviors!: Table<Behavior, string>;
  events!: Table<Event, string>;
  consents!: Table<Consent, string>;
  auditLogs!: Table<AuditLog, string>;
  device!: Table<DeviceSetting, string>;
  choiceOptions!: Table<ChoiceOption, string>;
  abcDetails!: Table<AbcDetail, string>;
  teamSettings!: Table<TeamSetting, string>;
  aiAnalyses!: Table<AiAnalysis, string>;
  aiSuggestions!: Table<AiSuggestion, string>;
  observations!: Table<Observation, string>;
  sleepLogs!: Table<SleepLog, string>;
  notObservedDays!: Table<NotObservedDay, string>;
  places!: Table<Place, string>;
  reinforcers!: Table<Reinforcer, string>;
  reinforcerPhotos!: Table<ReinforcerPhoto, string>;
  aiSummaries!: Table<AiSummary, string>;
  supportPlans!: Table<SupportPlan, string>;
  planChanges!: Table<PlanChange, string>;
  planSignoffs!: Table<PlanSignoff, string>;
  restraintLogs!: Table<RestraintLog, string>;
  meetingNotes!: Table<MeetingNote, string>;
  comments!: Table<Comment, string>;
  userSchedules!: Table<UserSchedule, string>;
  ownerTransfers!: Table<OwnerTransfer, string>;
  proposals!: Table<Proposal, string>;
  behaviorRevisions!: Table<BehaviorRevision, string>;

  constructor() {
    super('kodo-kiroku-v1');
    this.version(1).stores({
      users: 'id',
      persons: 'id',
      teamMembers: 'id, personId, userId',
      behaviors: 'id, personId',
      events: 'id, personId, behaviorId, [personId+localDate], updatedAt',
      consents: 'id, userId, personId',
      auditLogs: 'id, personId, entity, entityId, at',
      device: 'key',
    });
    this.version(2).stores({
      choiceOptions: 'id, personId',
      abcDetails: 'id, personId, eventId',
    });
    this.version(3).stores({
      teamSettings: 'personId',
      aiAnalyses: 'id, personId, requestedBy',
      aiSuggestions: 'id, personId, analysisId',
    });
    this.version(4).stores({
      observations: 'id, personId, behaviorId, [personId+localDate]',
    });
    this.version(5).stores({
      sleepLogs: 'id, personId, [personId+wakeDate]',
    });
    this.version(6).stores({
      notObservedDays: 'id, personId, [personId+localDate]',
      places: 'id, personId',
      reinforcers: 'id, personId',
      reinforcerPhotos: 'id, personId',
    });
    // Phase 2・3 の画面（決定83）
    this.version(7).stores({
      aiSummaries: 'id, personId, requestedBy',
      supportPlans: 'id, personId',
      planChanges: 'id, personId, planId',
      planSignoffs: 'id, personId, changeId',
      restraintLogs: 'id, personId',
      meetingNotes: 'id, personId',
      comments: 'id, personId, [target+targetId]',
    });
    // わたしのいつもの時間（6.3.3）
    this.version(8).stores({
      userSchedules: 'id, personId',
    });
    // 管理者の引き継ぎ（6.9）。サーバーから受け取るだけ
    this.version(9).stores({
      ownerTransfers: 'id, personId',
    });
    // 支援者の提案と、行動の定義の変更の記録（0017）
    this.version(10).stores({
      proposals: 'id, personId, behaviorId',
      behaviorRevisions: 'id, personId, behaviorId',
    });
    // 端末の中の暗号化（決定104・108）。書くときに本文を暗号化し、読むときに戻す
    this.use(encryptMiddleware);
    // これまでの行を暗号化して書き直す。サーバーから受け取ったときと同じ印を付け、変更として送り直さない（sync.ts の __remote）
    this.version(11)
      .stores({})
      .upgrade(async (tx) => {
        (tx as unknown as Record<string, unknown>).__remote = true;
        for (const name of Object.keys(ENCRYPTED)) {
          const rows = await tx.table(name).toArray();
          if (rows.length) await tx.table(name).bulkPut(rows);
        }
      });
  }
}

export const db = new AppDB();
