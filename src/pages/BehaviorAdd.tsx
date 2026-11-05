/**
 * 行動の追加（6.2、ワイヤーフレーム 7）。
 * 1 種類と名前・定義 → 2 測定方法ナビ（4つの質問、決定17）→ 3 強度と確認
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../state';
import { createBehavior } from '../db/repo';
import {
  FUNCTION_LABEL,
  INTENSITY_NAMES,
  KIND_LABEL,
  METHOD_HELP,
  METHOD_LABEL,
  type BehaviorFunction,
  type BehaviorKind,
  type Method,
} from '../db/types';
import { Chip, TopBar } from '../components/ui';

const QUESTIONS: { q: string; yes: Method | null }[] = [
  { q: '声かけや合図のあと、動き出すまでに何秒かかるかを見たいですか？', yes: 'latency' },
  { q: '1回あたり何分続いたか、合計の時間を見たいですか？', yes: 'duration' },
  { q: '「1回」の区切りが分かりやすく、起きた回数を数えられる行動ですか？', yes: 'frequency' },
  { q: '記録する間、ほかの用事をせずに本人をずっと見ていられますか？', yes: 'interval' },
];

export default function BehaviorAdd() {
  const { person, behaviors, userId } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const fromSetup = params.get('from') === 'setup';

  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<BehaviorKind>('problem');
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState('');
  const [examples, setExamples] = useState('');
  const [nonExamples, setNonExamples] = useState('');
  const [replacesId, setReplacesId] = useState<string | null>(null);
  const [func, setFunc] = useState<BehaviorFunction | null>(null);

  const [qIndex, setQIndex] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [intervalSec, setIntervalSec] = useState(10);
  const [samplingMin, setSamplingMin] = useState(5);

  const [useIntensity, setUseIntensity] = useState(false);
  const [levels, setLevels] = useState<3 | 5>(3);
  const [criteria, setCriteria] = useState<string[]>(['', '', '', '', '']);
  const [saving, setSaving] = useState(false);

  if (!person || !userId) return null;
  const problems = behaviors.filter((b) => b.kind === 'problem');

  function answer(yes: boolean) {
    const q = QUESTIONS[qIndex];
    if (yes && q.yes) return setMethod(q.yes);
    if (qIndex === 3) return setMethod(yes ? 'interval' : 'sampling');
    setQIndex(qIndex + 1);
  }

  async function save() {
    if (!person || !userId || !method) return;
    setSaving(true);
    await createBehavior(
      {
        personId: person.id,
        kind,
        name: name.trim(),
        definition: definition.trim(),
        examples: examples.trim(),
        nonExamples: nonExamples.trim(),
        method,
        intervalSec: method === 'interval' ? intervalSec : null,
        samplingMin: method === 'sampling' ? samplingMin : null,
        intensity: useIntensity ? { levels, criteria: criteria.slice(0, levels).map((c) => c.trim()) } : null,
        replacesBehaviorId: kind === 'alternative' ? replacesId : null,
        func: kind === 'alternative' ? func : null,
      },
      userId,
    );
    nav(fromSetup ? '/places?from=setup' : '/behaviors', { replace: true });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="行動の追加" sub={`ステップ ${step} / 3`} back={fromSetup || step > 1 ? undefined : '/behaviors'} />

      {step === 1 && (
        <div className="section stack">
          {fromSetup && <p className="help">はじめての設定 3 / 5: まず1つ、記録したい行動を決めましょう。あとから増やせます。</p>}
          <div className="card stack">
            <span className="label">種類</span>
            <div className="chips">
              {(Object.keys(KIND_LABEL) as BehaviorKind[]).map((k) => (
                <Chip key={k} on={kind === k} problem={k === 'problem'} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]}
                </Chip>
              ))}
            </div>
            <p className="help">
              {kind === 'problem' && '減らしたい行動です。'}
              {kind === 'desirable' && '増やしたい行動です（例: 自分から着替える）。'}
              {kind === 'alternative' && '問題行動と同じ目的を、より適切な方法で満たす行動です（例: 休憩カードを渡す）。'}
            </p>
            <label className="field">
              行動の名前
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 頭たたき" />
            </label>
            <label className="field">
              どんな行動か（誰が見ても同じに判断できるように）
              <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="例: 手のひらやこぶしで自分の頭をたたく" />
            </label>
            <label className="field">
              例（任意）
              <input value={examples} onChange={(e) => setExamples(e.target.value)} />
            </label>
            <label className="field">
              含まないもの（任意）
              <input value={nonExamples} onChange={(e) => setNonExamples(e.target.value)} placeholder="例: 髪をなでる" />
            </label>
          </div>
          {kind === 'alternative' && (
            <div className="card stack">
              <span className="label">どの問題行動の代わりですか？（任意）</span>
              {problems.length === 0 ? (
                <p className="help">まだ問題行動がありません。あとから設定できます。</p>
              ) : (
                <div className="chips">
                  {problems.map((p) => (
                    <Chip key={p.id} on={replacesId === p.id} onClick={() => setReplacesId(replacesId === p.id ? null : p.id)}>
                      {p.name}
                    </Chip>
                  ))}
                </div>
              )}
              <span className="label">どの目的（機能）に合わせますか？（任意）</span>
              <div className="chips">
                {(Object.keys(FUNCTION_LABEL) as BehaviorFunction[]).map((f) => (
                  <Chip key={f} on={func === f} onClick={() => setFunc(func === f ? null : f)}>
                    {FUNCTION_LABEL[f]}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn btn--primary btn--block" disabled={!name.trim()} onClick={() => setStep(2)}>
            次へ: 測り方を決める
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="section stack">
          {!method ? (
            <div className="card stack">
              <span className="wizard-step">質問 {qIndex + 1} / 4</span>
              <p className="h">{QUESTIONS[qIndex].q}</p>
              <div className="grid-2">
                <button type="button" className="btn btn--primary" onClick={() => answer(true)}>はい</button>
                <button type="button" className="btn btn--outline" onClick={() => answer(false)}>いいえ</button>
              </div>
              {qIndex > 0 && (
                <button type="button" className="btn btn--sm" onClick={() => setQIndex(qIndex - 1)}>前の質問に戻る</button>
              )}
            </div>
          ) : (
            <div className="card stack done-box">
              <span className="card__title">おすすめの測り方</span>
              <p className="h">{METHOD_LABEL[method]}</p>
              <p className="help">{METHOD_HELP[method]}</p>
            </div>
          )}
          <div className="card stack">
            <span className="label">質問に答えずに選ぶこともできます</span>
            <div className="chips">
              {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                <Chip key={m} on={method === m} onClick={() => setMethod(m)}>
                  {METHOD_LABEL[m]}
                </Chip>
              ))}
            </div>
            {method === 'interval' && (
              <label className="field">
                区間の長さ（5〜60秒）
                <input type="number" min={5} max={60} value={intervalSec} onChange={(e) => setIntervalSec(clamp(+e.target.value, 5, 60))} />
              </label>
            )}
            {method === 'sampling' && (
              <label className="field">
                知らせる間隔（1〜30分）
                <input type="number" min={1} max={30} value={samplingMin} onChange={(e) => setSamplingMin(clamp(+e.target.value, 1, 30))} />
              </label>
            )}
          </div>
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => { setMethod(null); setQIndex(0); setStep(1); }}>戻る</button>
            <button type="button" className="btn btn--primary" disabled={!method} onClick={() => setStep(3)}>次へ</button>
          </div>
        </div>
      )}

      {step === 3 && method && (
        <div className="section stack">
          <div className="card stack">
            <label className="row">
              <input type="checkbox" checked={useIntensity} onChange={(e) => setUseIntensity(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span className="label">強度（どのくらい激しかったか）も記録する</span>
            </label>
            {useIntensity && (
              <>
                <div className="chips">
                  <Chip on={levels === 3} onClick={() => setLevels(3)}>3段階</Chip>
                  <Chip on={levels === 5} onClick={() => setLevels(5)}>5段階</Chip>
                </div>
                <p className="help">段階ごとに、見て分かる基準を書いてください。誰が記録しても同じ判断になるようにするためです。</p>
                {INTENSITY_NAMES[levels].map((label, i) => (
                  <label key={i} className="field">
                    {i + 1}: {label}
                    <input
                      value={criteria[i]}
                      onChange={(e) => setCriteria(criteria.map((c, j) => (j === i ? e.target.value : c)))}
                      placeholder={i === 0 ? '例: 1〜2回で止まる・赤みなし' : ''}
                    />
                  </label>
                ))}
              </>
            )}
          </div>
          <div className="card stack">
            <span className="card__title">確認</span>
            <div className="row"><span className={`badge badge--${kind}`}>{KIND_LABEL[kind]}</span><strong>{name}</strong></div>
            <span className="muted">測り方: {METHOD_LABEL[method]}{useIntensity ? ` ・ 強度 ${levels}段階` : ''}</span>
            {definition && <span className="muted">{definition}</span>}
          </div>
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setStep(2)}>戻る</button>
            <button type="button" className="btn btn--primary" disabled={saving} onClick={save}>追加する</button>
          </div>
        </div>
      )}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
