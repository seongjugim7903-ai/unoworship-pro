'use client';

// 입력 화면 앞의 문.
//
// 설교대지·준비찬양·헵시바는 자료를 넣고 고치는 화면이라 로그인 뒤에 있어야 한다.
// 홈과 연주용 악보 보기(/worship/play)는 그대로 열어 둔다 — 반주자가 예배 직전에
// 여는 화면이라 로그인 벽이 걸리면 위험하다.
//
// 로그인만 하고 참여 코드를 안 넣은 사람도 여기서 걸러 참여 화면으로 보낸다.
// 그대로 두면 소속이 없어 기본 교회로 조용히 떨어지는데, 교회가 둘 이상이 되면
// 남의 교회 자료를 보게 된다.

import { useEffect, useState } from 'react';

interface Me {
  loggedIn: boolean;
  name?: string;
  churchRole?: string | null;
  /** 저장 환경이 없는 배포 — 막지 않는다 */
  unavailable?: boolean;
}

type Phase = 'checking' | 'allowed' | 'need-login' | 'need-join';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/membership/me');
        const me = await response.json() as Me;
        if (me.unavailable) { setPhase('allowed'); return; }
        if (!me.loggedIn) { setPhase('need-login'); return; }
        setPhase(me.churchRole ? 'allowed' : 'need-join');
      } catch {
        /* 확인 자체가 실패하면 막지 않는다 — 쓰기는 서버가 다시 판단한다 */
        setPhase('allowed');
      }
    })();
  }, []);

  if (phase === 'checking') {
    return <main className="site-shell"><section className="panel"><p className="field-hint">확인하는 중...</p></section></main>;
  }

  if (phase === 'allowed') return <>{children}</>;

  const needLogin = phase === 'need-login';
  return (
    <main className="site-shell">
      <section className="panel">
        <h2>{needLogin ? '로그인이 필요합니다' : '교회 참여가 필요합니다'}</h2>
        <p className="field-hint">
          {needLogin
            ? '이 화면은 교회 자료를 넣고 고치는 곳이라 로그인 뒤에 쓸 수 있습니다. 카카오로 로그인해 주세요.'
            : '로그인은 되었지만 아직 교회에 참여하지 않으셨습니다. 교회에서 받은 참여 코드를 넣어 주세요.'}
        </p>
        <a className="primary-button" href={needLogin ? '/login?redirectTo=/onboarding' : '/onboarding'}>
          {needLogin ? '카카오로 로그인' : '참여 코드 넣기'}
        </a>
      </section>
    </main>
  );
}
