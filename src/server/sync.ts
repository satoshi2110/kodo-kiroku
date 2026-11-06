/**
 * 端末とサーバーの同期（6.3.6、7.3）。記録はまず端末に保存し（電波がなくても記録できる）、あとでサーバーに送る。
 * - 送る: 端末で作った・変えた行に印（_dirty）を付けておき、サーバーのチームの分だけ送る。サンプルは送らない。
 * - 受け取る: サーバーが受け取った時刻（server_at）が前回より新しい行を取りにくる。見えるのは RLS で許された行だけ。
 * - ぶつかったとき: updated_at が新しいほうを残す（サーバーでも古い変更は捨てる）。
 * いまは 対象者・メンバー・チームの設定・同意・行動・記録・インターバル記録・ABC記録（選択肢と詳しい内容）・睡眠・「観察していなかった日」・場所・わたしのいつもの時間・好きなもの（写真も）・支援計画（変更と合意）・身体拘束の記録・支援会議メモ・申し送りとコメント・管理者の引き継ぎ（受け取るだけ）・監査ログ。
 * AI の結果は、まだこの端末の中だけ。
 */
import Dexie, { type Table } from 'dexie';
import { db } from '../db/db';
import { forgetTeam } from '../db/repo';
import { toLocalISO } from '../lib/date';
import { supabase } from './supabase';

type Row = Record<string, unknown> & { id: string; updatedAt?: string; personId?: string };

interface SyncTable {
  local: Table<any, string>; // eslint-disable-line @typescript-eslint/no-explicit-any
  remote: string;
  team: (r: Row) => string | undefined; // どのチーム（対象者）の行か
  insert: boolean; // 端末から新しく作ってよいか（対象者とメンバーはサーバーの関数でだけ作る）
  appendOnly?: boolean; // 作ったあとは変えない（同意）。送り直しても重ならないように送る
}

/** 送る順番（行動・場所・睡眠の前に対象者、記録・インターバル記録・「観察していなかった日」の前に行動、ABC記録の前に記録、写真の前に好きなもの、変更の前に計画、合意の前に変更、コメントの前に会議メモ） */
const TABLES: SyncTable[] = [
  { local: db.persons, remote: 'persons', team: (r) => r.id, insert: false },
  { local: db.teamMembers, remote: 'team_members', team: (r) => r.personId, insert: false },
  { local: db.ownerTransfers, remote: 'owner_transfers', team: (r) => r.personId, insert: false },
  { local: db.teamSettings, remote: 'team_settings', team: (r) => r.personId, insert: true },
  { local: db.consents, remote: 'consents', team: (r) => r.personId, insert: true, appendOnly: true },
  { local: db.behaviors, remote: 'behaviors', team: (r) => r.personId, insert: true },
  { local: db.observations, remote: 'observations', team: (r) => r.personId, insert: true },
  { local: db.places, remote: 'places', team: (r) => r.personId, insert: true },
  { local: db.userSchedules, remote: 'user_schedules', team: (r) => r.personId, insert: true },
  { local: db.sleepLogs, remote: 'sleep_logs', team: (r) => r.personId, insert: true },
  { local: db.notObservedDays, remote: 'not_observed_days', team: (r) => r.personId, insert: true },
  { local: db.events, remote: 'events', team: (r) => r.personId, insert: true },
  { local: db.choiceOptions, remote: 'choice_options', team: (r) => r.personId, insert: true },
  { local: db.abcDetails, remote: 'abc_details', team: (r) => r.personId, insert: true },
  { local: db.reinforcers, remote: 'reinforcers', team: (r) => r.personId, insert: true },
  { local: db.reinforcerPhotos, remote: 'reinforcer_photos', team: (r) => r.personId, insert: true },
  { local: db.supportPlans, remote: 'support_plans', team: (r) => r.personId, insert: true },
  { local: db.planChanges, remote: 'plan_changes', team: (r) => r.personId, insert: true },
  { local: db.planSignoffs, remote: 'plan_signoffs', team: (r) => r.personId, insert: true },
  { local: db.restraintLogs, remote: 'restraint_logs', team: (r) => r.personId, insert: true },
  { local: db.meetingNotes, remote: 'meeting_notes', team: (r) => r.personId, insert: true },
  { local: db.comments, remote: 'comments', team: (r) => r.personId, insert: true },
];

