'use client';

// 화면 위에 붙는 앱 설치 띠.
//
// 초대 링크(/join)에서도 이것을 쓴다. 초대 화면이 설치 안내를 따로 가지고 있었더니
// 담당자 화면에서는 설치가 되는데 초대 화면에서는 안 되는 일이 있었다.
// 되는 것 하나만 남긴다 — 초대 화면은 '누가 부르는지'만 말하고 설치는 여기가 맡는다.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { installSteps, openInOutsideBrowser, useInstall } from '../../lib/pwaInstall';

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  /* 초대 첫 화면과 같은 것을 쓴다 — lib/pwaInstall 의 useInstall */
  const { environment, canInstall, message, setMessage, install } = useInstall();
  const [installRequested, setInstallRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setInstallRequested(new URLSearchParams(window.location.search).get('install') === '1');
  }, []);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage('주소를 복사했습니다. 카카오톡 메뉴에서 Safari로 열어 주세요.');
    } catch {
      setMessage('카카오톡 메뉴에서 다른 브라우저로 열어 주세요.');
    }
  };

  if (environment === 'standalone' || dismissed) return null;
  if (environment === 'browser' && !canInstall && !installRequested) return null;

  /* 초대 화면에서는 닫지 못하게 한다 — 닫으면 설치할 방법이 화면에서 사라진다 */
  const onInvite = Boolean(pathname?.startsWith('/join'));
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
        {isKakaoAndroid && <button type="button" onClick={openInOutsideBrowser}>브라우저로 열기</button>}
        {isKakaoIOS && <button type="button" onClick={() => void handleCopyAddress()}>주소 복사</button>}
        {environment === 'browser' && canInstall && (
          <button type="button" onClick={() => void install()}>앱 설치</button>
        )}
        {!onInvite && (
          <button
            type="button"
            className="pwa-install-close"
            aria-label="설치 안내 닫기"
            title="닫기"
            onClick={() => setDismissed(true)}
          >
            ×
          </button>
        )}
      </div>
    </aside>
  );
}
