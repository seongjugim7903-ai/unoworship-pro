'use client';

// 초대 링크를 열면 가장 먼저 만나는 화면 — 누가 어느 팀으로 부르는지.
//
// 설치는 여기서 하지 않는다. 화면 위쪽 배너(app/pwa/PwaInstallPrompt.tsx)가 맡는다.
// 초대 화면이 설치 안내를 따로 가지고 있었더니 담당자 화면에서는 설치가 되는데
// 초대 화면에서는 안 되는 일이 있었다 — 되는 것 하나만 남긴다.
//
// 설치가 끝나 앱으로 열리면 이 화면 자체가 사라진다(그때는 부모가 안 그린다).
// 데스크톱에서는 띄우지 않는다 — 막으면 PC로 들어올 길이 없다. 판단은 부모가 한다.

import { useEffect, useState } from 'react';
import { detectEnvironment, getInstallPrompt, isAlreadyInstalled } from '../../lib/pwaInstall';

interface Props {
  code: string;
  team: string | null;
  leaderName: string;
  churchName: string;
}

export default function InstallGate({ code, team, leaderName, churchName }: Props) {
  /* 설치가 안 되는 폰에서 무엇이 막는지 보려고 — 주소에 ?debug=1 을 붙였을 때만 */
  const [diagnosis, setDiagnosis] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    /* 휴대폰에서는 개발자도구를 못 여니 원인을 볼 방법이 이것뿐이다 */
    void (async () => {
      const workers = 'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : -1;
      setDiagnosis([
        `환경 ${detectEnvironment()}`,
        `설치기회 ${getInstallPrompt() ? '있음' : '없음'}`,
        `이미설치 ${await isAlreadyInstalled() ? '예' : '아니오'}`,
        `SW ${workers}개${navigator.serviceWorker?.controller ? '·제어중' : ''}`,
      ].join(' / '));
    })();
  }, []);

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
          예배 중에 쓰는 화면이라 <b>앱으로 설치한 뒤에 시작합니다.</b>
          {' '}위쪽 <b>앱 설치</b>를 누르고, 홈 화면에 생긴 ULJU 아이콘으로 열어 주세요.
        </p>

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