// ---------- 変更の印 ----------

/** サーバーから受け取った内容を書くときの transaction には印を付け、変更の印（_dirty）を付けない */
const REMOTE = '__remote';
const isRemote = (tx: unknown) => !!(tx as Record<string, unknown> | undefined)?.[REMOTE] || !!(Dexie.currentTransaction as unknown as Record<string, unknown> | null)?.[REMOTE];

let installed = false;
export function installSyncHooks() {
  if (installed || !supabase) return;
  installed = true;
  for (const t of [...TABLES.map((x) => x.local), db.auditLogs]) {
    t.hook('creating', function (_pk, obj, tx) {
      if (!isRemote(tx)) (obj as unknown as Row)._dirty = 1;
      scheduleSync();
    });
    t.hook('updating', function (mods, _pk, _obj, tx) {
      if (isRemote(tx) || '_dirty' in (mods as object)) return undefined;
      scheduleSync();
      return { _dirty: 1 };
    });
  }
}

async function remoteWrite(tables: Table[], fn: () => Promise<void>) {
  await db.transaction('rw', tables, async (tx) => {
    (tx as unknown as Record<string, unknown>)[REMOTE] = true;
    await fn();
  });
}

// ---------- 形の変換（端末は camelCase、サーバーは snake_case） ----------

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const TS = /^\d{4}-\d{2}-\d{2}T/;

function toRemote(r: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith('_') || k === 'isSample' || v === undefined) continue;
    out[snake(k)] = v;
  }
  return out;
}

function fromRemote(r: Record<string, unknown>): Row {
  const out: Record<string, unknown> = { _dirty: 0, _srv: 1 };
  for (const [k, v] of Object.entries(r)) {
    if (k === 'server_at') continue;
    // 時刻は端末の書き方（+09:00 付き）にそろえる。並べ替えを文字列でしている画面があるため
    out[camel(k)] = typeof v === 'string' && TS.test(v) ? toLocalISO(new Date(v)) : v;
  }
  return out as Row;
}

const newer = (a?: string, b?: string) => !!a && (!b || new Date(a).getTime() > new Date(b).getTime());

// ---------- 状態（画面に出す） ----------

