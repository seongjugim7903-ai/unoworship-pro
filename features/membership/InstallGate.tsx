'use client';

// 초대 링크를 열면 가장 먼저 만나는 자리 — 설치가 끝나기를 기다린다.
//
// 설치는 화면 위쪽 배너(app/pwa/PwaInstallPrompt.tsx)가 맡는다. 여기서 또 안내하지
// 않는다 — 두 벌을 두었더니 한쪽만 되는 일이 계속 생겼다.
//
// '누가 어느 팀으로 초대했습니다' 섹션은 뺐다. 배너 아래에서 같은 말이 한 번 더 나와
// 화면만 길어지고, 설치를 마치면 곧바로 로그인으로 넘어가므로 머무는 자리도 아니다.
// 남기는 것은 참여 코드 한 줄뿐이다 — iOS 에서 코드가 안 넘어갔을 때의 유일한 통로다.
//
// 설치가 끝나면 부모(InvitePanel)가 로그인 화면으로 넘긴다.
// 데스크톱에서는 띄우지 않는다 — 막으면 PC로 들어올 길이 없다. 판단은 부모가 한다.

import { useEffect, useState } from 'react';
import {
  browserName,
  detectEnvironment,
  getInstallPrompt,
  installEverOffered,
  isAlreadyInstalled,
  watchInstall,
} from '../../lib/pwaInstall';

export default function InstallGate({ code }: { code: string }) {
  /* 설치가 안 되는 폰에서 무엇이 막는지 보려고 — 주소에 ?debug=1 을 붙였을 때만 */
  const [diagnosis, setDiagnosis] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    /* 휴대폰에서는 개발자도구를 못 여니 원인을 볼 방법이 이것뿐이다.
       설치 기회는 화면이 뜬 뒤 몇 초 있다 오기도 해서 한 번 찍고 끝내면 안 된다 */
    let alive = true;
    const snap = async () => {
      const workers = 'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : -1;
      if (!alive) return;
      setDiagnosis([
        browserName(),
        detectEnvironment(),
        `기회 ${getInstallPrompt() ? '있음' : installEverOffered() ? '썼음' : '없음'}`,
        `이미설치 ${await isAlreadyInstalled() ? '예' : '아니오'}`,
        `SW ${workers}${navigator.serviceWorker?.controller ? '·제어중' : ''}`,
      ].join(' / '));
    };
    void snap();
    const timer = setInterval(() => void snap(), 2000);
    const stop = watchInstall(() => void snap());
    return () => { alive = false; clearInterval(timer); stop(); };
  }, []);

  /* 남은 것이 한 줄뿐이라 카드로 감싸지 않는다 — 빈 흰 상자만 보인다 */
  return (
    <main className="gate">
      <div className="gate-note">
        <p className="gate-fallback">
          설치한 앱이 참여 코드를 물으면 <code>{code}</code>
        </p>
        {diagnosis && <p className="gate-fallback"><code>{diagnosis}</code></p>}
      </div>
    </main>
  );
}
