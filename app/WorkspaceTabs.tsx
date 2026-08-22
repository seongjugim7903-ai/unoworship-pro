'use client';

// 팀 페이지 — 머리 하나에 홈과 서브페이지들이 매달린 구조.
//
//   머리(TeamHeader)   팀 이름 · 내 이름 · 삼선. 어느 자리에서도 그대로 있다
//   홈(TeamHomePanel)  오늘 할 일 · 다음 예배 · 게시판 최신글
//   서브페이지          찬양 올리기 · 설교대지 · 방송실 · 예배준비 · 게시판 · 내 정보
//
// 게시판을 모달로 얹지 않는다. 새 창처럼 뜨면 어디에 있는지 알기 어렵고, 닫는 법도
// 화면마다 다르다. 다른 자리와 똑같이 들어갔다가 '← 홈'으로 나오게 둔다.
//
// 홈을 건너뛰지 않는다 — 갈 곳이 하나뿐이어도 마찬가지다. 건너뛰면 게시판에 글이
// 올라와도 아무도 모른다.
//
// 어디로 갈 수 있는지는 features/home/menu.ts 한 곳에 적혀 있다.

import { useEffect, useState } from 'react';
import ChoirRequestPanel from '../features/choir/ChoirRequestPanel';
import SermonSection from '../features/sermon-compose/SermonSection';
import WorshipPrepPanel from '../features/worship-prep-ui/WorshipPrepPanel';
import BroadcastPanel from '../features/broadcast/BroadcastPanel';
import ServicePrepPanel from '../features/service-prep/ServicePrepPanel';
import BoardPanel from '../features/board/BoardPanel';
import ProfilePanel from '../features/membership/ProfilePanel';
import AuthGate from '../features/membership/AuthGate';
import TeamHeader from '../features/home/TeamHeader';
import TeamHomePanel from '../features/home/TeamHomePanel';
import { VIEW_TITLE, loadMe, type Me, type View } from '../features/home/menu';

export default function WorkspaceTabs() {
  const [view, setView] = useState<View>('home');
  /* 확인 전에는 아무 것도 안 보여 준다 — 잠깐 보였다 사라지는 것이 더 헷갈린다 */
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => { void loadMe().then(setMe); }, []);

  /* 자리를 옮기면 위로 올려 준다 — 아래를 보다 들어가면 새 화면 중간이 열린다 */
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  if (!me) return <main className="team-home" />;

  return (
    <div className="team-home">
      <TeamHeader me={me} view={view} onOpen={setView} />

      {view === 'home' ? (
        <TeamHomePanel me={me} onOpen={setView} />
      ) : (
        <>
          {/* 지금 어디인지와 나가는 길 — 머리 아래 한 줄로 둔다 */}
          <div className="page-crumb">
            <button type="button" className="crumb-back" onClick={() => setView('home')}>← 홈</button>
            <span className="crumb-title">{VIEW_TITLE[view]}</span>
          </div>

          {/* 입력 화면은 로그인·참여를 마친 사람만 — 연주용 악보 보기는 그대로 열려 있다 */}
          <AuthGate>
            {view === 'choir' && <ChoirRequestPanel />}
            {view === 'sermon' && <SermonSection />}
            {view === 'worship' && <WorshipPrepPanel />}
            {view === 'broadcast' && <BroadcastPanel />}
            {view === 'prep' && <ServicePrepPanel />}
            {view === 'board' && <BoardPanel />}
            {view === 'profile' && <ProfilePanel />}
          </AuthGate>
        </>
      )}
    </div>
  );
}
