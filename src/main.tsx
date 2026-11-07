import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { captureInviteCode } from './lib/inviteLink';
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
