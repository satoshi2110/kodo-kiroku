import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { captureInviteCode } from './lib/inviteLink';
// 見出し・大きなボタン・数字に使う丸い書体（太さ 700 だけ同梱）
import '@fontsource/zen-maru-gothic/700.css';
import './styles.css';

registerSW({ immediate: true });
// 招待リンク（?invite=）から開いたときは、コードを覚えておく
captureInviteCode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
