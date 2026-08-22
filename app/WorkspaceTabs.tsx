'use client';

// 홈 → 각 기능 진입. 탭 상시 노출을 없애 오조작을 줄인다.
//
// 홈은 팀 홈(features/home/TeamHomePanel)이다. 스쳐 가는 랜딩이 아니라 매주 여는
// 첫 화면이라, 갈 곳이 하나뿐이어도 건너뛰지 않는다 — 건너뛰면 게시판에 글이
// 올라와도 아무도 모른다. 홈에서 무엇이 있었는지 보고 들어가야 한다.

import { useEffect, useState } from 'react';
import ChoirRequestPanel from '../features/choir/ChoirRequestPanel';
import SermonSection from '../features/sermon-compose/SermonSection';
import WorshipPrepPanel from '../features/worship-prep-ui/WorshipPrepPanel';
import BroadcastPanel from '../features/broadcast/BroadcastPanel';
import ServicePrepPanel from '../features/service-prep/ServicePrepPanel';
import BoardPanel from '../features/board/BoardPanel';
import AuthGate from '../features/membership/AuthGate';
import TeamHomePanel from '../features/home/TeamHomePanel';
import { ALL_ACCESS, FEATURE_TITLE, NO_ACCESS, type Can, type FeatureId } from '../features/home/menu';

/* 게시판은 홈 목록에 없다 — 홈의 최신글과 각 팀 화면 상단에서 모달로 연다.
   자막협조·준비찬양 등을 하면서 바로 글을 쓰고 닫을 수 있게 하기 위함이다. */
type View = 'home' | FeatureId;

export default function WorkspaceTabs() {
  const [view, setView] = useState<View>('home');
  /* 확인 전에는 아무 것도 안 보여 준다 — 잠깐 보였다 사라지는 것이 더 헷갈린다 */
  const [can, setCan] = useState<Can | null>(null);
  /* 게시판은 각 팀 화면 위에 모달로 얹는다 — 작업 중이던 화면을 잃지 않는다 */
  const [boardOpen, setBoardOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await (await fetch('/api/membership/me')).json();
        /* 저장 환경이 없는 배포에서는 막지 않는다 — 화면이 통째로 비면 손쓸 방법이 없다 */
        setCan(me?.unavailable ? ALL_ACCESS : { ...NO_ACCESS, ...(me?.can ?? {}) });
      } catch {
        setCan(ALL_ACCESS);
      }
    })();
  }, []);

  return (
    <>
      {view === 'home' ? (
        /* 확인이 끝나기 전에는 홈을 그리지 않는다 — 버튼이 없는 홈이 잠깐 보이면 놀란다 */
        can ? <TeamHomePanel can={can} onOpen={setView} onBoard={() => setBoardOpen(true)} /> : <main className="team-home" />
      ) : (
        <>
          <header className="feature-topbar">
            <button className="feature-back" type="button" onClick={() => setView('home')}>← 홈</button>
            <span className="feature-title">{FEATURE_TITLE[view]}</span>
            {can?.board && (
              <button className="feature-board" type="button" onClick={() => setBoardOpen(true)}>💬 게시판</button>
            )}
          </header>
          {/* 입력 화면은 로그인·참여를 마친 사람만 — 홈과 연주용 악보 보기는 그대로 열려 있다 */}
          <AuthGate>
            {view === 'choir' && <ChoirRequestPanel />}
            {view === 'sermon' && <SermonSection />}
            {view === 'worship' && <WorshipPrepPanel />}
            {view === 'broadcast' && <BroadcastPanel />}
            {view === 'prep' && <ServicePrepPanel />}
          </AuthGate>
        </>
      )}

      {/* 게시판은 홈 위에도 얹힌다 — 홈의 최신글을 눌러 바로 여는 길이 여기다 */}
      {boardOpen && (
        <div className="board-modal" role="dialog" aria-label="게시판">
          <button className="board-modal-scrim" type="button" aria-label="닫기" onClick={() => setBoardOpen(false)} />
          <div className="board-modal-sheet">
            <header className="board-modal-head">
              <strong>게시판</strong>
              <button className="board-modal-close" type="button" aria-label="닫기" onClick={() => setBoardOpen(false)}>×</button>
            </header>
            <div className="board-modal-body">
              <BoardPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
