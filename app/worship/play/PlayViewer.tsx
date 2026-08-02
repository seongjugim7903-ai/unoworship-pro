'use client';

// 연주용 악보 보기 — 찬양 중에 반주자·인도자가 아이패드로 본다.
//
// 설계 기준이 "저장이 되는가"가 아니라 "연주 중에 쓸 만한가" 다.
//   · 손이 건반에 있다 → 넘김을 키 이벤트로 받는다. 블루투스 발 페달이 그대로 동작한다
//   · 화면이 잠기면 사고다 → Wake Lock 을 건다
//   · 예배 중 네트워크를 믿지 않는다 → 셋 악보를 들어올 때 한 번에 받아 둔다
//   · 어두운 예배당에서 다크모드는 오히려 안 읽힌다 → 흰 배경을 고정한다
//   · 한 예배에 여러 곡이다 → 셋 스트립으로 지금 곡과 '다음' 곡이 한눈에 들어오게 한다

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface PrepSong {
  id: string;
  service_date: string | null;
  service_type: string;
  team: string;
  song_order: number;
  title: string;
  song_key: string;
  sung_key: string;
  tempo_bpm: number | null;
  time_signature: string;
  arrangement: string;
  arrangement_custom: string;
  sheet_path: string | null;
  sheet_content_type: string | null;
}

function sheetUrl(path: string) {
  return `/api/worship-sheet?path=${encodeURIComponent(path)}`;
}

function arrangementLabel(song: PrepSong) {
  if (song.arrangement === 'custom') return song.arrangement_custom || '직접 기입';
  if (song.arrangement === 'chorus_only') return '후렴만';
  return '후렴 먼저';
}

/** 반주자가 먼저 보는 값들 — 부르는 조 · 템포 · 박자 */
function playMeta(song: PrepSong) {
  return [
    song.sung_key.trim() || song.song_key.trim(),
    song.tempo_bpm ? `${song.tempo_bpm}BPM` : '',
    song.time_signature.trim(),
  ].filter(Boolean).join(' · ');
}

