/**
 * インターバル記録・時間サンプリングの観察画面（6.3.1、決定28）。
 * 区間ごとの結果を ○（起きた）×（起きなかった）で横一列に並べ、区間の残り時間をバーで示す（残り 20% を切ると赤）。
 * 区間が終わると画面の枠が光り「記録してください」と出す（対応端末は振動も）。観察中は画面を消さない（Wake Lock）。
 * - インターバル（部分インターバル）: 区間の途中でも「○ 起きた」を押せる。押した区間は終わったときに ○ になる
 * - 時間サンプリング（固定間隔のみ）: 区切りの瞬間に起きているかを ○× で答える
 * - 答えないまま次の区間も終わった区間と、画面を消した・ほかのアプリにいた間の区間は「未観察」にする（推測で埋めない）
 * - 【暫定】（2026-11-07 の試作）押し間違えたら「直前の区間を取り消す」で、いちばん新しく答えた区間だけを答え直せる。
 *   次の区間が終わるまでに答え直さないと「未観察」になる。未観察の区間は取り消せない（あとから埋めない）
 *   今の区間に先に付けた「起きた」の印は、答え直せば残る。答え直さないまま今の区間も終わると、取り消した区間は未観察、
 *   今の区間の印は消えて、もう一度聞く
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { canRecord, endObservation, observedRatio, saveObservationResults, startObservation } from '../db/repo';
import { useApp } from '../state';
import { formatDuration } from '../lib/date';
import { METHOD_LABEL, type IntervalResult, type Observation } from '../db/types';
import { KindBadge, TopBar } from '../components/ui';

const MARK: Record<IntervalResult, string> = { yes: '○', no: '×', missed: '－' };

export default function Observe() {
  const { behaviorId } = useParams();
  const { behaviors, me, userId } = useApp();
  const nav = useNavigate();
  const b = behaviors.find((x) => x.id === behaviorId);
  const [obs, setObs] = useState<Observation | null>(null);
  const [results, setResults] = useState<IntervalResult[]>([]);
  const [preMarked, setPreMarked] = useState(false); // インターバル: 今の区間で「起きた」を押した
  const [now, setNow] = useState(Date.now());
  const state = useRef({ obs, results, preMarked });
  state.current = { obs, results, preMarked };

  const running = !!obs;
  const lenMs = (obs?.intervalSec ?? 0) * 1000;
  const startMs = obs ? new Date(obs.startedAt).getTime() : 0;
  const idx = running ? Math.floor((now - startMs) / lenMs) : 0; // 終わった区間の数
  const pending = running && results.length < idx; // 答えを待っている区間がある

  // 時計
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [running]);

  // 区間が終わったときの処理
  const lastIdx = useRef(0);
  useEffect(() => {
    if (!obs || idx <= lastIdx.current) return;
    lastIdx.current = idx;
    navigator.vibrate?.([80, 80, 80]);
    // 更新関数の中では読まない（開発時は2回呼ばれ、2回目には印が消えているため）
    const { results: prev, preMarked: marked } = state.current;
    const next = [...prev];
    // インターバルで「起きた」を押していた区間は ○ で確定
    if (obs.method === 'interval' && marked && next.length === idx - 1) next.push('yes');
    // 答えないまま次の区間も終わったものは未観察
    while (next.length < idx - 1) next.push('missed');
    if (next.length !== prev.length) {
      setResults(next);
      saveObservationResults(obs.id, next);
    }
    setPreMarked(false);
  }, [idx, obs]);

  // 画面を消した・ほかのアプリにいた間に終わった区間は未観察にする。戻ったら画面の点灯維持を取り直す
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!obs) return;
    const requestLock = async () => {
      try {
        lock.current = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        lock.current = null; // 使えない端末では、画面の設定で消えないようにしてもらう
      }
    };
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt != null) {
        const t = Date.now();
        const ended = Math.floor((t - startMs) / lenMs);
        const endedBeforeHide = Math.floor((hiddenAt - startMs) / lenMs);
        if (ended > endedBeforeHide) {
          const next = [...state.current.results];
          while (next.length < ended) next.push('missed');
          setResults(next);
          saveObservationResults(obs.id, next);
          setPreMarked(false);
          lastIdx.current = ended;
        }
        hiddenAt = null;
        setNow(t);
      }
      requestLock();
    };
    requestLock();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [obs, startMs, lenMs]);

  // 画面を離れたら観察を終える（答えた分は残る）
  useEffect(
    () => () => {
      const { obs: o, results: r } = state.current;
      if (o && userId) endObservation(o.id, r, userId);
    },
    [userId],
  );

  if (!b || !userId) return null;
  if (b.method !== 'interval' && b.method !== 'sampling') return null;
  const recordable = canRecord(me?.role);

  async function start() {
    if (!b || !userId) return;
    // 前に閉じ忘れた観察があれば、答えた分のまま終える
    const open = await db.observations.where('behaviorId').equals(b.id).filter((o) => !o.endedAt && !o.deletedAt).toArray();
    for (const o of open) await endObservation(o.id, o.results, userId);
    const o = await startObservation(b, userId);
    lastIdx.current = 0;
    setResults([]);
    setPreMarked(false);
    setNow(Date.now());
    setObs(o);
  }

  function answer(r: 'yes' | 'no') {
    if (!obs) return;
    if (pending) {
      const next = [...results];
      next.push(r);
      setResults(next);
      saveObservationResults(obs.id, next);
      return;
    }
    // 待っている区間がないとき: インターバルは今の区間に「起きた」の印を付ける（押し直しで外す）
    if (obs.method === 'interval' && r === 'yes') setPreMarked((v) => !v);
  }

  // 直前の区間を取り消す: いちばん新しく終わった区間に答えていて、それが未観察でないときだけ
  const canUndo = running && results.length > 0 && results.length === idx && results[results.length - 1] !== 'missed';
  function undoLast() {
    if (!obs || !canUndo) return;
    const next = results.slice(0, -1);
    setResults(next);
    saveObservationResults(obs.id, next);
  }

  async function finish() {
    const o = obs;
    if (!o || !userId) return;
    const final = [...results];
    if (pending) final.push('missed'); // 答えていない区間
    // 途中の区間: インターバルで「起きた」を押していれば ○（部分インターバル）。押していなければ数えない
    if (o.method === 'interval' && preMarked && final.length === idx) final.push('yes');
    setObs(null);
    await endObservation(o.id, final, userId);
    nav('/', { replace: true });
  }

  const elapsedInInterval = running ? (now - startMs) % lenMs : 0;
  const remainMs = lenMs - elapsedInInterval;
  const remainRate = running ? remainMs / lenMs : 1;
  const ratio = observedRatio(obs ? [{ ...obs, results }] : []);
  const isSampling = b.method === 'sampling';
  const lenLabel = isSampling ? `${b.samplingMin ?? 5}分` : `${b.intervalSec ?? 10}秒`;

  return (
    <div className={`page page--no-nav obs-page${pending ? ' obs-page--alert' : ''}`}>
      <TopBar title={METHOD_LABEL[b.method]} sub={b.name} back={running ? undefined : '/'} />

      {!running && (
        <div className="section stack">
          <div className="card stack">
            <div className="row">
              <KindBadge kind={b.kind} />
              <strong>{b.name}</strong>
            </div>
            {b.definition && <p className="help">{b.definition}</p>}
            <p>
              区間の長さ: <strong>{lenLabel}</strong>
            </p>
            <p className="help">
              {isSampling
                ? '区切りごとに画面の枠が光ります。その瞬間に行動が起きているかを ○× で答えてください。'
                : '区間の途中で行動が起きたら「○ 起きた」を押します。押さなかった区間は、区切りで ○× を答えてください。'}
            </p>
            <p className="help">観察中は画面を消さないでください。画面を消したり、ほかのアプリに切り替えたりした間の区間は「未観察」になります。</p>
          </div>
          <button type="button" className="btn btn--primary btn--block" disabled={!recordable} onClick={start}>
            観察を始める
          </button>
          {!recordable && <p className="help">閲覧者は記録できません。</p>}
        </div>
      )}

      {running && (
        <div className="section stack">
          <div className="card stack">
            <div className="row row--between">
              <span className="label">区間 {idx + 1}</span>
              <span className="muted">残り {formatDuration(Math.ceil(remainMs / 1000))}</span>
            </div>
            <div className="obs-bar" role="progressbar" aria-valuenow={Math.round(remainRate * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="区間の残り時間">
              <div className={`obs-bar__fill${remainRate < 0.2 ? ' obs-bar__fill--low' : ''}`} style={{ width: `${remainRate * 100}%` }} />
            </div>
            <ResultRow results={results} pending={pending} current={obs.method === 'interval' && preMarked ? 'yes' : null} />
            <p className="help">
              ○ 起きた ・ × 起きなかった ・ － 未観察
              {ratio != null && <> ／ 起きた区間 {ratio}%</>}
            </p>
          </div>

          <p className={`obs-prompt${pending ? ' obs-prompt--on' : ''}`} role="status">
            {pending ? `区間 ${results.length + 1} を記録してください` : isSampling ? '次の区切りを待っています' : preMarked ? 'この区間は「起きた」になります' : '観察しています'}
          </p>

          <div className="grid-2">
            <button type="button" className="btn obs-btn obs-btn--yes" disabled={!pending && isSampling} onClick={() => answer('yes')}>
              ○ 起きた
            </button>
            <button type="button" className="btn obs-btn" disabled={!pending} onClick={() => answer('no')}>
              × 起きなかった
            </button>
          </div>
          {canUndo && (
            <button type="button" className="btn btn--outline btn--block" onClick={undoLast}>
              直前の区間（区間 {results.length}）を取り消して答え直す
            </button>
          )}
          <button type="button" className="btn btn--block" onClick={finish}>
            観察を終える
          </button>
        </div>
      )}
    </div>
  );
}

function ResultRow({ results, pending, current }: { results: IntervalResult[]; pending: boolean; current: 'yes' | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ left: ref.current.scrollWidth });
  }, [results.length, pending]);
  return (
    <div className="obs-row" ref={ref}>
      {results.map((r, i) => (
        <span key={i} className={`obs-cell obs-cell--${r}`} aria-label={`区間 ${i + 1}: ${r === 'yes' ? '起きた' : r === 'no' ? '起きなかった' : '未観察'}`}>
          {MARK[r]}
        </span>
      ))}
      {pending && <span className="obs-cell obs-cell--pending" aria-label="記録を待っている区間">？</span>}
      <span className="obs-cell obs-cell--current" aria-label="いまの区間">{current ? MARK.yes : '…'}</span>
    </div>
  );
}
