'use client';

// 팀 홈 — 로그인하면 도착하는 자리.
//
// 전에는 여기가 스쳐 가는 랜딩이었다. 큰 글씨와 말씀이 있고 버튼 몇 개가 있어서,
// 누르고 나면 다시 올 일이 없었다. 갈 곳이 하나뿐인 사람은 아예 건너뛰고 지나갔다.
// 그래서 게시판에 글이 올라와도 아무도 몰랐다 — 보이는 자리가 없었기 때문이다.
//
// 매주 여는 첫 화면으로 바꾼다. 여기 있는 것은 셋뿐이다. 더 늘리지 않는다 —
// 예배 직전에 여는 화면이라 눈이 헤매면 안 된다.
//
//   1. 오늘 할 일    자막 올리기 같은 것. 권한이 있는 기능만 나온다
//   2. 다음 예배      준비곡과 악보. 찬양대는 최근 올린 자막 곡
//   3. 게시판 최신글  팀원 교제와 공지가 여기서 눈에 띄어야 게시판이 산다
//
// 상단 바 왼쪽의 팀 이름은 로고 자리다 — 담당자가 정한 이름이 그대로 온다.
// 카페에 들어가면 카페 이름이 먼저 보이는 것과 같다. 오른쪽은 내 이름과 삼선이다.

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '../../lib/authn/supabaseBrowser';
import { MENU, type Can, type FeatureId } from './menu';

interface BoardPost {
  id: string;
  category: string;
  title: string;
  pinned: boolean;
  comment_count: number | null;
  created_at: string;
}

interface PrepSong {
  service_date: string | null;
  service_type: string;
  team: string;
  title: string;
  song_key: string | null;
  sung_key: string | null;
}

interface ChoirSong {
  id: string;
  song_title: string;
  service_date: string | null;
}

interface TeamHomeProps {
  can: Can;
  onOpen: (id: FeatureId) => void;
  onBoard: () => void;
}

/** 8월 24일 — 연도는 뗀다. 다음 예배를 보는 자리라 올해가 아닐 일이 없다 */
function dayLabel(value: string | null): string {
  if (!value) return '날짜 없음';
  const [, month, day] = value.split('-');
  if (!month || !day) return value;
  return `${Number(month)}월 ${Number(day)}일`;
}

