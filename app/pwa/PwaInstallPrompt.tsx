'use client';

import { useEffect, useState } from 'react';
import { detectEnvironment, installSteps, type InstallEnvironment } from '../../lib/pwaInstall';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [environment, setEnvironment] = useState<InstallEnvironment>('standalone');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installRequested, setInstallRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnvironment(detectEnvironment());
    setInstallRequested(new URLSearchParams(window.location.search).get('install') === '1');

    /* dev에서는 SW 캐시가 stale 번들을 서빙하므로 프로덕션에서만 등록한다. */
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[pwa] service worker registration failed', error);
      });
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setEnvironment('browser');
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setEnvironment('standalone');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === 'accepted' ? '설치를 시작했습니다.' : '설치를 취소했습니다.');
  };

  const handleOpenChrome = () => {
    const target = new URL(window.location.href);
    target.searchParams.set('install', '1');
    const fallback = encodeURIComponent(target.toString());
    window.location.href = `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage('주소를 복사했습니다. 카카오톡 메뉴에서 Safari로 열어 주세요.');
    } catch {
      setMessage('카카오톡 메뉴에서 다른 브라우저로 열어 주세요.');
    }
  };

  if (environment === 'standalone' || dismissed) return null;
  if (environment === 'browser' && !installPrompt && !installRequested) return null;

  const isKakaoAndroid = environment === 'kakao-android';
  const isKakaoIOS = environment === 'kakao-ios';
  const steps = installSteps(environment, Boolean(installPrompt));

  return (
    <aside className="pwa-install-banner" aria-label="ULJU 앱 설치">
      <div className="pwa-install-copy">
        <strong>ULJU 앱으로 사용</strong>
        <span>아래 순서대로 한 번만 설치하면 다음부터 앱처럼 바로 열립니다.</span>
        <ol className="pwa-install-steps">
          {steps.map((step, index) => <li key={step}><b>{index + 1}</b>{step}</li>)}
        </ol>
        {message && <small>{message}</small>}
      </div>
      <div className="pwa-install-actions">
        {isKakaoAndroid && <button type="button" onClick={handleOpenChrome}>Chrome에서 열기</button>}
        {isKakaoIOS && <button type="button" onClick={() => void handleCopyAddress()}>주소 복사</button>}
        {environment === 'browser' && installPrompt && (
          <button type="button" onClick={() => void handleInstall()}>앱 설치</button>
        )}
        <button
          type="button"
          className="pwa-install-close"
          aria-label="설치 안내 닫기"
          title="닫기"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      </div>
    </aside>
  );
}
