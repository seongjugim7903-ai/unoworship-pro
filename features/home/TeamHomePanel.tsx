'use client';

// 팀 홈의 본문 — 머리(TeamHeader)는 위에 따로 있고, 여기는 카드만 그린다.
//
// 전에는 여기가 스쳐 가는 랜딩이었다. 큰 글씨와 말씀이 있고 버튼 몇 개가 있어서,
// 누르고 나면 다시 올 일이 없었다. 갈 곳이 하나뿐인 사람은 아예 건너뛰고 지나갔다.
// 그래서 게시판에 글이 올라와도 아무도 몰랐다 — 보이는 자리가 없었기 때문이다.
//
// 매주 여는 첫 화면으로 바꾼다. 카드는 셋뿐이다. 더 늘리지 않는다 —
// 예배 직전에 여는 화면이라 눈이 헤매면 안 된다.
//
//   1. 오늘 할 일    권한이 있는 기능만. 첫 줄이 그 사람이 하러 들어온 일이다
//   2. 다음 예배      준비곡과 악보. 찬양대는 최근 올린 자막 곡
//   3. 게시판 최신글  팀원 교제와 공지가 여기서 눈에 띄어야 게시판이 산다

import { useEffect, useState } from 'react';
import { MENU, type Me, type View } from './menu';

interface BoardPost {
  id: string;
  category: string;
  title: string;
  pinned: boolean;
  comment_count: number | null;
}

interface PrepSong {
  service_date: string | null;
  service_type: string;
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
  me: Me;
  onOpen: (view: View) => void;
}

/** 8월 24일 — 연도는 뗀다. 다음 예배를 보는 자리라 올해가 아닐 일이 없다 */
function dayLabel(value: string | null): string {
  if (!value) return '날짜 없음';
  const [, month, day] = value.split('-');
  if (!month || !day) return value;
  return `${Number(month)}월 ${Number(day)}일`;
}

/** 26.8.23 — 버튼 안에 들어가는 짧은 날짜. 괄호에 넣어 언제 것인지 보이게 한다 */
function shortDate(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${year.slice(2)}.${Number(month)}.${Number(day)}`;
}

/**
 * 악보 버튼에 붙는 말.
 *
 * 올려 둔 것이 늘 다음 주 것은 아니다 — 이번 주 것을 아직 안 올렸으면 지난주 것이
 * 가장 최근이다. 그때 '다음주'라고 적으면 화면이 거짓말을 한다. 날짜를 보고 말한다.
 */
function playLabel(value: string): string {
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const when = new Date(`${value}T00:00:00`).getTime();
  if (Number.isNaN(when)) return '악보보기';
  if (when > midnight) return '다음주 악보보기';
  if (when === midnight) return '오늘 악보보기';
  return '지난주 악보보기';
}

export default function TeamHomePanel({ me, onOpen }: TeamHomeProps) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [prep, setPrep] = useState<PrepSong[]>([]);
  const [choir, setChoir] = useState<ChoirSong[]>([]);

  const canBoard = me.can.board;
  const prepTeam = Object.entries(me.teamCategories).find(([, category]) => category === '준비찬양')?.[0] ?? '';
  const choirTeam = Object.entries(me.teamCategories).find(([, category]) => category === '찬양대')?.[0] ?? '';

  /* 게시판은 볼 수 있는 사람에게만 부른다. 못 보는 사람에게 빈 카드를 보이지 않는다 */
  useEffect(() => {
    if (!canBoard) return;
    (async () => {
      try {
        const json = await (await fetch('/api/board?limit=5')).json();
        setPosts((json?.posts ?? []) as BoardPost[]);
      } catch { /* 못 불러오면 '아직 올라온 글이 없습니다'로 남는다 */ }
    })();
  }, [canBoard]);

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

  const menu = MENU.filter((item) => me.can[item.can]);
  /* 같은 날짜의 곡만 묶어 보여 준다 — 목록 전체를 늘어놓으면 이번 주가 안 보인다 */
  const nextDate = prep[0]?.service_date ?? null;
  const nextSongs = prep.filter((song) => song.service_date === nextDate);

  return (
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
          {/* 반주자는 이 버튼을 아이패드에 띄워 놓고 연주한다 — 언제 것인지 괄호에 적는다 */}
          <a
            className="home-play"
            href={`/worship/play?team=${encodeURIComponent(prepTeam)}`}
            target="_blank"
            rel="noreferrer"
          >
            🎹 {nextDate ? `${playLabel(nextDate)} (${shortDate(nextDate)})` : '악보보기'}
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

      {canBoard && (
        <section className="home-card">
          <div className="home-card-head">
            <h2>게시판</h2>
            <button type="button" className="home-more" onClick={() => onOpen('board')}>전체보기 →</button>
          </div>
          {posts.length === 0 ? (
            <p className="home-empty">아직 올라온 글이 없습니다.</p>
          ) : (
            posts.map((post) => (
              <button type="button" className="home-post" key={post.id} onClick={() => onOpen('board')}>
                <span className="home-chip">{post.pinned ? '📌 ' : ''}{post.category}</span>
                <span className="home-post-title">{post.title}</span>
                {(post.comment_count ?? 0) > 0 && <span className="home-post-meta">💬 {post.comment_count}</span>}
              </button>
            ))
          )}
        </section>
      )}
    </div>
  );
}
