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
import { croppedAspect, NO_CROP, readSheetPages, type SheetPage } from '../../lib/worship-prep/sheetPages';

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
  sheet_pages?: SheetPage[];
}

/** 화면이 넘기는 단위는 곡이 아니라 페이지다 — 실제 악보는 2~4페이지다 */
interface Leaf {
  song: PrepSong;
  songIndex: number;
  page: SheetPage | null;
  /** 그 곡 안에서 몇 번째 장인지 (1부터) */
  pageNo: number;
  pageCount: number;
}

/**
 * 악보 한 장. 크롭이 있으면 그만큼 확대·이동해 여백을 걷어낸다.
 *
 * 감싼 상자를 잘린 비율로 두고 이미지를 1/보이는비율 만큼 키워 밀어 넣는다.
 * 원본 크기를 모르면(예전 악보) 자르지 않고 그대로 그린다.
 */
function SheetPageView({ page, alt }: { page: SheetPage; alt: string }) {
  const aspect = croppedAspect(page);
  const crop = page.crop ?? NO_CROP;
  const visibleW = 1 - crop.l - crop.r;
  const visibleH = 1 - crop.t - crop.b;

  if (!aspect || visibleW <= 0 || visibleH <= 0) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="play-page-plain" src={sheetUrl(page.path)} alt={alt} />;
  }

  return (
    <div className="play-page" style={{ aspectRatio: String(aspect) }}>
      {/* 서명 URL 리다이렉트라 next/image 로는 못 다룬다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sheetUrl(page.path)}
        alt={alt}
        style={{
          width: `${(1 / visibleW) * 100}%`,
          left: `${(-crop.l / visibleW) * 100}%`,
          top: `${(-crop.t / visibleH) * 100}%`,
        }}
      />
    </div>
  );
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
  /* 가로 2페이지 펼침 */
  const [spread, setSpread] = useState(false);
  /* 메트로놈 — 템포를 이미 저장하고 있으니 켜기만 하면 된다 */
  const [ticking, setTicking] = useState(false);
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

  /* 곡을 페이지로 편다. 악보가 없는 곡도 한 자리를 차지한다 — 셋에서 빠지면 안 된다 */
  const leaves = useMemo<Leaf[]>(() => songs.flatMap((song, songIndex): Leaf[] => {
    const pages = readSheetPages(song);
    if (pages.length === 0) return [{ song, songIndex, page: null, pageNo: 1, pageCount: 1 }];
    return pages.map((page, i) => ({ song, songIndex, page, pageNo: i + 1, pageCount: pages.length }));
  }), [songs]);

  /* 곡 번호 → 그 곡의 첫 장 */
  const firstLeafOfSong = useMemo(() => {
    const map = new Map<number, number>();
    leaves.forEach((leaf, i) => { if (!map.has(leaf.songIndex)) map.set(leaf.songIndex, i); });
    return map;
  }, [leaves]);

  /* 셋 악보를 한 번에 받아 둔다 — 예배 중에 네트워크가 흔들려도 넘어간다 */
  useEffect(() => {
    for (const leaf of leaves) {
      if (!leaf.page) continue;
      const img = new Image();
      img.src = sheetUrl(leaf.page.path);
    }
  }, [leaves]);

  /* 가로로 눕히면 세로 악보 두 장이 나란히 들어간다 — 넘김이 절반으로 준다 */
  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape) and (min-width: 1000px)');
    const update = () => setSpread(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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

  const step = spread ? 2 : 1;
  const move = useCallback((delta: number) => {
    setIndex((prev) => Math.min(Math.max(prev + delta * step, 0), Math.max(leaves.length - 1, 0)));
  }, [leaves.length, step]);

  /* 블루투스 발 페달은 대개 방향키나 PageUp/Down 을 보낸다 — 키로 받아두면 그냥 된다.
     숫자키는 인도자가 순서를 건너뛸 때 쓴다(3번 곡으로 바로). */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); move(1); }
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); move(-1); }
      else if (event.key === 'Home') { event.preventDefault(); setIndex(0); }
      else if (event.key === 'End') { event.preventDefault(); setIndex(Math.max(leaves.length - 1, 0)); }
      else if (event.key === 'l' || event.key === 'L') setListOpen((open) => !open);
      else if (event.key === 'Escape') {
        /* 목록이 열려 있으면 닫고, 아니면 머리말·레일을 접어 악보를 키운다 */
        setListOpen((open) => { if (open) return false; setChromeOpen((c) => !c); return open; });
      } else if (event.key === 'm' || event.key === 'M') {
        setTicking((on) => !on);
      } else if (/^[1-9]$/.test(event.key)) {
        const target = firstLeafOfSong.get(Number(event.key) - 1);
        if (target !== undefined) { setIndex(target); setListOpen(false); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, leaves.length, firstLeafOfSong]);

  /* 메트로놈 — 첫 박만 높게. 저장된 BPM 을 그대로 쓴다 */
  useEffect(() => {
    if (!ticking) return;
    const bpm = songs[leaves[index]?.songIndex ?? 0]?.tempo_bpm;
    if (!bpm) { setTicking(false); return; }

    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) { setTicking(false); return; }
    const context = new AudioCtor();
    let beat = 0;
    const tick = () => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = beat % 4 === 0 ? 1400 : 900;
      gain.gain.setValueAtTime(0.22, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.05);
      osc.connect(gain).connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.05);
      beat += 1;
    };
    tick();
    const timer = window.setInterval(tick, 60000 / bpm);
    return () => { window.clearInterval(timer); void context.close(); };
  }, [ticking, index, leaves, songs]);

  const leaf = leaves[index];
  const current = leaf?.song;
  const songIndex = leaf?.songIndex ?? 0;
  /* 펼침일 때는 오른쪽 장까지 보이므로 그 다음부터가 '다음'이다 */
  const nextLeaf = leaves[index + step];

  const upcomingLabel = useMemo(() => {
    if (!nextLeaf) return '마지막 장입니다';
    if (nextLeaf.songIndex === songIndex) return `이 곡 ${nextLeaf.pageNo}/${nextLeaf.pageCount}쪽`;
    const song = nextLeaf.song;
    return `다음 곡 · ${song.title}${playMeta(song) ? ` (${playMeta(song)})` : ''}`;
  }, [nextLeaf, songIndex]);

  if (status === 'loading') return <div className="play-state">악보를 불러오는 중...</div>;
  if (status === 'error') return <div className="play-state">{message}</div>;
  if (status === 'empty') return <div className="play-state">이 팀에 저장된 준비찬양이 없습니다.</div>;

  return (
    <div className={`play-root${chromeOpen ? '' : ' chrome-hidden'}`}>
      <header className="play-head">
        <div className="play-head-main">
          <span className="play-count">
            {songIndex + 1}/{songs.length}
            {leaf && leaf.pageCount > 1 && <em> · {leaf.pageNo}쪽</em>}
          </span>
          <strong className="play-title">{current.title}</strong>
          {playMeta(current) && <span className="play-meta">{playMeta(current)}</span>}
          <span className="play-arrangement">{arrangementLabel(current)}</span>
        </div>
        <div className="play-head-actions">
          {current?.tempo_bpm ? (
            <button type="button" className={`play-icon${ticking ? ' on' : ''}`}
              aria-label="메트로놈 (M)" title={`메트로놈 ${current.tempo_bpm}BPM · M`}
              onClick={() => setTicking((on) => !on)}>♩</button>
          ) : null}
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
          <div className={`play-pages${spread ? ' spread' : ''}`}>
            {[leaf, spread ? leaves[index + 1] : null].map((item, slot) => {
              if (!item) return null;
              if (!item.page) {
                return <div className="play-nosheet" key={slot}><p>이 곡은 악보가 없습니다.</p></div>;
              }
              if (item.page.contentType === 'application/pdf') {
                return (
                  <div className="play-nosheet" key={slot}>
                    <p>PDF 악보입니다.</p>
                    <a className="play-open" href={sheetUrl(item.page.path)} target="_blank" rel="noreferrer">따로 열기</a>
                  </div>
                );
              }
              return (
                <SheetPageView
                  key={`${item.page.path}-${slot}`}
                  page={item.page}
                  alt={`${item.song.title} 악보 ${item.pageNo}쪽`}
                />
              );
            })}
          </div>

          {/* 손이 건반에 있다 — 화면 양끝을 크게 잡아 대충 눌러도 넘어가게 한다 */}
          <button type="button" className="play-zone left" aria-label="이전 곡" onClick={() => move(-1)} />
          <button type="button" className="play-zone right" aria-label="다음 곡" onClick={() => move(1)} />
          <p className="play-upnext">{upcomingLabel}</p>
        </div>

        <nav className="play-list" aria-label="셋 목록">
          {songs.map((song, order) => {
            const state = order === songIndex ? 'current' : order === songIndex + 1 ? 'next' : '';
            return (
              <button
                type="button"
                key={song.id}
                className={`play-list-item ${state}`}
                onClick={() => setIndex(firstLeafOfSong.get(order) ?? 0)}
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
                className={`play-overlay-item ${order === songIndex ? 'current' : order === songIndex + 1 ? 'next' : ''}`}
                onClick={() => { setIndex(firstLeafOfSong.get(order) ?? 0); setListOpen(false); }}
              >
                <span className="play-list-no">{order + 1}</span>
                <span className="play-list-body">
                  <strong>{song.title}</strong>
                  <em>{playMeta(song) || '조·템포 미입력'}</em>
                </span>
                {order === songIndex && <span className="play-list-badge">지금</span>}
                {order === songIndex + 1 && <span className="play-list-badge">다음</span>}
              </button>
            ))}
          </div>
          <p className="play-shortcuts">
            <span><b>← →</b> 이전·다음 (발 페달)</span>
            <span><b>1–9</b> 그 번호 곡으로</span>
            <span><b>M</b> 메트로놈</span>
            <span><b>L</b> 이 목록</span>
            <span><b>Esc</b> 넓게 보기</span>
          </p>
        </div>
      )}
    </div>
  );
}
