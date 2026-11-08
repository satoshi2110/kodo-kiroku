/**
 * 初回セットアップ（7.1、ワイヤーフレーム 16）。5つのステップ:
 * 1 コードと同意 → 2 あなたと対象者（呼び名は必須、ほかは任意）→ 3 行動を1つ（行動の追加の画面）→ 4 場所と「わたしのいつもの時間」（あとでも可。場所の画面）→ 5 最初の記録（ホームで案内）。
 * サーバーにつながる設定があるとき（ログインしている）は、先に開始コード・招待コードを確かめ、そのあとで同意を取る（7.1）。
 * チームを作るときは、運営が発行した開始コードでサーバーにチームを作る（決定44）。
 * 招待された人は、ここで招待コードを入れて参加し、管理者・副管理者・支援リーダーの承認を待つ（7.4.2 #3）。
 * 招待で参加した人は、承認されたら場所と「わたしのいつもの時間」だけを案内する（7.1）。
 */
import { QrScan } from '../components/QrScan';
import { InvitePreview, useInvitePreview } from '../components/InvitePreview';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../state';
import { db } from '../db/db';
import { canEditPlaces, saveDevice, setupTeam } from '../db/repo';
import { supabase } from '../server/supabase';
import { runSync } from '../server/sync';
import { signOut } from '../server/session';
import { createSampleTeam } from '../db/sample';
import { AFFILIATION_LABEL, CONSENT_TEXT_VERSION, type Affiliation, type Role } from '../db/types';
import { Chip, TopBar } from '../components/ui';
import { clearInviteCode, pendingInviteCode } from '../lib/inviteLink';

