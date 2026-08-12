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
// 설치창은 브라우저가 열어 준다. 웹이 혼자 설치할 수는 없다.
//
// 그래서 자동으로 띄우지 않는다. 설치 기회(beforeinstallprompt)는 한 번 쓰면 사라지는데,
// 사용자가 보지도 않은 창을 실수로 닫으면 그 기회가 날아가고 화면에는 누를 것이 없어진다.
// 큰 버튼으로 두고 사용자가 누를 때 연다 — 그때가 브라우저도 허락하는 시점이다.
//
// 기회가 아직 없을 때도 누를 것을 남겨 둔다. 크롬은 설치창을 한 번 닫으면 한동안
// 기회를 주지 않는데, 그때 안내 문구만 띄우면 화면이 막힌다. 새로고침하면 다시
// 받으므로 '설치 다시 시도'로 둔다 — 아이폰은 애초에 기회가 없어 안내만 남긴다.
//
// 데스크톱에서는 띄우지 않는다 — 막으면 PC로 들어올 길이 없다. 판단은 부모가 한다.

import { useEffect, useState } from 'react';
import {
  detectEnvironment,
  getInstallPrompt,
  installSteps,
  isAlreadyInstalled,
  useInstall,
} from '../../lib/pwaInstall';

interface Props {
  code: string;
  team: string | null;
  leaderName: string;
  churchName: string;
}

export default function InstallGate({ code, team, leaderName, churchName }: Props) {
  /* 담당자 화면 위쪽 배너와 같은 것을 쓴다 — 갈라 두었더니 한쪽만 되는 일이 있었다 */
  const { environment, canInstall, installed, cancelled, message, setMessage, install } = useInstall();
  /* 설치가 안 되는 폰에서 무엇이 막는지 보려고 — 주소에 ?debug=1 을 붙였을 때만 */
  const [diagnosis, setDiagnosis] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    /* 휴대폰에서는 개발자도구를 못 여니 원인을 볼 방법이 이것뿐이다 */
    void (async () => {
      const workers = 'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : -1;
      const controlled = Boolean(navigator.serviceWorker?.controller);
      setDiagnosis([
        `환경 ${detectEnvironment()}`,
        `설치기회 ${getInstallPrompt() ? '있음' : '없음'}`,
        `이미설치 ${await isAlreadyInstalled() ? '예' : '아니오'}`,
        `SW ${workers}개${controlled ? '·제어중' : ''}`,
      ].join(' / '));
    })();
  }, [canInstall]);

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

  const inKakao = environment === 'kakao-android' || environment === 'kakao-ios';
  const alreadyHere = installed && !inKakao;
  const steps = alreadyHere
    ? ['홈 화면에서 ULJU 열기', '초대가 그대로 이어집니다']
    : installSteps(environment, canInstall);
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
          {alreadyHere
            ? <>이 휴대폰에 <b>ULJU 앱이 이미 있습니다.</b> 홈 화면 아이콘으로 열면 이 초대가 이어집니다.</>
            : <>아래 순서대로 <b>한 번만</b> 하시면 다음부터는 앱처럼 바로 열립니다.</>}
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
          {/* 기회가 아직 없어도 버튼은 남긴다 — install() 이 새로고침으로 다시 받아 온다.
              아이폰은 기회 자체가 없는 환경이라 안내만 남긴다 */}
          {!inKakao && !alreadyHere && environment !== 'ios' && (
            <button type="button" className="gate-primary" onClick={() => void install()}>
              {canInstall ? '앱 설치' : cancelled ? '설치 다시 시도' : '설치창 불러오기'}
            </button>
          )}
          {!inKakao && !alreadyHere && !canInstall && (
            <p className="gate-manual">
              {environment === 'ios'
                ? <>아래쪽 <b>공유 버튼</b>을 누르고 <b>홈 화면에 추가</b>를 눌러 주세요.</>
                : <>설치창이 안 뜨면 브라우저 오른쪽 위 <b>⋮</b> 메뉴에서 <b>앱 설치</b>를 눌러 주세요. 그래도 됩니다.</>}
            </p>
          )}
        </div>

        {message && <p className="gate-message">{message}</p>}

        {/* iOS 는 Safari 와 홈 화면 앱의 저장소가 갈릴 수 있어 코드가 안 넘어갈 수 있다.
            그때 앱이 코드를 물으면 이것을 넣으면 된다 — 영문 이름이라 넣기 쉽다 */}
        <p className="gate-fallback">
          설치한 앱이 참여 코드를 물으면 <code>{code}</code>
        </p>

        {diagnosis && <p className="gate-fallback"><code>{diagnosis}</code></p>}
      </div>
    </main>
  );
}
