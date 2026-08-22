'use client';

// 팀 페이지의 머리 — 어느 자리에 있든 이것은 그대로 있다.
//
// 왼쪽은 팀 이름이다. 담당자가 정한 이름이 그대로 로고 자리에 온다 —
// 카페에 들어가면 카페 이름이 먼저 보이는 것과 같다. 눌러 홈으로 돌아온다.
// 오른쪽은 내 이름과 삼선이다. 삼선 안에 갈 수 있는 곳이 전부 들어 있다.
//
// 화면마다 다른 머리를 달지 않는다. 자리를 옮겨도 같은 자리에 같은 것이 있어야
// 어디에 있는지 알 수 있다 — 예배 직전에 여는 화면이라 더 그렇다.

import { useState } from 'react';
import { createClient } from '../../lib/authn/supabaseBrowser';
import { MENU, type Me, type View } from './menu';

interface TeamHeaderProps {
  me: Me;
  view: View;
  onOpen: (view: View) => void;
}

export default function TeamHeader({ me, view, onOpen }: TeamHeaderProps) {
  const [open, setOpen] = useState(false);

  const teamNames = Object.keys(me.teams);
  /* 팀이 없는 관리자·목회자에게는 교회 이름을 쓴다 — 로고 자리가 비면 허전하다 */
  const logo = teamNames.length > 0 ? teamNames.join(' · ') : 'ULJU';
  const logoSub = teamNames.length > 0
    ? [...new Set(teamNames.map((team) => me.teamCategories[team]).filter(Boolean))].join(' · ')
    : 'COMMUNITY';

  const isAdmin = me.churchRole === 'admin';
  const isLeader = Object.values(me.teams).includes('leader');
  const menu = MENU.filter((item) => me.can[item.can]);

  const go = (next: View) => { setOpen(false); onOpen(next); };

  return (
    <header className="team-top">
      {/* 로고를 누르면 홈이다. 어느 자리에서든 한 번에 돌아오는 길 */}
      <button type="button" className="team-logo" onClick={() => go('home')} aria-current={view === 'home'}>
        {logo}
        <small>{logoSub}</small>
      </button>

      <div className="team-top-right">
        {me.name && <span className="team-user">{me.name}</span>}
        <button
          type="button"
          className="team-menu-btn"
          aria-label="메뉴"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          ☰
        </button>
      </div>

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다 — 메뉴를 열어 놓고 나갈 길이 있어야 한다 */}
          <button className="team-menu-scrim" type="button" aria-label="메뉴 닫기" onClick={() => setOpen(false)} />
          <nav className="team-menu" aria-label="이동">
            <button type="button" onClick={() => go('home')}>홈</button>
            {menu.map((item) => (
              <button key={item.id} type="button" onClick={() => go(item.id)}>{item.label}</button>
            ))}
            {me.can.board && <button type="button" onClick={() => go('board')}>게시판</button>}
            <span className="team-menu-line" />
            <button type="button" onClick={() => go('profile')}>내 정보</button>
            {isLeader && <a href="/my">팀 관리</a>}
            {isAdmin && <a href="/admin">코드 관리</a>}
            <button
              type="button"
              className="danger"
              onClick={async () => {
                await createClient()?.auth.signOut();
                window.location.reload();
              }}
            >
              로그아웃
            </button>
          </nav>
        </>
      )}
    </header>
  );
}
