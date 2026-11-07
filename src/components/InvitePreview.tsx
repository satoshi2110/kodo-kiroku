/**
 * 招待コードの中身を、チームに入る前に見せる（6.9、決定97、ワイヤーフレーム「ログイン / 招待受諾」）。
 * ログインの前に見えるのは、役割・招待した人の名前・期限だけ。チームの名前（対象者の呼び名）はログインしてから。
 * どこまで返すかはサーバー（invite_preview、0019）が決める。サーバーにまだ 0019 がないときや、使えないコードのときは何も出さない。
 */
import { useEffect, useState } from 'react';
import { supabase } from '../server/supabase';
import { formatDateTimeJa } from '../lib/date';
import { ROLE_LABEL, type Role } from '../db/types';

export interface InviteInfo {
  kind: 'invite' | 'start';
  role?: Role;
  family_mark?: boolean;
  expires_at: string;
  inviter?: string | null;
  team?: string | null;
}

/** コードの中身を読む。10文字そろうまでは読まない */
export function useInvitePreview(code: string): InviteInfo | null {
  const c = code.trim().toUpperCase();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!supabase || c.length < 10) return;
    let stop = false;
    supabase.rpc('invite_preview', { p_code: c }).then(({ data, error }) => {
      if (!stop && !error && data) setInfo(data as InviteInfo);
    });
    return () => {
      stop = true;
    };
  }, [c]);
  return info;
}

export function InvitePreview({ info }: { info: InviteInfo | null }) {
  if (!info) return null;
  if (info.kind === 'start') {
    return (
      <p className="notice-inline" role="status">
        新しいチームを作る「開始コード」です（{formatDateTimeJa(info.expires_at)}まで）。
      </p>
    );
  }
  return (
    <div className="notice-inline stack" role="status" style={{ gap: 2 }}>
      <strong>{info.team ? `「${info.team}」のチームへの招待` : 'チームへの招待'}</strong>
      <span>招待した人: {info.inviter || '—'}</span>
      <span>
        役割: {info.role ? ROLE_LABEL[info.role] : '—'}
        {info.family_mark ? '（「家族」の印つき）' : ''}
      </span>
      <span>期限: {formatDateTimeJa(info.expires_at)}まで</span>
      {!info.team && <span className="muted">チームの名前は、ログインしてから出ます。</span>}
    </div>
  );
}