export default function TeamHomePanel({ can, onOpen, onBoard }: TeamHomeProps) {
  const [name, setName] = useState('');
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [prep, setPrep] = useState<PrepSong[]>([]);
  const [choir, setChoir] = useState<ChoirSong[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await (await fetch('/api/membership/me')).json();
        setName((me?.name ?? '').trim());
        setTeams((me?.teams ?? {}) as Record<string, string>);
        setCategories((me?.teamCategories ?? {}) as Record<string, string>);
        setIsAdmin(me?.churchRole === 'admin');
      } catch { /* 이름이 없으면 없는 대로 — 홈이 열리는 것이 먼저다 */ }
    })();
  }, []);

  /* 게시판은 볼 수 있는 사람에게만 부른다. 못 보는 사람에게 빈 카드를 보이지 않는다 */
  useEffect(() => {
    if (!can.board) return;
    (async () => {
      try {
        const json = await (await fetch('/api/board?limit=5')).json();
        setPosts((json?.posts ?? []) as BoardPost[]);
      } catch { /* 못 불러오면 카드가 '아직 글이 없습니다'로 남는다 */ }
    })();
  }, [can.board]);

  const prepTeam = Object.entries(categories).find(([, category]) => category === '준비찬양')?.[0] ?? '';
  const choirTeam = Object.entries(categories).find(([, category]) => category === '찬양대')?.[0] ?? '';

  /* 다음 예배 — 준비찬양 팀은 곡과 악보를, 찬양대는 최근 올린 자막 곡을 본다.
     둘 다 맡았으면 악보가 있는 쪽을 보여 준다. 악보가 예배 중에 더 급하다. */
  useEffect(() => {
    if (!prepTeam) return;
    (async () => {
      try {
        const json = await (await fetch(`/api/worship-prep?team=${encodeURIComponent(prepTeam)}&limit=20`)).json();
        setPrep((json?.songs ?? []) as PrepSong[]);
      } catch { /* 비어 있으면 카드가 안 나온다 */ }
    })();
  }, [prepTeam]);

  useEffect(() => {
    if (prepTeam || !choirTeam) return;
    (async () => {
      try {
        const json = await (await fetch('/api/choir-requests?limit=3')).json();
        setChoir((json?.requests ?? []) as ChoirSong[]);
      } catch { /* 위와 같다 */ }
    })();
  }, [prepTeam, choirTeam]);

  const signOut = useCallback(async () => {
    await createClient()?.auth.signOut();
    window.location.reload();
  }, []);

  const menu = MENU.filter((item) => can[item.can]);
  const teamNames = Object.keys(teams);
  /* 로고 자리 — 맡은 팀 이름이 곧 이름표다. 팀이 없는 관리자·목회자에게는 교회 이름을 쓴다 */
  const logo = teamNames.length > 0 ? teamNames.join(' · ') : 'ULJU';
  const logoSub = teamNames.length > 0
    ? [...new Set(teamNames.map((team) => categories[team]).filter(Boolean))].join(' · ')
    : 'COMMUNITY';
  const isLeader = Object.values(teams).includes('leader');

  /* 같은 날짜의 곡만 묶어 보여 준다 — 목록 전체를 늘어놓으면 이번 주가 안 보인다 */
  const nextDate = prep[0]?.service_date ?? null;
  const nextSongs = prep.filter((song) => song.service_date === nextDate);

  return (
    <main className="team-home">
      <header className="team-top">
        <div className="team-logo">
          {logo}
          <small>{logoSub}</small>
        </div>
        <div className="team-top-right">
          {name && <span className="team-user">{name}</span>}
          <button
            type="button"
            className="team-menu-btn"
            aria-label="메뉴"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
        </div>

        {menuOpen && (
          <>
            {/* 바깥을 누르면 닫힌다 — 메뉴를 열어 놓고 나갈 길이 있어야 한다 */}
            <button className="team-menu-scrim" type="button" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
            <nav className="team-menu" aria-label="이동">
              {menu.map((item) => (
                <button key={item.id} type="button" onClick={() => { setMenuOpen(false); onOpen(item.id); }}>
                  {item.label}
                </button>
              ))}
              {can.board && (
                <button type="button" onClick={() => { setMenuOpen(false); onBoard(); }}>게시판</button>
              )}
              {isLeader && <a href="/my">팀원 초대</a>}
              {isAdmin && <a href="/admin">코드 관리</a>}
              <button type="button" className="danger" onClick={() => void signOut()}>로그아웃</button>
            </nav>
          </>
        )}
      </header>

      <div className="home-shell">
        {menu.length === 0 ? (
          <section className="home-card">
            <h2>아직 들어갈 수 있는 곳이 없습니다</h2>
            <p className="home-empty">담당자에게 초대 링크를 받아 주세요.</p>
          </section>
        ) : (
          <section className="home-card">
            <div className="home-card-head"><h2>오늘 할 일</h2></div>
            <div className="home-actions">
              {menu.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`home-action${index === 0 ? ' primary' : ''}`}
                  onClick={() => onOpen(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.desc}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {nextSongs.length > 0 && (
          <section className="home-card">
            <div className="home-card-head">
              <h2>다음 예배</h2>
              <span className="home-when">{dayLabel(nextDate)} {nextSongs[0]?.service_type}</span>
            </div>
            <ol className="home-songs">
              {nextSongs.map((song, index) => (
                <li className="home-song" key={`${song.title}-${index}`}>
                  {index + 1}. {song.title}
                  {(song.sung_key || song.song_key) && <span>{song.sung_key || song.song_key}</span>}
                </li>
              ))}
            </ol>
            {/* 반주자는 이 링크를 아이패드에 띄워 놓고 연주한다 */}
            <a
              className="home-play"
              href={`/worship/play?team=${encodeURIComponent(prepTeam)}`}
              target="_blank"
              rel="noreferrer"
            >
              🎹 연주용 악보 보기
            </a>
          </section>
        )}

        {!prepTeam && choir.length > 0 && (
          <section className="home-card">
            <div className="home-card-head"><h2>최근 올린 자막</h2></div>
            <ol className="home-songs">
              {choir.map((song) => (
                <li className="home-song" key={song.id}>
                  {song.song_title || '제목 없는 곡'}
                  <span>{dayLabel(song.service_date)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {can.board && (
          <section className="home-card">
            <div className="home-card-head">
              <h2>게시판</h2>
              <button type="button" className="home-more" onClick={onBoard}>전체보기 →</button>
            </div>
            {posts.length === 0 ? (
              <p className="home-empty">아직 올라온 글이 없습니다.</p>
            ) : (
              posts.map((post) => (
                <button type="button" className="home-post" key={post.id} onClick={onBoard}>
                  <span className="home-chip">{post.pinned ? '📌 ' : ''}{post.category}</span>
                  <span className="home-post-title">{post.title}</span>
                  {(post.comment_count ?? 0) > 0 && <span className="home-post-meta">💬 {post.comment_count}</span>}
                </button>
              ))
            )}
          </section>
        )}
      </div>
    </main>
  );
}
