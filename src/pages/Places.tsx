/**
 * 場所の登録（6.3.3、画面一覧 5、ワイヤーフレーム 11）。ホーム上部の場所ボタンから開く。
 * 「いまここを登録」は、この端末の位置を1回だけ取って中心にする。「住所で探す」は国土地理院で住所から中心を決め、地図のピンで直せる（決定85）。
 * 住所の文字は中心を探すのに使うだけで保存しない（自宅の住所が一覧に出ることもない）。地図は「いまここ」には出さない（現在地を地図サービスに送らないため）。削除は非表示で、過去の記録に付いた場所名は残る。
 * 「わたしのいつもの時間」は記録者ごとの勤務・在宅時間の目安で、グラフの「1時間あたりの回数」の観察時間の推定に使う。
 * チームの全員の分を見られ、直せるのは自分の分だけ。
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { canEditPlaces, deleteSchedule, hidePlace, latestSchedules, savePlace, saveDevice, saveSchedule, setPlaceChoice, type ScheduleInput } from '../db/repo';
import { useApp } from '../state';
import { getPositionOnce, matchPlace, type Pos } from '../lib/place';
import { PLACE_KIND_LABEL, WEEKDAY_LABEL, type Place, type PlaceKind, type UserSchedule } from '../db/types';
import { Chip, Sheet, TopBar } from '../components/ui';
import PlaceMap from '../components/PlaceMap';
import { searchAddress, type AddressHit } from '../lib/gsi';

/** map: 地図を出すか（住所で探した場所と登録済みの場所だけ。いまここには出さない） */
type Form = { id: string | null; name: string; kind: PlaceKind; radiusM: Place['radiusM']; pos: Pos | null; map: boolean };
/** 住所で探す。base は、候補を選んだあとに戻るフォーム */
type Search = { base: Form; q: string; busy: boolean; hits: AddressHit[] | null; msg: string };

/** 月曜から並べる */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const scheduleText = (s: Pick<UserSchedule, 'weekdays' | 'startTime' | 'endTime' | 'placeName'>) =>
  `${WEEK_ORDER.filter((d) => s.weekdays.includes(d)).map((d) => WEEKDAY_LABEL[d]).join('・')} ${s.startTime}〜${s.endTime}${s.placeName ? ` ・ ${s.placeName}` : ''}`;