export default function PlayViewer() {
  const [songs, setSongs] = useState<PrepSong[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [index, setIndex] = useState(0);
  const [chromeOpen, setChromeOpen] = useState(true);
  /* 세로 모드는 아래 스트립에 한두 곡만 보인다 — 전체를 한 번에 보는 오버레이가 따로 필요하다 */
  const [listOpen, setListOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  /* 어느 셋을 볼 것인가 — ?team=&date= 로 지정하고, 없으면 그 팀의 가장 최근 셋 */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const team = params.get('team') ?? '';
    const date = params.get('date') ?? '';

    (async () => {
      try {
        const query = new URLSearchParams({ limit: '100' });
        if (team) query.set('team', team);
        const response = await fetch(`/api/worship-prep?${query.toString()}`);
        const result = await response.json() as { ok?: boolean; songs?: PrepSong[]; message?: string };
        if (!result.ok || !Array.isArray(result.songs)) {
          setStatus('error');
          setMessage(result.message ?? '준비찬양을 불러오지 못했습니다.');
          return;
        }
        /* 날짜를 안 주면 가장 최근 셋을 본다 — 목록이 service_date 내림차순이므로 맨 앞 날짜다 */
        const targetDate = date || result.songs[0]?.service_date || '';
        const set = result.songs
          .filter((song) => (song.service_date ?? '') === targetDate)
          .sort((a, b) => a.song_order - b.song_order);

        setSongs(set);
        setStatus(set.length > 0 ? 'ready' : 'empty');
      } catch {
        setStatus('error');
        setMessage('준비찬양을 불러오지 못했습니다.');
      }
    })();
  }, []);

  /* 셋 악보를 한 번에 받아 둔다 — 예배 중에 네트워크가 흔들려도 넘어간다 */
  useEffect(() => {
    for (const song of songs) {
      if (!song.sheet_path) continue;
      const img = new Image();
      img.src = sheetUrl(song.sheet_path);
    }
  }, [songs]);

  /* 화면이 잠기면 손이 건반에 있는 채로 악보가 사라진다 */
  useEffect(() => {
    if (status !== 'ready') return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock?.request('screen') ?? null;
      } catch {
        // 미지원·거부는 그냥 넘어간다 — 화면이 잠길 뿐 기능은 동작한다
      }
      if (cancelled) { void sentinel?.release(); sentinel = null; }
    };
    void acquire();

    /* 탭을 다시 열면 잠금이 풀려 있다 */
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [status]);

  const move = useCallback((delta: number) => {
    setIndex((prev) => Math.min(Math.max(prev + delta, 0), Math.max(songs.length - 1, 0)));
  }, [songs.length]);

  /* 블루투스 발 페달은 대개 방향키나 PageUp/Down 을 보낸다 — 키로 받아두면 그냥 된다.
     숫자키는 인도자가 순서를 건너뛸 때 쓴다(3번 곡으로 바로). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); move(1); }
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); move(-1); }
      else if (event.key === 'Home') { event.preventDefault(); setIndex(0); }
      else if (event.key === 'End') { event.preventDefault(); setIndex(Math.max(songs.length - 1, 0)); }
      else if (event.key === 'l' || event.key === 'L') setListOpen((open) => !open);
      else if (event.key === 'Escape') {
        /* 목록이 열려 있으면 닫고, 아니면 머리말·레일을 접어 악보를 키운다 */
        setListOpen((open) => { if (open) return false; setChromeOpen((c) => !c); return open; });
      } else if (/^[1-9]$/.test(event.key)) {
        const target = Number(event.key) - 1;
        if (target < songs.length) { setIndex(target); setListOpen(false); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, songs.length]);

  const current = songs[index];
  const next = songs[index + 1];

  const upcomingLabel = useMemo(() => {
    if (!next) return '마지막 곡입니다';
    return `다음 · ${next.title}${playMeta(next) ? ` (${playMeta(next)})` : ''}`;
  }, [next]);

  if (status === 'loading') return <div className="play-state">악보를 불러오는 중...</div>;
  if (status === 'error') return <div className="play-state">{message}</div>;
  if (status === 'empty') return <div className="play-state">이 팀에 저장된 준비찬양이 없습니다.</div>;

  return (
    <div className={`play-root${chromeOpen ? '' : ' chrome-hidden'}`}>
      <header className="play-head">
        <div className="play-head-main">
          <span className="play-count">{index + 1} / {songs.length}</span>
          <strong className="play-title">{current.title}</strong>
          {playMeta(current) && <span className="play-meta">{playMeta(current)}</span>}
          <span className="play-arrangement">{arrangementLabel(current)}</span>
        </div>
        <div className="play-head-actions">
          <button type="button" className="play-icon" aria-label="전체 목록 (L)" title="전체 목록 · L"
            onClick={() => setListOpen(true)}>☰</button>
          <button type="button" className="play-icon" aria-label={chromeOpen ? '넓게 보기' : '머리말 보기'}
            title={chromeOpen ? '넓게 보기 · Esc' : '머리말 보기 · Esc'}
            onClick={() => setChromeOpen((open) => !open)}>{chromeOpen ? '⤢' : '⤡'}</button>
        </div>
      </header>

      <div className="play-body">
        <div
          className="play-sheet"
          onTouchStart={(event) => {
            const touch = event.changedTouches[0];
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            if (!start) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            /* 세로로 크게 움직인 것은 확대·스크롤 의도로 보고 넘기지 않는다 */
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(touch.clientY - start.y)) move(dx < 0 ? 1 : -1);
            touchStartRef.current = null;
          }}
        >
          {current.sheet_path ? (
            current.sheet_content_type === 'application/pdf' ? (
              <div className="play-nosheet">
                <p>PDF 악보입니다.</p>
                <a className="play-open" href={sheetUrl(current.sheet_path)} target="_blank" rel="noreferrer">따로 열기</a>
              </div>
            ) : (
              /* 서명 URL 리다이렉트라 next/image 로는 못 다룬다 */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sheetUrl(current.sheet_path)} alt={`${current.title} 악보`} />
            )
          ) : (
            <div className="play-nosheet"><p>이 곡은 악보가 없습니다.</p></div>
          )}

          {/* 손이 건반에 있다 — 화면 양끝을 크게 잡아 대충 눌러도 넘어가게 한다 */}
          <button type="button" className="play-zone left" aria-label="이전 곡" onClick={() => move(-1)} />
          <button type="button" className="play-zone right" aria-label="다음 곡" onClick={() => move(1)} />
          <p className="play-upnext">{upcomingLabel}</p>
        </div>

        <nav className="play-list" aria-label="셋 목록">
          {songs.map((song, order) => {
            const state = order === index ? 'current' : order === index + 1 ? 'next' : '';
            return (
              <button
                type="button"
                key={song.id}
                className={`play-list-item ${state}`}
                onClick={() => setIndex(order)}
              >
                <span className="play-list-no">{order + 1}</span>
                <span className="play-list-body">
                  <strong>{song.title}</strong>
                  <em>{playMeta(song) || '조·템포 미입력'}</em>
                </span>
                {state === 'next' && <span className="play-list-badge">다음</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {listOpen && (
        <div className="play-overlay" role="dialog" aria-label="전체 곡 목록">
          <div className="play-overlay-head">
            <strong>전체 곡 {songs.length}개</strong>
            <button type="button" className="play-icon" aria-label="닫기" onClick={() => setListOpen(false)}>✕</button>
          </div>
          <div className="play-overlay-grid">
            {songs.map((song, order) => (
              <button
                type="button"
                key={song.id}
                className={`play-overlay-item ${order === index ? 'current' : order === index + 1 ? 'next' : ''}`}
                onClick={() => { setIndex(order); setListOpen(false); }}
              >
                <span className="play-list-no">{order + 1}</span>
                <span className="play-list-body">
                  <strong>{song.title}</strong>
                  <em>{playMeta(song) || '조·템포 미입력'}</em>
                </span>
                {order === index && <span className="play-list-badge">지금</span>}
                {order === index + 1 && <span className="play-list-badge">다음</span>}
              </button>
            ))}
          </div>
          <p className="play-shortcuts">
            <span><b>← →</b> 이전·다음 (발 페달)</span>
            <span><b>1–9</b> 그 번호 곡으로</span>
            <span><b>L</b> 이 목록</span>
            <span><b>Esc</b> 넓게 보기</span>
          </p>
        </div>
      )}
    </div>
  );
}
