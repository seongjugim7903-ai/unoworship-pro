'use client';

// 초대 링크를 열면 가장 먼저 만나는 화면 — 앱 설치.
//
// 대부분 카톡 단톡방에서 휴대폰으로 연다. 카카오 내장 브라우저에서는 설치가 안 되고,
// 설치를 안 하면 예배 때마다 주소를 찾아 들어가야 한다. 그래서 로그인보다 먼저
// 설치를 끝내게 하고, 끝나기 전에는 이 화면만 보인다.
//
// 세 단계는 '남은 일'이지 '진행률'이 아니다 — installSteps 가 환경마다 배열을 통째로
// 갈아끼우기 때문에, 카카오 브라우저든 크롬이든 언제나 첫 항목이 지금 할 일이다.
// 브라우저를 옮기면 목록 자체가 바뀌어 진행된 것이 드러난다.
// 설치가 끝나 앱으로 열리면 이 화면 자체가 사라진다(그때는 부모가 안 그린다).
//
// 데스크톱에서는 띄우지 않는다 — 막으면 PC로 들어올 길이 없다. 판단은 부모가 한다.

import { useEffect, useState } from 'react';
import { detectEnvironment, installSteps, type InstallEnvironment } from '../../lib/pwaInstall';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface Props {
  code: string;
  team: string | null;
  leaderName: string;
  churchName: string;
}

export default function InstallGate({ code, team, leaderName, churchName }: Props) {
  const [environment, setEnvironment] = useState<InstallEnvironment>('browser');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnvironment(detectEnvironment());

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  /* 카카오 내장 브라우저에서 Chrome 으로 옮긴다. 주소는 그대로 들고 간다 */
  const openChrome = () => {
    const target = new URL(window.location.href);
    const fallback = encodeURIComponent(target.toString());
    window.location.href = `intent://${target.host}${target.pathname}${target.search}`
      + `#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage('주소를 복사했습니다. 카카오톡 오른쪽 아래 메뉴에서 Safari로 열어 주세요.');
    } catch {
      setMessage('카카오톡 오른쪽 아래 메뉴에서 Safari로 열어 주세요.');
    }
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === 'accepted'
      ? '설치했습니다. 홈 화면의 ULJU 아이콘으로 열어 주세요.'
      : '설치를 취소하셨습니다. 설치해야 다음으로 넘어갑니다.');
  };

  const steps = installSteps(environment, Boolean(installPrompt));
  /* '교회으로' 가 되지 않게 조사까지 붙여 둔다 */
  const invitedTo = team ? `${team} 팀으로` : '교회로';

  return (
    <main className="gate">
      <div className="gate-card">
        <img className="gate-mark" src="/icons/ulju-icon-192.png" alt="" width={56} height={56} />

        <p className="gate-eyebrow">{churchName || 'ULJU'}</p>
        <h1 className="gate-title">
          {leaderName ? <><b>{leaderName}</b>님이 </> : null}
          <b>{invitedTo}</b> 초대했습니다
        </h1>
        <p className="gate-lead">
          아래 순서대로 <b>한 번만</b> 하시면 다음부터는 앱처럼 바로 열립니다.
        </p>

        <ol className="gate-steps">
          {steps.map((label, index) => (
            <li key={label} className={index === 0 ? 'is-now' : ''}>
              <b>{index + 1}</b>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="gate-actions">
          {environment === 'kakao-android' && (
            <button type="button" className="gate-primary" onClick={openChrome}>Chrome에서 열기</button>
          )}
          {environment === 'kakao-ios' && (
            <button type="button" className="gate-primary" onClick={() => void copyAddress()}>주소 복사하기</button>
          )}
          {environment === 'browser' && installPrompt && (
            <button type="button" className="gate-primary" onClick={() => void install()}>앱 설치</button>
          )}
          {environment === 'browser' && !installPrompt && (
            <p className="gate-manual">
              브라우저 메뉴(⋮)를 열고 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러 주세요.
            </p>
          )}
          {environment === 'ios' && (
            <p className="gate-manual">
              아래쪽 <b>공유 버튼</b>을 누르고 <b>홈 화면에 추가</b>를 눌러 주세요.
            </p>
          )}
        </div>

        {message && <p className="gate-message">{message}</p>}

        {/* iOS 는 Safari 와 홈 화면 앱의 저장소가 갈릴 수 있어 코드가 안 넘어갈 수 있다.
            그때 앱이 코드를 물으면 이것을 넣으면 된다 — 영문 이름이라 넣기 쉽다 */}
        <p className="gate-fallback">
          설치한 앱이 참여 코드를 물으면 <code>{code}</code>
        </p>
      </div>
    </main>
  );
}
