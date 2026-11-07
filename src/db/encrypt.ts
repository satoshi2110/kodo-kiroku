/**
 * 端末の中の暗号化（7.4.2 #1、決定104・108）。【暫定】（2026-11-07 の試作）限定版。
 * - 暗号化するのは、下の ENCRYPTED に挙げた「本文」と写真だけ（ABC の内容・コメント・会議メモ・支援計画・身体拘束の記録・監査ログの中身など）。
 *   日付・行動・チームなど、さがすのに使う項目（Dexie の索引）は暗号化できないので、そのまま残る。
 * - 鍵はチームごとに1つ。端末の中（localStorage）に置く。電波がなくても記録できるようにするため、鍵とデータは同じ端末にある。
 *   そのため、守りはスマホ・パソコンのロックと暗号化に頼る部分が大きい（決定104 の文）。
 * - ログアウト・遠隔ログアウト・90日でのログアウト・チームを抜けたときは、データを消したあとで、そのチームの鍵も消す。
 * - しくみ: Dexie のいちばん上の層（DBCore ミドルウェア）で、書くときに暗号化し、読むときに戻す。
 *   ほかの処理（同期・書き出し・AI の仮名化）は、これまでどおり暗号化していない形で読み書きする。
 *   IndexedDB の書き込みの途中では待てない（待つと書き込みが終わってしまう）ので、同期で動く AES-GCM（@noble/ciphers）を使う。
 */
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import type { DBCore, DBCoreCursor, DBCoreTable, Middleware } from 'dexie';

/** 表ごとに暗号化する項目（索引に使う項目は入れない） */
export const ENCRYPTED: Record<string, readonly string[]> = {
  events: ['activity', 'placeName'],
  observations: ['placeName'],
  sleepLogs: ['note'],
  abcDetails: ['antecedentNote', 'consequenceNote', 'note'],
  comments: ['text'],
  meetingNotes: ['place', 'otherParticipants', 'results', 'decisions', 'charts', 'planSnapshot'],
  supportPlans: ['content', 'activeContent'],
  planChanges: ['reason', 'before', 'after'],
  planSignoffs: ['opinion'],
  restraintLogs: ['placeName', 'activity', 'situation', 'urgency', 'nonAlternative', 'temporary', 'performer', 'decider', 'method', 'personState', 'familyReportNote', 'review'],
  reinforcers: ['name', 'usage'],
  reinforcerPhotos: ['data'],
  proposals: ['body'],
  aiAnalyses: ['input', 'output', 'message', 'decisionNote'],
  aiSuggestions: ['output', 'decisionNote'],
  aiSummaries: ['input', 'output'],
  auditLogs: ['before', 'after'],
};

const PREFIX = 'kodo-kiroku-key:';
const NO_TEAM = '_';
const keys = new Map<string, Uint8Array>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
// ほかのタブで鍵を消した・作ったときは、覚えている鍵を捨てて読み直す
try {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith(PREFIX)) keys.clear();
  });
} catch {
  /* 画面のない環境 */
}

const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** チームの鍵。create のときは、なければ作る。localStorage が使えないときは null（そのときは暗号化しない） */
function keyFor(team: string, create: boolean): Uint8Array | null {
  const k = keys.get(team);
  if (k) return k;
  const st = storage();
  if (!st) return null;
  try {
    const s = st.getItem(PREFIX + team);
    if (s) {
      const got = fromB64(s);
      keys.set(team, got);
      return got;
    }
    if (!create) return null;
    const made = randomBytes(32);
    const enc = toB64(made);
    st.setItem(PREFIX + team, enc);
    if (st.getItem(PREFIX + team) !== enc) return null; // 残せなかった（容量など）ときは暗号化しない
    keys.set(team, made);
    return made;
  } catch {
    return null;
  }
}

/** チームの鍵を消す（そのチームのデータを端末から消したあとに呼ぶ） */
export function forgetKeys(teams: Iterable<string>) {
  const st = storage();
  for (const t of teams) {
    keys.delete(t);
    try {
      st?.removeItem(PREFIX + t);
    } catch {
      /* 消せなくても先へ進む */
    }
  }
}

type Row = Record<string, unknown> & { id?: string; personId?: string | null; _enc?: Uint8Array; _unreadable?: boolean };
const te = new TextEncoder();
const td = new TextDecoder();
const aad = (table: string, id: unknown) => te.encode(`${table}:${String(id)}`);
const teamOf = (r: Row) => (typeof r.personId === 'string' && r.personId ? r.personId : NO_TEAM);

function seal(table: string, fields: readonly string[], v: Row): Row {
  if (!v || typeof v !== 'object') return v;
  if (v._unreadable) {
    // 読めなかった行（鍵がない）は、そのまま戻す（中身を空で上書きしない）
    const { _unreadable: _u, ...rest } = v;
    return rest;
  }
  const key = keyFor(teamOf(v), true);
  if (!key) return v;
  const out: Row = { ...v };
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in out) {
      payload[f] = out[f];
      delete out[f];
    }
  }
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce, aad(table, v.id)).encrypt(te.encode(JSON.stringify(payload)));
  const box = new Uint8Array(12 + ct.length);
  box.set(nonce);
  box.set(ct, 12);
  out._enc = box;
  return out;
}

function open(table: string, v: Row): Row {
  if (!v || typeof v !== 'object' || !(v._enc instanceof Uint8Array)) return v;
  const key = keyFor(teamOf(v), false);
  try {
    if (!key) throw new Error('no key');
    const pt = gcm(key, v._enc.subarray(0, 12), aad(table, v.id)).decrypt(v._enc.subarray(12));
    const { _enc: _e, ...rest } = v;
    return { ...rest, ...(JSON.parse(td.decode(pt)) as Record<string, unknown>) };
  } catch {
    // 鍵が消えた・こわれた: 中身は出さず、同期でも送らない（sync.ts）
    return { ...v, _unreadable: true };
  }
}

function wrapCursor(table: string, c: DBCoreCursor): DBCoreCursor {
  let raw: unknown;
  let opened: unknown;
  return Object.create(c, {
    value: {
      get() {
        const now = c.value;
        if (now !== raw) {
          raw = now;
          opened = open(table, now as Row);
        }
        return opened;
      },
    },
  });
}

export const encryptMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'Encrypt',
  level: 10, // いちばん上（ほかの層には暗号化した形で渡る）
  create(down) {
    return {
      ...down,
      table(name: string): DBCoreTable {
        const t = down.table(name);
        const fields = ENCRYPTED[name];
        if (!fields) return t;
        return {
          ...t,
          mutate(req) {
            if (req.type === 'add' || req.type === 'put') {
              // 変更の差分（updates・changeSpec）には暗号化していない値が入るので、下の層には渡さない
              const { updates: _u, changeSpec: _c, ...rest } = req as typeof req & { updates?: unknown; changeSpec?: unknown };
              return t.mutate({ ...rest, values: req.values.map((v) => seal(name, fields, v as Row)) } as typeof req);
            }
            return t.mutate(req);
          },
          get: (req) => t.get(req).then((v) => open(name, v as Row)),
          getMany: (req) => t.getMany(req).then((a) => a.map((v) => open(name, v as Row))),
          query: (req) => t.query(req).then((r) => (req.values ? { ...r, result: r.result.map((v) => open(name, v as Row)) } : r)),
          openCursor: (req) => t.openCursor(req).then((c) => (c && req.values !== false ? wrapCursor(name, c) : c)),
        };
      },
    };
  },
};
