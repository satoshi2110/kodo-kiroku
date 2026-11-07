/**
 * 監査ログを見る（7.4.2 #6。支援リーダー以上）。誰が・いつ・何を・どう変えたかを新しい順に並べる。
 * 【暫定】（2026-11-07 の試作）
 * - ログインして使うときは、サーバーの監査ログを読む（見られるかどうかはサーバーの行レベルセキュリティが決める）。
 *   データベースが自分で残した行（by_server）を正とし、端末が送った同じ変更の行は出さない（6.3.5 の「画面を作るときにまとめる」）。
 *   書き出しは端末だけが残すので、そのまま出す。
 * - サーバーなし（サンプル）のときは、この端末の監査ログを出す。
 * - 変える前と後の中身は出さず、変わった項目の名前だけを出す。
 * - ログインして使うときは、下に閲覧の記録（誰が・どの日にこのチームを開いたか。1日1回。決定102）も出す。どの画面を見たかは残していない。
 */
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { useApp } from '../state';
import { addDays, formatDateJa, formatDateTimeJa, toLocalDate } from '../lib/date';
import { canExport } from '../db/repo';
import { ROLE_LABEL, type AuditAction, type Role } from '../db/types';
import { TopBar } from '../components/ui';
import { supabase } from '../server/supabase';
import { listViewDays, type ViewDay } from '../server/views';

const PAGE = 50;

interface Row {
  id: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  byServer: boolean;
}

/** サーバーは表の名前（abc_details）、端末は型の名前（abcDetail）で残すので、両方を書いておく */
const ENTITY_LABEL: Record<string, string> = {
  persons: '対象者', person: '対象者',
  team_members: 'メンバー', teamMember: 'メンバー',
  owner_transfers: '管理者の引き継ぎ',
  consents: '同意', consent: '同意',
  team_settings: 'チームの設定', teamSetting: 'チームの設定',
  behaviors: '行動', behavior: '行動',
  observations: 'インターバル・時間サンプリングの記録', observation: 'インターバル・時間サンプリングの記録',
  places: '場所', place: '場所',
  user_schedules: '勤務・在宅の時間', userSchedule: '勤務・在宅の時間',
  sleep_logs: '睡眠', sleepLog: '睡眠',
  not_observed_days: '観察していなかった日', notObservedDay: '観察していなかった日',
  events: '記録', event: '記録',
  choice_options: 'ABC の選択肢', choiceOption: 'ABC の選択肢',
  abc_details: 'ABC記録', abcDetail: 'ABC記録',
  reinforcers: '好きなもの', reinforcer: '好きなもの',
  reinforcer_photos: '好きなものの写真',
  support_plans: '支援計画', supportPlan: '支援計画',
  plan_changes: '支援計画の変更', planChange: '支援計画の変更',
  plan_signoffs: '支援計画の合意', planSignoff: '支援計画の合意',
  restraint_logs: '身体拘束の記録', restraintLog: '身体拘束の記録',
  meeting_notes: '支援会議メモ', meetingNote: '支援会議メモ',
  comments: '申し送り・コメント', comment: '申し送り・コメント',
  ai_analyses: 'AI の分析', aiAnalysis: 'AI の分析',
  ai_suggestions: 'AI の提案', aiSuggestion: 'AI の提案',
  aiSummary: 'AI のまとめ',
  proposals: '提案', proposal: '提案',
  behavior_revisions: '行動の定義の変更', behaviorRevision: '行動の定義の変更',
  invite: '招待',
  user: 'アカウント',
};

const ACTION_LABEL: Record<AuditAction, string> = {
  create: 'を作った',
  update: 'を変えた',
  delete: 'を消した（記録は残る）',
  restore: 'を元に戻した',
  export: 'を書き出した',
};

