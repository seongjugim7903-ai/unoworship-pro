'use client';

// 화면 위에 붙는 앱 설치 띠 — 이미 쓰고 있는 사람에게 권하는 자리다.
//
// 초대 링크(/join)에서는 띄우지 않는다. 거기는 설치 안내가 화면 전체를 차지하는
// 자리라 같은 말이 두 번 나온다. 다만 이 컴포넌트는 계속 붙어 있어야 한다 —
// 서비스 워커를 등록하는 곳이 여기이고, 그것이 없으면 브라우저가 설치 자체를
// 제안하지 않는다. 그래서 화면만 감추고 동작은 남긴다.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  detectEnvironment,
  getInstallPrompt,
  installSteps,
  watchInstall,
  type InstallEnvironment,
} from '../../lib/pwaInstall';

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const [environment, setEnvironment] = useState<InstallEnvironment>('standalone');
  const [canInstall, setCanInstall] = useState(false);
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

    /* 설치 기회는 layout.tsx 의 인라인 스크립트가 잡아 둔다 — 여기서는 꺼내 본다 */
    const sync = () => {
      setCanInstall(Boolean(getInstallPrompt()));
      if (!getInstallPrompt() && detectEnvironment() === 'standalone') setEnvironment('standalone');
    };
    sync();
    return watchInstall(sync);
  }, []);

  const handleInstall = async () => {
    const prompt = getInstallPrompt();
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      window.__uljuInstall = null;
      setCanInstall(false);
      setMessage(choice.outcome === 'accepted' ? '설치를 시작했습니다.' : '설치를 취소했습니다.');
    } catch {
      setMessage('브라우저 메뉴에서 앱 설치를 눌러 주세요.');
    }
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

  /* 초대 화면은 자기 설치 안내를 가지고 있다 — 등록만 하고 화면에서는 빠진다 */
  if (pathname?.startsWith('/join')) return null;
  if (environment === 'standalone' || dismissed) return null;
  if (environment === 'browser' && !canInstall && !installRequested) return null;

  const isKakaoAndroid = environment === 'kakao-android';
  const isKakaoIOS = environment === 'kakao-ios';
  const steps = installSteps(environment, canInstall);

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
        {environment === 'browser' && canInstall && (
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
