/**
 * 初回セットアップ（7.1、ワイヤーフレーム 16）。
 * 同意 → あなたと対象者の呼び名 → 行動を1つ（行動の追加の画面へ）。
 * 開始コードの確認（決定44）と「場所といつもの時間」はサーバー・場所の登録ができてから足す。
 */
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../state';
import { setupTeam } from '../db/repo';
import { createSampleTeam } from '../db/sample';
import { AFFILIATION_LABEL, type Affiliation } from '../db/types';
import { Chip, TopBar } from '../components/ui';

export default function Setup() {
  const [step, setStep] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [userName, setUserName] = useState('');
  const [affiliation, setAffiliation] = useState<Affiliation>('family');
  const [personName, setPersonName] = useState('');
  const [saving, setSaving] = useState(false);
  const { person } = useApp();
  // 保存が反映されたら行動の追加へ。済んでいる端末で開いたときはホームへ
  if (person) return <Navigate to={saving ? '/behaviors/new?from=setup' : '/'} replace />;

  // 作り終わると対象者ができ、上の Navigate でホームへ移る
  const sample = () => createSampleTeam();

  async function save() {
    setSaving(true);
    await setupTeam({ userName: userName.trim(), affiliation, personName: personName.trim() });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="はじめに" sub={`ステップ ${step} / 3`} />
      {step === 1 && (
        <div className="section stack">
          <div className="card stack">
            <span className="card__title">このアプリで扱う情報について（下書き）</span>
            <p className="help">
              このアプリには、障害に関わる情報（要配慮個人情報）を記録します。記録はチームに招待した人だけが見られます。
              本人の実名は必要ありません。呼び名やイニシャルで使えます。支援者がいまどこにいるかの位置は保存しません。
              AI の機能は初めは「なし」です。
            </p>
            <p className="help">利用規約とプライバシーポリシーは、試用を始める前に専門家の確認を受けて差し替えます。</p>
            <label className="row">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span className="label">内容を読み、同意します</span>
            </label>
          </div>
          <button type="button" className="btn btn--primary btn--block" disabled={!agreed} onClick={() => setStep(2)}>次へ</button>
          <div className="card stack">
            <span className="card__title">お試し・審査用</span>
            <p className="help">架空の対象者「サンプルさん」と3週間分の記録を、この端末の中に作ります。グラフ・ABC集計・AI分析をすぐに試せます。</p>
            <button type="button" className="btn btn--outline btn--block" disabled={!agreed || saving} onClick={sample}>サンプルで試す</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="section stack">
          <div className="card stack">
            <label className="field">
              あなたの呼び名（チームの人に表示されます）
              <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="例: 母" />
            </label>
            <span className="label">あなたの所属</span>
            <div className="chips">
              {(Object.keys(AFFILIATION_LABEL) as Affiliation[]).map((a) => (
                <Chip key={a} on={affiliation === a} onClick={() => setAffiliation(a)}>{AFFILIATION_LABEL[a]}</Chip>
              ))}
            </div>
            <label className="field">
              記録する人（対象者）の呼び名
              <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="例: Aさん" />
            </label>
            <p className="help">登録したあなたが、このチームの管理者になります。</p>
          </div>
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setStep(1)}>戻る</button>
            <button type="button" className="btn btn--primary" disabled={!userName.trim() || !personName.trim() || saving} onClick={save}>
              次へ: 行動を1つ決める
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
