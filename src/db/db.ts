import Dexie, { type Table } from 'dexie';
import type { AbcDetail, AuditLog, Behavior, ChoiceOption, Consent, DeviceSetting, Event, Person, TeamMember, User } from './types';

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
  }
}

export const db = new AppDB();
