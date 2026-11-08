/**
 * 招待の QR を読む（6.9、決定120）。カメラの映像はこの端末の中だけで読み、保存も送信もしない。
 * 読めたら招待コードを返す。リンクの QR（ブラウザで作ったもの）でも、コードだけの QR（アプリで作ったもの）でも読める。
 */
import { useEffect, useRef, useState } from 'react';
import { codeFromScan } from '../lib/inviteLink';

export function QrScan({ onCode }: { onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--outline btn--block" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'QR を読むのをやめる' : 'QR を読む'}
      </button>
      {open && (
        <Scanner
          onCode={(c) => {
            setOpen(false);
            onCode(c);
          }}
        />
      )}
    </>
  );
}

function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('招待した人のスマホに出ている QR を、枠の中に写してください。');
  const [failed, setFailed] = useState(false);
  const done = useRef(onCode);
  done.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    (async () => {
      try {
        const [{ default: jsQR }, s] = await Promise.all([
          import('jsqr'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
        ]);
        stream = s;
        if (!alive || !video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (!alive) return;
          const v = video.current;
          if (v && ctx && v.videoWidth > 0) {
            // 小さくしてから読む（速く読めて、電池も減りにくい）
            const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (found?.data) {
              const code = codeFromScan(found.data);
              if (code) return done.current(code);
              setMessage('招待の QR ではないようです。招待した人の「チーム」の画面に出ている QR を写してください。');
            }
          }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch {
        if (!alive) return;
        setFailed(true);
        setMessage('カメラを使えません。端末の設定で、このアプリ（またはブラウザ）のカメラを許可してください。コードを手で入れることもできます。');
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="stack qr-scan">
      {!failed && <video ref={video} className="qr-scan__video" muted playsInline aria-label="カメラの映像" />}
      <p className={failed ? 'ai-error' : 'help'} role="status">{message}</p>
    </div>
  );
}