export default function Places() {
  const { person, me, members, userId, places, place, useLocation } = useApp();
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState<Search | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [explained, setExplained] = useState(false);
  const from = useSearchParams()[0].get('from');
  const fromSetup = from === 'setup' || from === 'join';
  const [sched, setSched] = useState<ScheduleInput | null>(null);
  const schedules = useLiveQuery(
    async () => (person ? latestSchedules(await db.userSchedules.where('personId').equals(person.id).toArray()) : []),
    [person?.id],
  );

  if (!person || !userId) return null;
  const editable = canEditPlaces(me?.role);
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '（不明）';

  async function hereNew() {
    setMsg('');
    setBusy(true);
    const pos = await getPositionOnce();
    setBusy(false);
    if (!pos) return setMsg('位置を取れませんでした。端末の設定で位置情報を許可するか、「位置なしで登録」を使ってください。');
    setForm({ id: null, name: '', kind: 'facility', radiusM: 100, pos, map: false });
  }

  async function findAddress() {
    if (!search || !search.q.trim()) return;
    setSearch({ ...search, busy: true, msg: '' });
    const hits = await searchAddress(search.q.trim());
    if (hits === null) return setSearch({ ...search, busy: false, hits: null, msg: '探せませんでした。通信できるところでもう一度試すか、「位置なしで登録」を使ってください。' });
    setSearch({ ...search, busy: false, hits, msg: hits.length ? '' : '見つかりませんでした。都道府県から番地まで書いてみてください。' });
  }

  function pickAddress(hit: AddressHit) {
    if (!search) return;
    setForm({ ...search.base, pos: hit.pos, map: true });
    setSearch(null);
  }

  async function save() {
    if (!form || !person || !userId) return;
    const p = await savePlace(form.id, { personId: person.id, name: form.name.trim(), kind: form.kind, radiusM: form.radiusM, lat: form.pos?.lat ?? null, lng: form.pos?.lng ?? null }, userId);
    if (!form.id && form.pos && !form.map) await setPlaceChoice(person.id, p.id); // いまここで登録したので、いまの場所にする（住所で探した場所はしない）
    setForm(null);
  }

  async function remove() {
    if (!form?.id || !person || !userId) return;
    if (!window.confirm(`「${form.name}」を一覧から外しますか？ 過去の記録に付いた場所名は残ります。`)) return;
    await hidePlace(form.id, userId);
    if (place?.id === form.id) await setPlaceChoice(person.id, null);
    setForm(null);
  }

  const mySchedule = schedules?.find((x) => x.userId === userId);
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const schedValid = !!sched && sched.weekdays.length > 0 && HHMM.test(sched.startTime) && HHMM.test(sched.endTime) && sched.endTime > sched.startTime;

  async function saveSched() {
    if (!sched || !person || !userId || !schedValid) return;
    await saveSchedule(person.id, sched, userId);
    setSched(null);
  }

  async function removeSched() {
    if (!mySchedule || !userId) return;
    if (!window.confirm('いつもの時間を消しますか？ グラフの1時間あたりの回数は、記録の最初から最後までで推定します。')) return;
    await deleteSchedule(mySchedule.id, userId);
    setSched(null);
  }

  async function toggleLocation(on: boolean) {
    // オンにする前に、アプリの中で説明してから OS の許可を出す（6.3.3）
    if (on && !explained) return setExplaining(true);
    await saveDevice({ useLocation: on });
    if (!on || !person) return;
    const pos = await getPositionOnce();
    if (pos) await setPlaceChoice(person.id, matchPlace(places, pos)?.id ?? 'outside', true);
    else setMsg('位置を取れませんでした。場所は手で選んでください。');
  }

  return (
    <div className="page page--no-nav">
      <TopBar title="場所" sub="記録に自動で付く場所です。チームで共有します" back={fromSetup ? undefined : '/'} />
      {fromSetup && (
        <div className="section">
          <div className="card stack">
            <span className="label">{from === 'join' ? 'はじめての設定' : 'はじめての設定 4 / 5'}: 場所といつもの時間（あとでも登録できます）</span>
            <p className="help">
              自宅・学校・施設など、記録する場所を登録します。登録すると、記録に場所の名前が付きます。{''}
              下の「わたしのいつもの時間」には、ふだん対象者と一緒にいる曜日と時間を登録します。グラフの「1時間あたりの回数」に使います。
            </p>
            <Link to="/" className="btn btn--primary btn--block">{from === 'join' ? '次へ: ホームへ' : '次へ: 最初の記録'}</Link>
          </div>
        </div>
      )}

      <div className="section">
        <div className="card">
          <h2 className="card__title">登録した場所（{places.length}件）</h2>
          {places.length === 0 && <p className="muted">まだありません。</p>}
          {places.map((p) => (
            <div key={p.id} className="row row--between today-row">
              <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <span className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <strong>{p.name}</strong>
                  <span className="badge badge--role">{PLACE_KIND_LABEL[p.kind]}</span>
                  {place?.id === p.id && <span className="badge badge--owner">いまここ</span>}
                </span>
                <span className="muted">
                  {p.lat != null ? `半径 ${p.radiusM}m` : '位置なし（手で選ぶ）'} ・ {nameOf(p.createdBy)} が登録
                  {p.kind === 'home' && ' ・ 住所は表示しません'}
                </span>
              </span>
              {editable && (
                <button type="button" className="btn btn--sm" onClick={() => setForm({ id: p.id, name: p.name, kind: p.kind, radiusM: p.radiusM, pos: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null, map: p.lat != null })}>
                  編集
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {editable && (
        <div className="section stack">
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={hereNew}>{busy ? '位置を取っています…' : 'いまここを登録'}</button>
          <button type="button" className="btn btn--block" onClick={() => setSearch({ base: { id: null, name: '', kind: 'facility', radiusM: 100, pos: null, map: true }, q: '', busy: false, hits: null, msg: '' })}>住所で探す</button>
          <button type="button" className="btn btn--block" onClick={() => setForm({ id: null, name: '', kind: 'facility', radiusM: 100, pos: null, map: false })}>位置なしで登録（手で選ぶ）</button>
          {msg && <p className="help" role="status">{msg}</p>}
          <p className="help">施設・自宅・学校のように建物ごとに1つ登録します。作業室・食堂などの違いは、記録の「活動」で残します。</p>
        </div>
      )}

      <div className="section">
        <div className="card">
          <h2 className="card__title">わたしのいつもの時間</h2>
          <p className="help">
            ふだん対象者と一緒にいる曜日と時間です（例: 平日 9:00〜16:00 は施設）。グラフの「1時間あたりの回数」で、観察していた時間の目安に使います。記録を付けた日だけに使い、登録がない人は、その日の最初の記録から最後の記録までで推定します。
          </p>
          {(schedules ?? []).map((x) => (
            <div key={x.id} className="row row--between today-row">
              <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <strong>{nameOf(x.userId)}{x.userId === userId && '（わたし）'}</strong>
                <span className="muted">{scheduleText(x)}</span>
              </span>
              {x.userId === userId && editable && (
                <button type="button" className="btn btn--sm" onClick={() => setSched({ weekdays: x.weekdays, startTime: x.startTime, endTime: x.endTime, placeName: x.placeName })}>
                  編集
                </button>
              )}
            </div>
          ))}
          {schedules?.length === 0 && <p className="muted">まだだれも登録していません。</p>}
          {editable && !mySchedule && (
            <button type="button" className="btn btn--block" onClick={() => setSched({ weekdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '16:00', placeName: places[0]?.name ?? null })}>
              わたしのいつもの時間を登録
            </button>
          )}
        </div>
      </div>

      <div className="section">
        <div className="card stack">
          <label className="row row--between">
            <span className="label">この端末で位置情報を使う</span>
            <input type="checkbox" checked={useLocation} onChange={(e) => toggleLocation(e.target.checked)} style={{ width: 22, height: 22 }} />
          </label>
          <p className="help">
            オンにすると、アプリを開いたときに位置を1回だけ取り、登録した場所に入っていれば場所を切りかえます。
            あなたがいまどこにいるか（現在地）は、この端末の中で登録した場所と照らし合わせるだけで、保存も送信もしません。チームで共有するのは、登録した場所の名前・中心・半径だけです。
            オフでも、場所は手で選べます。
          </p>
        </div>
      </div>

      {explaining && (
        <Sheet title="位置情報を使う前に" onClose={() => setExplaining(false)}>
          <div className="stack">
            <p className="help">
              アプリを開いたときと記録したときに、この端末の位置を1回だけ取ります。登録した場所（半径の円）に入っていれば、場所を自動で切りかえます。
            </p>
            <p className="help">
              あなたがいまどこにいるか（現在地）は、この端末の中で照らし合わせるだけで、保存も送信もしません。記録に残るのは「施設」のような場所の名前だけです。
              ずっと追いかけること（バックグラウンドでの取得）はしません。許可は「アプリの使用中のみ」で足ります。
            </p>
            <p className="help">このあと、端末から位置情報の許可を求める画面が出ます。いつでもここでオフにできます。</p>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                setExplaining(false);
                setExplained(true);
                void (async () => {
                  await saveDevice({ useLocation: true });
                  if (!person) return;
                  const pos = await getPositionOnce();
                  if (pos) await setPlaceChoice(person.id, matchPlace(places, pos)?.id ?? 'outside', true);
                  else setMsg('位置を取れませんでした。場所は手で選んでください。');
                })();
              }}
            >
              位置情報を使う
            </button>
            <button type="button" className="btn btn--block" onClick={() => setExplaining(false)}>使わない</button>
          </div>
        </Sheet>
      )}

      {sched && (
        <Sheet title="わたしのいつもの時間" onClose={() => setSched(null)}>
          <div className="stack">
            <span className="label">曜日</span>
            <div className="chips">
              {WEEK_ORDER.map((d) => (
                <Chip
                  key={d}
                  on={sched.weekdays.includes(d)}
                  onClick={() => setSched({ ...sched, weekdays: sched.weekdays.includes(d) ? sched.weekdays.filter((x) => x !== d) : [...sched.weekdays, d].sort() })}
                >
                  {WEEKDAY_LABEL[d]}
                </Chip>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <label className="field" style={{ flex: 1 }}>
                はじめ
                <input type="time" value={sched.startTime} onChange={(e) => setSched({ ...sched, startTime: e.target.value })} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                おわり
                <input type="time" value={sched.endTime} onChange={(e) => setSched({ ...sched, endTime: e.target.value })} />
              </label>
            </div>
            {places.length > 0 && (
              <>
                <span className="label">場所（なくてもよい）</span>
                <div className="chips">
                  <Chip on={sched.placeName == null} onClick={() => setSched({ ...sched, placeName: null })}>決めない</Chip>
                  {places.map((p) => (
                    <Chip key={p.id} on={sched.placeName === p.name} onClick={() => setSched({ ...sched, placeName: p.name })}>{p.name}</Chip>
                  ))}
                </div>
              </>
            )}
            {sched.weekdays.length === 0 && <p className="help" role="status">曜日を1つ以上選んでください。</p>}
            {sched.weekdays.length > 0 && sched.endTime <= sched.startTime && <p className="help" role="status">おわりは、はじめより後にしてください（夜をまたぐ時間は、まだ登録できません）。</p>}
            <button type="button" className="btn btn--primary btn--block" disabled={!schedValid} onClick={saveSched}>保存</button>
            {mySchedule && <button type="button" className="btn btn--danger btn--block" onClick={removeSched}>消す</button>}
          </div>
        </Sheet>
      )}

      {search && (
        <Sheet title="住所で探す" onClose={() => setSearch(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void findAddress(); }}>
            <label className="field">
              住所
              <input value={search.q} onChange={(e) => setSearch({ ...search, q: e.target.value })} placeholder="例: 東京都千代田区永田町1-7-1" autoFocus />
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={search.busy || !search.q.trim()}>{search.busy ? '探しています…' : '探す'}</button>
            <p className="help">入力した住所の文字だけを国土地理院に送って、場所の中心を探します。現在地は送りません。住所は保存しません。</p>
            {search.msg && <p className="help" role="status">{search.msg}</p>}
            {search.hits && search.hits.length > 0 && (
              <>
                <span className="label">候補（選ぶと地図が出ます）</span>
                {search.hits.map((h) => (
                  <button key={`${h.title}-${h.pos.lat}-${h.pos.lng}`} type="button" className="btn btn--block" onClick={() => pickAddress(h)}>{h.title}</button>
                ))}
              </>
            )}
          </form>
        </Sheet>
      )}

      {form && (
        <Sheet title={form.id ? '場所の編集' : !form.pos ? '新しい場所（位置なし）' : form.map ? '新しい場所（住所で探した場所）' : '新しい場所（いまここ）'} onClose={() => setForm(null)}>
          <div className="stack">
            <label className="field">
              名前
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: ひまわり園" />
            </label>
            <span className="label">種類</span>
            <div className="chips">
              {(Object.keys(PLACE_KIND_LABEL) as PlaceKind[]).map((k) => (
                <Chip key={k} on={form.kind === k} onClick={() => setForm({ ...form, kind: k })}>{PLACE_KIND_LABEL[k]}</Chip>
              ))}
            </div>
            {form.pos && (
              <>
                <span className="label">半径</span>
                <div className="chips">
                  {([50, 100, 200] as const).map((r) => (
                    <Chip key={r} on={form.radiusM === r} onClick={() => setForm({ ...form, radiusM: r })}>{r}m</Chip>
                  ))}
                </div>
              </>
            )}
            {form.pos && form.map && (
              <>
                <PlaceMap pos={form.pos} radiusM={form.radiusM} onMove={(pos) => setForm((f) => (f ? { ...f, pos } : f))} />
                <p className="help">ピンは指で動かせます。地図をタップしても動きます。住所で探した中心は町や番地の目安なので、建物の位置に合わせてください。</p>
              </>
            )}
            {form.id && editable && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--sm" onClick={async () => { const pos = await getPositionOnce(); if (pos) setForm({ ...form, pos, map: false }); else setMsg('位置を取れませんでした。'); }}>
                  中心を「いまここ」にする
                </button>
                <button type="button" className="btn btn--sm" onClick={() => { setSearch({ base: form, q: '', busy: false, hits: null, msg: '' }); setForm(null); }}>
                  住所で探しなおす
                </button>
              </div>
            )}
            <button type="button" className="btn btn--primary btn--block" disabled={!form.name.trim()} onClick={save}>保存</button>
            {form.id && <button type="button" className="btn btn--danger btn--block" onClick={remove}>一覧から外す</button>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
