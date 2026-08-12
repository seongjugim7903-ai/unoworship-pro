'use client';

// 랜딩 → 각 기능 진입. 탭 상시 노출을 없애 오조작을 줄인다.

import { useEffect, useState } from 'react';
import ChoirRequestPanel from '../features/choir/ChoirRequestPanel';
import SermonSection from '../features/sermon-compose/SermonSection';
import WorshipPrepPanel from '../features/worship-prep-ui/WorshipPrepPanel';
import BroadcastPanel from '../features/broadcast/BroadcastPanel';
import ServicePrepPanel from '../features/service-prep/ServicePrepPanel';
import BoardPanel from '../features/board/BoardPanel';
import AuthBadge from '../features/membership/AuthBadge';
import AuthGate from '../features/membership/AuthGate';

type View = 'home' | 'choir' | 'sermon' | 'worship' | 'broadcast' | 'prep' | 'board';

/* can 의 어느 값을 보는지까지 여기 적어 둔다 — 권한이 없는 기능은 버튼조차 안 보인다.
   초대받은 팀 말고는 들어갈 자리가 없어야 한다는 뜻이다. */
const MENU: Array<{ id: Exclude<View, 'home'>; label: string; desc: string; can: keyof Can }> = [
  { id: 'board', label: '게시판', desc: '전 팀 공유 · 공지 · 댓글', can: 'board' },
  { id: 'choir', label: '헵시바 선교단', desc: '찬양대 자막 · 카카오톡 공유', can: 'choir' },
  { id: 'sermon', label: '설교대지', desc: '설교 대지 · 주보 정리', can: 'sermon' },
  { id: 'worship', label: '준비찬양', desc: '팀별 찬양 준비 · 악보', can: 'worship' },
  { id: 'broadcast', label: '방송실', desc: '모든 팀 자료 · 예배 운영', can: 'broadcast' },
  { id: 'prep', label: '예배준비', desc: '새신자 · 준비 항목 챙기기', can: 'prep' },
];

interface Can {
  sermon: boolean;
  worship: boolean;
  choir: boolean;
  broadcast: boolean;
  prep: boolean;
  board: boolean;
}

export default function WorkspaceTabs() {
  const [view, setView] = useState<View>('home');
  /* 확인 전에는 아무 것도 안 보여 준다 — 잠깐 보였다 사라지는 것이 더 헷갈린다 */
  const [can, setCan] = useState<Can | null>(null);

  useEffect(() => {
    (async () => {
      let allowed: Can;
      try {
        const me = await (await fetch('/api/membership/me')).json();
        /* 저장 환경이 없는 배포에서는 막지 않는다 — 화면이 통째로 비면 손쓸 방법이 없다 */
        allowed = me?.unavailable
          ? { sermon: true, worship: true, choir: true, broadcast: true, prep: true, board: true }
          : (me?.can ?? { sermon: false, worship: false, choir: false, broadcast: false, prep: false, board: false });
      } catch {
        allowed = { sermon: true, worship: true, choir: true, broadcast: true, prep: true, board: true };
      }
      setCan(allowed);

      /* 초대 링크로 막 들어온 팀원은 갈 곳이 한 군데뿐이다. 그럴 때는 고르게 하지 않고
         바로 그 팀 화면으로 넣는다 — 버튼이 하나뿐인 목록을 보여 줄 이유가 없다.
         홈으로 돌아오는 길은 화면 위 '← 홈'으로 그대로 남는다. */
      const only = MENU.filter((item) => allowed[item.can]);
      if (only.length === 1) setView(only[0].id);
    })();
  }, []);

  const menu = can ? MENU.filter((item) => can[item.can]) : [];

  if (view === 'home') {
    return (
      <main className="landing">
        <div className="landing-bg" aria-hidden="true" />
        <header className="landing-head">
          <span className="landing-head-brand">ULJU COMMUNITY</span>
          <AuthBadge />
        </header>
        <div className="landing-inner">
          <div className="landing-copy">
            <h1>온전한 예배를 여는<br />섬김이들을 환영합니다</h1>
            <blockquote className="landing-verse">
              <p>“각각 은사를 받은 대로 하나님의 여러 가지 은혜를 맡은 선한 청지기 같이 서로 봉사하라”</p>
              <cite>베드로전서 4장 10절</cite>
            </blockquote>
          </div>
          <nav className="landing-menu" aria-label="기능 선택">
            {menu.map((item) => (
              <button key={item.id} type="button" className="landing-btn" onClick={() => setView(item.id)}>
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
            {can && menu.length === 0 && (
              <p className="landing-empty">
                아직 들어갈 수 있는 곳이 없습니다. 담당자에게 초대 링크를 받아 주세요.
              </p>
            )}
          </nav>
        </div>
      </main>
    );
  }

  const current = MENU.find((item) => item.id === view);

  return (
    <>
      <header className="feature-topbar">
        <button className="feature-back" type="button" onClick={() => setView('home')}>← 홈</button>
        <span className="feature-title">{current?.label}</span>
      </header>
      {/* 입력 화면은 로그인·참여를 마친 사람만 — 홈과 연주용 악보 보기는 그대로 열려 있다 */}
      <AuthGate>
        {view === 'choir' && <ChoirRequestPanel />}
        {view === 'sermon' && <SermonSection />}
        {view === 'worship' && <WorshipPrepPanel />}
        {view === 'broadcast' && <BroadcastPanel />}
        {view === 'prep' && <ServicePrepPanel />}
        {view === 'board' && <BoardPanel />}
      </AuthGate>
    </>
  );
}