/** 変わった項目の名前（よく変わるものだけ。ほかは件数で出す） */
const KEY_LABEL: Record<string, string> = {
  name: '名前', display_name: '名前', definition: '定義', examples: '例', non_examples: '含まないもの',
  method: '測り方', kind: '種類', role: '役割', approved_at: '承認', suspended_at: '停止', family_mark: '家族の印',
  sleep_input_allowed: '睡眠の入力', mfa_rule: 'MFA の基準', mfa_override: 'MFA の例外', affiliation: '所属', occurred_at: '日時', local_date: '日付', count: '回数',
  duration_sec: '時間', intensity: '強度', place_name: '場所', text: '文', note: 'メモ', notes: 'メモ',
  hidden_at: '非表示', sort_order: '並び順', ai_enabled: 'AI の利用', content: '内容', status: '状態',
  reason: '理由', decision: '採否', results: '確かめた成果', decisions: '決めたこと', revoked_at: '取り消し',
  body: '文', decided_by: '決めた人', decided_at: '決めた時刻', bed_at: '寝た時刻', wake_at: '起きた時刻', radius_m: '半径', antecedent: 'A（きっかけ）', consequence: 'C（その後）',
};
const IGNORE = new Set(['updated_at', 'server_at', 'created_at', 'deleted_at', 'id', 'mfa_rule_at', 'mfa_override_at']);
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function changedKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!before || !after) return '';
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const named: string[] = [];
  let others = 0;
  for (const k of keys) {
    const s = snake(k);
    if (IGNORE.has(s) || k.startsWith('_')) continue;
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    if (KEY_LABEL[s]) named.push(KEY_LABEL[s]);
    else others++;
  }
  const list = [...new Set(named)];
  if (others) list.push(`ほか${others}項目`);
  return list.join('・');
}

function detail(r: Row): string {
  if (r.action === 'export') {
    const kind = r.after && typeof r.after.kind === 'string' ? r.after.kind : '';
    return kind ? `書き出したもの: ${kind}` : '';
  }
  if (r.entity === 'invite' && r.after && typeof r.after.role === 'string') return `役割: ${ROLE_LABEL[r.after.role as Role] ?? r.after.role}`;
  if (r.action === 'update') {
    const c = changedKeys(r.before, r.after);
    return c ? `変わった項目: ${c}` : '';
  }
  return '';
}

const fromServer = (x: Record<string, unknown>): Row => ({
  id: x.id as string,
  entity: x.entity as string,
  entityId: x.entity_id as string,
  action: x.action as AuditAction,
  actorId: x.actor_id as string,
  at: x.at as string,
  before: (x.before as Row['before']) ?? null,
  after: (x.after as Row['after']) ?? null,
  byServer: x.by_server === true,
});

/**
 * 端末が送った行（と、招待などのサーバーの関数が書いた行）のうち、データベースが同じもの・同じ操作を残しているものを除く。
 * 書き出しと招待は、データベースの自動の記録には残らないので、そのまま出す。
 */
const sameThing = (a: Row, b: Row) => a.entityId === b.entityId && a.action === b.action && (ENTITY_LABEL[a.entity] ?? a.entity) === (ENTITY_LABEL[b.entity] ?? b.entity);
const dedupe = (rows: Row[]) => {
  const server = rows.filter((r) => r.byServer);
  return rows.filter((r) => r.byServer || !server.some((x) => sameThing(x, r)));
};