export interface SyncStatus {
  running: boolean;
  lastAt: string | null; // 最後にうまく同期できた時刻
  error: string | null;
  pending: number; // まだ送れていない行の数
}
let status: SyncStatus = { running: false, lastAt: null, error: null, pending: 0 };
const listeners = new Set<() => void>();
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  listeners.forEach((f) => f());
}
export const syncStatus = {
  get: () => status,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

// ---------- 送る ----------

/** サーバーのチームの id（サーバーから受け取った対象者） */
async function serverTeams(): Promise<Set<string>> {
  return new Set((await db.persons.toArray()).filter((p) => (p as unknown as Row)._srv === 1).map((p) => p.id));
}

async function markSent(t: Table<any, string>, rows: Row[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  await remoteWrite([t], async () => {
    for (const r of rows) {
      const cur = (await t.get(r.id)) as Row | undefined;
      // 送っている間に書きかえられていたら、印を残して次に送る
      if (cur && cur.updatedAt === r.updatedAt) await t.update(r.id, { _dirty: 0, _srv: 1 });
    }
  });
}

/** サーバーが受け付けなかった行を、サーバーの内容で上書きする。見る権限もない行は端末から消す */
async function restore(s: SyncTable, ids: string[]) {
  const { data, error } = await supabase!.from(s.remote).select('*').in('id', ids);
  if (error) return;
  await remoteWrite([s.local], async () => {
    for (const id of ids) {
      const r = data.find((x) => x.id === id);
      if (r) await s.local.put(fromRemote(r));
      else await s.local.delete(id);
    }
  });
}

async function push(uid: string, teams: Set<string>): Promise<string[]> {
  const sb = supabase!;
  const errors: string[] = [];
  for (const s of TABLES) {
    if (s.appendOnly) {
      // 同期を入れる前に端末で取った同意（_srv なし）も送る。送れるのは自分の同意だけ
      const own = (await s.local.filter((r: Row) => (r._dirty === 1 || r._srv !== 1) && r.userId === uid && teams.has(s.team(r) ?? '')).toArray()) as Row[];
      if (!own.length) continue;
      const { error } = await sb.from(s.remote).upsert(own.map(toRemote), { onConflict: 'id', ignoreDuplicates: true });
      if (!error) await markSent(s.local, own);
      else errors.push(`${s.remote}: ${error.message}`);
      continue;
    }
    const rows = (await s.local.filter((r: Row) => r._dirty === 1 && teams.has(s.team(r) ?? '')).toArray()) as Row[];
    if (!rows.length) continue;
    const fresh = s.insert ? rows.filter((r) => r._srv !== 1) : [];
    const known = rows.filter((r) => !fresh.includes(r));
    const sent: Row[] = [];
    const rejected: string[] = [];
    if (fresh.length) {
      const { error } = await sb.from(s.remote).insert(fresh.map(toRemote));
      if (!error) sent.push(...fresh);
      else known.push(...fresh); // すでにサーバーにある（前に送ったが返事が届かなかった）などは1件ずつ書きかえる
    }
    for (const r of known) {
      const body = toRemote(r);
      delete body.id;
      const { data, error } = await sb.from(s.remote).update(body).eq('id', r.id).select('id');
      if (!error && data && data.length) sent.push(r);
      else if (!error && s.insert && r._srv !== 1) {
        const ins = await sb.from(s.remote).insert(toRemote(r));
        if (!ins.error) sent.push(r);
        else errors.push(`${s.remote}: ${ins.error.message}`);
      } else if (!error) {
        // 権限がない・古い変更として捨てられた。端末の内容をサーバーの内容に戻す
        sent.push(r);
        rejected.push(r.id);
      } else errors.push(`${s.remote}: ${error.message}`);
    }
    await markSent(s.local, sent);
    if (rejected.length) await restore(s, rejected);
  }
  // 監査ログ（追記のみ）。自分の操作で、サーバーのチームのものだけ
  const logs = (await db.auditLogs.filter((r) => (r as unknown as Row)._dirty === 1).toArray()) as unknown as Row[];
  const mine = logs.filter((r) => r.actorId === uid && (r.personId == null || teams.has(r.personId)));
  if (mine.length) {
    const { error } = await supabase!.from('audit_logs').upsert(mine.map(toRemote), { onConflict: 'id', ignoreDuplicates: true });
    if (!error) await markSent(db.auditLogs, mine.map((r) => ({ ...r, updatedAt: undefined })));
    else errors.push(`audit_logs: ${error.message}`);
  }
  return errors;
}

// ---------- 受け取る ----------

async function pull(uid: string): Promise<string[]> {
  const sb = supabase!;
  const errors: string[] = [];
  const dev = await db.device.get('device');
  let since = { ...(dev?.syncSince ?? {}) };
  // 承認された・別のチームに入ったときは、それまで見えなかった古い行（ほかのメンバーなど）も全部取り直す
  const mine = await sb.from('team_members').select('person_id').eq('user_id', uid).not('approved_at', 'is', null).is('suspended_at', null).is('deleted_at', null);
  if (mine.error) return [`team_members: ${mine.error.message}`];
  const teams = mine.data.map((m) => m.person_id as string);
  const known = new Set(dev?.syncTeams ?? []);
  // 停止された・外されたチームは、この端末に残っているデータを消す（7章 #2）。通信に失敗したときは上で戻るので消さない
  for (const t of known) if (!teams.includes(t)) await forgetTeam(t);
  if (teams.some((t) => !known.has(t))) since = {};
  for (const s of TABLES) {
    // 同じ時刻に書かれた行を取りこぼさないよう、5分さかのぼって取り直す（同じ行は上書きされるだけ）
    let from = since[s.remote] ? new Date(new Date(since[s.remote]).getTime() - 5 * 60_000).toISOString() : '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await sb.from(s.remote).select('*').gt('server_at', from).order('server_at').limit(500);
      if (error) {
        errors.push(`${s.remote}: ${error.message}`);
        break;
      }
      if (!data.length) break;
      await remoteWrite([s.local], async () => {
        for (const r of data) {
          const local = (await s.local.get(r.id as string)) as Row | undefined;
          const incoming = fromRemote(r);
          // 端末でもっと新しく書きかえていて、まだ送れていないときは端末の内容を残す
          if (local && local._dirty === 1 && newer(local.updatedAt, incoming.updatedAt as string)) continue;
          await s.local.put(incoming);
        }
      });
      const last = data[data.length - 1].server_at as string;
      since[s.remote] = last;
      from = last;
      if (data.length < 500) break;
    }
  }
  await db.device.update('device', { syncSince: since, syncTeams: teams });
  return errors;
}

/**
 * 管理者の引き継ぎ（6.9）: 自分が申し込んだ副管理者申請が14日たっても断られていなければ、管理者になる。
 * サーバーの関数が期限と返事を確かめる。入れかわったときは true（もう一度受け取って役割を新しくする）
 */
async function finishDueRequests(uid: string): Promise<boolean> {
  const due = await db.ownerTransfers
    .filter((t) => t.method === 'subadmin_request' && t.result === 'pending' && t.toUser === uid && !!t.dueAt && new Date(t.dueAt).getTime() <= Date.now())
    .toArray();
  let done = false;
  for (const t of due) {
    const { error } = await supabase!.rpc('finish_admin_request', { p_id: t.id });
    if (!error) done = true;
  }
  return done;
}

// ---------- まとめて ----------

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

export function scheduleSync(delay = 1500) {
  if (!supabase) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void runSync(), delay);
}