export default function Setup() {
  const [step, setStep] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [userName, setUserName] = useState('');
  const [affiliation, setAffiliation] = useState<Affiliation>('family');
  const [personName, setPersonName] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [belongs, setBelongs] = useState('');
  const [cautions, setCautions] = useState('');
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState(pendingInviteCode);
  // コードを確かめたか（null = まだ、true = 使える、false = 使えない）。ログインしないで使うときは要らない
  const [codeOk, setCodeOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const preview = useInvitePreview(codeOk ? code : '');
  async function checkCode(c: string) {
    if (!supabase || !c.trim()) return;
    setChecking(true);
    const { data, error } = await supabase.rpc('signup_code_ok', { p_code: c });
    setCodeOk(!error && data === true);
    setChecking(false);
  }
  // 招待リンクのコードか、アカウントを作るときに入れたコードがあれば、最初から入れて確かめておく
  useEffect(() => {
    const fromLink = pendingInviteCode();
    if (fromLink) checkCode(fromLink);
    else prefillSignupCode((c) => (setCode(c), checkCode(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const consentOpen = !supabase || codeOk === true;
  const [error, setError] = useState<string | null>(null);
  const { person, userId } = useApp();
  // 招待で参加して、承認を待っているチーム
  const waiting = useLiveQuery(
    async () => (userId ? (await db.teamMembers.where('userId').equals(userId).toArray()).filter((m) => m.approvedAt === null && !m.deletedAt) : []),
    [userId],
  );
  // 停止されたチーム（7章 #2）。そのチームのデータはこの端末から消してある
  const stopped = useLiveQuery(
    async () => (userId ? (await db.teamMembers.where('userId').equals(userId).toArray()).filter((m) => m.suspendedAt && !m.deletedAt).length : 0),
    [userId],
  );
  // 承認を待っているあいだに承認されたら、場所といつもの時間の案内へ（登録できる役割のときだけ）
  const joinedRole = useRef<Role | null>(null);
  if (waiting?.length) joinedRole.current = waiting[0].role;
  // 保存が反映されたら行動の追加へ。済んでいる端末で開いたときはホームへ
  if (person) return <Navigate to={saving ? '/behaviors/new?from=setup' : joinedRole.current && canEditPlaces(joinedRole.current) ? '/places?from=join' : '/'} replace />;

  // 作り終わると対象者ができ、上の Navigate でホームへ移る
  // 失敗したときは理由を出す（黙って何も起きないと、押した人が困るため）
  const sample = async () => {
    setError(null);
    try {
      await createSampleTeam();
    } catch (e) {
      console.error(e);
      setError(`サンプルを作れませんでした: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`);
    }
  };

  async function save() {
    setSaving(true);
    setError(null);
    if (supabase) {
      // 開始コードを確かめて、サーバーにチームを作る。できたら受け取って開く
      const { data, error } = await supabase.rpc('create_team', {
        p_code: code,
        p_person_name: personName.trim(),
        p_birth_month: birthMonth || null,
        p_belongs: belongs.trim(),
        p_cautions: cautions.trim(),
        p_member_name: userName.trim(),
        p_affiliation: affiliation,
        p_consent_version: CONSENT_TEXT_VERSION,
      });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      clearInviteCode();
      await runSync();
      await saveDevice({ currentPersonId: data as string });
      return;
    }
    await setupTeam({
      userName: userName.trim(),
      affiliation,
      personName: personName.trim(),
      birthMonth: birthMonth || null,
      belongs: belongs.trim(),
      cautions: cautions.trim(),
    });
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="はじめに" sub={`ステップ ${step} / 5 ・ 約10分`} />
      <ol className="steps section" aria-label="このあとの流れ">
        {[supabase ? 'コードと同意' : '同意', '対象者', '行動を1つ', '場所と時間', '最初の記録'].map((t, i) => (
          <li key={t} className={i + 1 === step ? 'steps__on' : i + 1 < step ? 'steps__done' : ''}>{i + 1} {t}</li>
        ))}
      </ol>
      {!!stopped && (waiting ?? []).length === 0 && (
        <div className="section">
          <div className="card stack">
            <span className="card__title">チームでの利用が止められました</span>
            <p className="help">
              参加していたチームの管理者か支援リーダーが、あなたの利用を止めました。この端末に残っていたそのチームの記録は消しました。
              続けて使うときは、そのチームの管理者か支援リーダーに聞いてください。
            </p>
          </div>
        </div>
      )}
      {(waiting ?? []).length > 0 && (
        <div className="section">
          <div className="card stack">
            <span className="card__title">承認を待っています</span>
            <p className="help">
              招待コードで参加しました。管理者・副管理者・支援リーダーが承認すると、記録が見られるようになります。
            </p>
            <button type="button" className="btn btn--outline btn--block" onClick={() => runSync()}>もう一度確かめる</button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="section stack">
          {supabase && (
            <div className="card stack">
              <span className="card__title">はじめに、コードを確かめます</span>
              <label className="field">
                開始コード または 招待コード
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeOk(null);
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </label>
              {codeOk !== true && <QrScan onCode={(c) => { setCode(c); checkCode(c); }} />}
              <p className="help">新しいチームを作る保護者の方は運営から受け取った「開始コード」を、招待された人は招待した人から受け取った「招待コード」を入れます。招待した人の QR は「QR を読む」で読めます。</p>
              {codeOk === true && (preview ? <InvitePreview info={preview} /> : <p className="notice-inline" role="status">使えるコードです。</p>)}
              {codeOk === true && <p className="help">下の内容を読んで、同意してください。</p>}
              {codeOk === false && (
                <p className="ai-error" role="alert">このコードは使えません（まちがい・使用済み・期限切れ）。コードを確かめるか、渡した人に聞いてください。</p>
              )}
              {codeOk !== true && (
                <button type="button" className="btn btn--primary btn--block" disabled={!code.trim() || checking} onClick={() => checkCode(code)}>
                  コードを確かめる
                </button>
              )}
            </div>
          )}
          <div className={`card stack${consentOpen ? '' : ' card--muted'}`} aria-disabled={!consentOpen}>
            <span className="card__title">このアプリで扱う情報について（下書き）</span>
            <p className="help">
              このアプリには、障害に関わる情報（要配慮個人情報）を記録します。記録はチームに招待した人だけが見られます。
              本人の実名は必要ありません。呼び名やイニシャルで使えます。支援者がいまどこにいるかの位置は保存しません。
              AI の機能は初めは「なし」です。
            </p>
            <p className="help">利用規約とプライバシーポリシーは、試用を始める前に専門家の確認を受けて差し替えます。</p>
            <label className="row">
              <input type="checkbox" checked={agreed} disabled={!consentOpen} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span className="label">内容を読み、同意します</span>
            </label>
            {!consentOpen && <p className="help">コードを確かめると、同意に進めます。</p>}
          </div>
          <button type="button" className="btn btn--primary btn--block" disabled={!agreed || !consentOpen} onClick={() => setStep(2)}>
            {supabase ? '新しいチームを作る（開始コードのとき）' : '次へ'}
          </button>
          {supabase && (
            <button type="button" className="btn btn--outline btn--block" disabled={!agreed || !consentOpen} onClick={() => setStep(9)}>
              チームに参加する（招待コードのとき）
            </button>
          )}
          <div className="card stack">
            <span className="card__title">お試し・審査用</span>
            <p className="help">架空の対象者「サンプルさん」と3週間分の記録を、この端末の中に作ります。グラフ・ABC分析・AI分析をすぐに試せます。</p>
            <button type="button" className="btn btn--outline btn--block" disabled={!agreed || saving} onClick={sample}>サンプルで試す</button>
            {error && <p className="ai-error" role="alert">{error}</p>}
          </div>
        </div>
      )}
      {step === 9 && <Join code={code} userName={userName} setUserName={setUserName} affiliation={affiliation} setAffiliation={setAffiliation} onBack={() => setStep(1)} />}
      {step === 2 && (
        <div className="section stack">
          <div className="card stack">
            {supabase && <p className="help">開始コード {code.trim().toUpperCase()} で、新しいチームを作ります。開始コードは1つで1チーム（対象者1人）です。</p>}
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
              記録する人（対象者）の呼び名（必須）
              <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="例: Aさん" />
            </label>
            <p className="help">本名でなくてかまいません。ニックネームやイニシャルで登録できます。</p>
            <label className="field">
              生まれた年と月（任意）
              <input type="month" value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} />
            </label>
            <label className="field">
              通っているところ（任意）
              <input value={belongs} onChange={(e) => setBelongs(e.target.value)} placeholder="例: 生活介護、特別支援学校" />
            </label>
            <label className="field">
              苦手なこと・気をつけること（任意）
              <textarea value={cautions} onChange={(e) => setCautions(e.target.value)} placeholder="例: 大きな音、急な予定の変更" />
            </label>
            <p className="help">登録したあなたが、このチームの管理者になります。好きなもの（強化子）は、あとで写真付きで登録できます。</p>
          </div>
          {error && <p className="ai-error" role="alert">{error}</p>}
          <div className="grid-2">
            <button type="button" className="btn" onClick={() => setStep(1)}>戻る</button>
            <button type="button" className="btn btn--primary" disabled={!userName.trim() || !personName.trim() || (!!supabase && !code.trim()) || saving} onClick={save}>
              次へ: 行動を1つ決める
            </button>
          </div>
        </div>
      )}
      {supabase && (
        <div className="section">
          <button type="button" className="btn btn--block" onClick={() => signOut()}>ログアウト</button>
        </div>
      )}
    </div>
  );
}

/** アカウントを作るときに入れたコード（0014）を、開始コード・招待コードの欄に最初から入れておく */
function prefillSignupCode(set: (c: string) => void) {
  supabase?.auth.getSession().then(({ data }) => {
    const c = data.session?.user.user_metadata?.invite_code;
    if (typeof c === 'string' && c) set(c);
  });
}

/** 招待コードで参加する（ワイヤーフレーム 12「招待リンクから開いたとき」） */
function Join(props: {
  code: string;
  userName: string;
  setUserName: (v: string) => void;
  affiliation: Affiliation;
  setAffiliation: (a: Affiliation) => void;
  onBack: () => void;
}) {
  const invite = props.code;
  const preview = useInvitePreview(invite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('join_team', {
      p_code: invite,
      p_member_name: props.userName.trim(),
      p_affiliation: props.affiliation,
      p_consent_version: CONSENT_TEXT_VERSION,
    });
    if (error) setError(error.message);
    else {
      clearInviteCode();
      await runSync();
      props.onBack();
    }
    setBusy(false);
  }
  return (
    <div className="section stack">
      <div className="card stack">
        <p className="help">招待コード {invite.trim().toUpperCase()} で、チームに参加します。</p>
        <InvitePreview info={preview} />
        <label className="field">
          あなたの呼び名（チームの人に表示されます）
          <input value={props.userName} onChange={(e) => props.setUserName(e.target.value)} placeholder="例: 〇〇先生" />
        </label>
        <span className="label">あなたの所属</span>
        <div className="chips">
          {(Object.keys(AFFILIATION_LABEL) as Affiliation[]).map((a) => (
            <Chip key={a} on={props.affiliation === a} onClick={() => props.setAffiliation(a)}>{AFFILIATION_LABEL[a]}</Chip>
          ))}
        </div>
        <p className="help">参加したあと、管理者か支援リーダーが承認すると記録が見られます。役割は招待した人が決めています。</p>
        {error && <p className="ai-error" role="alert">{error}</p>}
      </div>
      <div className="grid-2">
        <button type="button" className="btn" onClick={props.onBack}>戻る</button>
        <button type="button" className="btn btn--primary" disabled={!invite.trim() || !props.userName.trim() || busy} onClick={join}>参加する</button>
      </div>
    </div>
  );
}