export default function AuditLog() {
  const { person, me, members } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [local, setLocal] = useState(!supabase);
  const personId = person?.id;

  useEffect(() => {
    if (!personId) return;
    let stop = false;
    (async () => {
      setLoading(true);
      setError('');
      if (supabase && !local) {
        const { data, error: e } = await supabase
          .from('audit_logs')
          .select('id, entity, entity_id, action, actor_id, at, before, after, by_server')
          .eq('person_id', personId)
          .order('at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (stop) return;
        if (e) {
          setError(navigator.onLine ? `読めませんでした（${e.message}）` : '通信できないため、サーバーの監査ログを読めません。');
        } else {
          const got = (data ?? []).map(fromServer);
          setRows((prev) => dedupe(page === 0 ? got : [...prev, ...got]));
          setMore(got.length === PAGE);
        }
      } else {
        const all = (await db.auditLogs.where('personId').equals(personId).toArray()).sort((a, b) => b.at.localeCompare(a.at));
        if (stop) return;
        const slice = all.slice(0, (page + 1) * PAGE).map(
          (a): Row => ({ ...a, before: (a.before as Row['before']) ?? null, after: (a.after as Row['after']) ?? null, byServer: false }),
        );
        setRows(slice);
        setMore(all.length > slice.length);
      }
      setLoading(false);
    })();
    return () => {
      stop = true;
    };
  }, [personId, page, local]);

  if (!person) return null;
  if (!canExport(me?.role)) {
    return (
      <div className="page">
        <TopBar title="監査ログ" back="/team" />
        <div className="section">
          <p className="help">監査ログを見られるのは、管理者・副管理者・支援リーダーです。</p>
        </div>
      </div>
    );
  }
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '退会したメンバー';

  return (
    <div className="page">
      <TopBar title="監査ログ" sub={`${person.displayName} ・ 新しい順`} back="/team" />
      <div className="section">
        <p className="help" style={{ marginTop: 0 }}>
          記録・計画・メンバー・設定を、誰が・いつ・どう変えたかの記録です。誰にも消したり書き換えたりできません。
          {local && (supabase ? ' いまは、この端末で行った操作だけを出しています。' : ' サンプルでは、この端末で行った操作を出しています。')}
        </p>
        {error && (
          <div className="stack">
            <p className="ai-error" role="alert">{error}</p>
            {supabase && !local && (
              <button type="button" className="btn btn--outline btn--block" onClick={() => { setRows([]); setPage(0); setLocal(true); }}>
                この端末の記録だけを見る
              </button>
            )}
          </div>
        )}
        <div className="card">
          {!loading && rows.length === 0 && !error && <span className="muted">まだありません。</span>}
          {rows.map((r) => {
            const d = detail(r);
            return (
              <div key={r.id} className="today-row stack" style={{ gap: 2 }}>
                <span>
                  <strong>{r.action === 'export' ? '記録' : ENTITY_LABEL[r.entity] ?? r.entity}</strong>
                  {ACTION_LABEL[r.action] ?? ` ${r.action}`}
                </span>
                <span className="muted">{formatDateTimeJa(r.at)} ・ {nameOf(r.actorId)}</span>
                {d && <span className="muted">{d}</span>}
              </div>
            );
          })}
          {loading && <span className="muted">読み込み中…</span>}
        </div>
        {more && !loading && (
          <button type="button" className="btn btn--outline btn--block" style={{ marginTop: 8 }} onClick={() => setPage((p) => p + 1)}>
            もっと見る
          </button>
        )}
      </div>
      {supabase && <ViewDays personId={person.id} nameOf={nameOf} />}
    </div>
  );
}

/** 閲覧の記録（チームを開いた日・直近30日）。決定102 */
function ViewDays({ personId, nameOf }: { personId: string; nameOf: (uid: string) => string }) {
  const [days, setDays] = useState<ViewDay[] | null | undefined>(undefined);
  useEffect(() => {
    let stop = false;
    void listViewDays(personId, addDays(toLocalDate(), -29)).then((d) => !stop && setDays(d));
    return () => {
      stop = true;
    };
  }, [personId]);
  const byDate = new Map<string, ViewDay[]>();
  for (const d of days ?? []) byDate.set(d.localDate, [...(byDate.get(d.localDate) ?? []), d]);
  return (
    <div className="section">
      <div className="card">
        <h2 className="card__title">閲覧の記録（チームを開いた日・直近30日）</h2>
        <p className="help" style={{ marginTop: 0 }}>
          誰が、どの日にこのチームを開いたかを、1人1日1回だけ残しています。どの画面を見たかは残していません。
        </p>
        {days === undefined && <span className="muted">読み込み中…</span>}
        {days === null && <span className="muted">読めませんでした（通信を確かめてください）。</span>}
        {days && days.length === 0 && <span className="muted">まだありません。</span>}
        {[...byDate].map(([date, list]) => (
          <div key={date} className="today-row stack" style={{ gap: 2 }}>
            <strong>{formatDateJa(date)}</strong>
            <span className="muted">{list.map((v) => nameOf(v.userId)).join('、')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