export async function runSync(): Promise<void> {
  if (!supabase) return;
  if (running) return running;
  running = (async () => {
    const { data } = await supabase!.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    if (!navigator.onLine) {
      setStatus({ error: '電波がありません。つながったら送ります' });
      return;
    }
    setStatus({ running: true });
    try {
      const errors = [...(await pull(uid))];
      if (await finishDueRequests(uid)) errors.push(...(await pull(uid)));
      errors.push(...(await push(uid, await serverTeams())));
      const pending = await unsentCount();
      setStatus({ running: false, lastAt: new Date().toISOString(), error: errors.length ? errors.join(' / ') : null, pending });
    } catch (e) {
      setStatus({ running: false, error: e instanceof Error ? e.message : String(e) });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** ログアウトしたとき: サーバーのチームのデータをこの端末から消す（端末の紛失・共用への備え、7.4.2 #1）。サンプルは残す */
export async function clearServerData() {
  const teams = await serverTeams();
  const all = [...TABLES.map((s) => s.local), db.auditLogs, db.aiAnalyses, db.aiSuggestions, db.aiSummaries, db.device];
  await db.transaction('rw', all, async () => {
    for (const t of all) {
      if (t === db.device) continue;
      if (t === db.persons) await t.where('id').anyOf([...teams]).delete();
      else await t.filter((r: Row) => teams.has(r.personId ?? '')).delete();
    }
    await db.device.update('device', { userId: null, currentPersonId: null, syncSince: {}, syncTeams: [] });
  });
}

/** まだサーバーに送れていない行の数（ログアウトの前に知らせる） */
export async function unsentCount(): Promise<number> {
  const teams = await serverTeams();
  let n = 0;
  for (const s of TABLES) n += await s.local.filter((r: Row) => r._dirty === 1 && teams.has(s.team(r) ?? '')).count();
  return n;
}
