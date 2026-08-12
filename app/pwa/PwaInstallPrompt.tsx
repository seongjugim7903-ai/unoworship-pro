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

  /* 초대 화면에서는 언제나 띄운다 — 여기가 설치를 끝내야 넘어가는 자리다 */
  const onInvite = Boolean(pathname?.startsWith('/join'));
  if (environment === 'standalone' || dismissed) return null;
  if (environment === 'browser' && !canInstall && !installRequested && !onInvite) return null;

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
        {/* 카카오 안에서는 설치가 안 된다. 브라우저로 옮기는 것까지 이 버튼이 한다 */}
        {isKakaoAndroid && <button type="button" onClick={openInOutsideBrowser}>앱 설치</button>}
        {isKakaoIOS && <button type="button" onClick={() => void handleCopyAddress()}>주소 복사</button>}
        {/* 기회가 아직 없어도 버튼은 띄운다 — install() 이 새로고침으로 다시 물어보고,
            그래도 없으면 브라우저 메뉴로 안내한다. 누를 것이 없는 화면이 제일 나쁘다 */}
        {environment === 'browser' && (
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
