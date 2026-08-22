'use client';

// 준비찬양 — 정기예배·일자·찬양팀별로 준비 곡(제목·악보·조·구성)을 저장한다.

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { nextServiceDate } from '../../lib/nextServiceDate';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import { buildKeyFlow, relationLabel } from '../../lib/worship-prep/songKey';
import { measureSheet } from '../../lib/worship-prep/measureSheet';
import { readSheetPages, type SheetPage } from '../../lib/worship-prep/sheetPages';

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

const SERVICE_TYPES = ['주일낮예배', '주일오후예배', '수요예배', '금요기도회', '월삭감사예배'];
/* 팀은 교회마다 다르므로 서버에서 받는다. 초대받지 않은 팀은 목록에 없다 —
   자기 팀 것만 보여 화면을 단순하게 하는 장치다(features/membership 참조). */
const DRAFT_KEY = 'unoworship-pro:worship-prep-draft:v1';

type Arrangement = 'full' | 'chorus_only' | 'chorus_first' | 'custom';
const ARRANGEMENTS: Array<{ value: Arrangement; label: string }> = [
  // 가장 흔한 경우 — 악보에 있는 절을 1절부터 순서대로 다 부른다. 기본값.
  { value: 'full', label: '절 전체' },
  { value: 'chorus_first', label: '후렴 먼저' },
  { value: 'chorus_only', label: '후렴만' },
  { value: 'custom', label: '직접 기입' },
];

interface SongRow {
  key: string;
  title: string;
  /** 악보에 적힌 조 */
  songKey: string;
  /** 실제로 부르는 조. 악보는 C인데 A로 부르는 일이 흔하다 */
  sungKey: string;
  /** 없으면 매주 다른 속도로 시작한다 */
  tempoBpm: string;
  /** 4/4 · 6/8 — 6/8 을 4/4 로 들어가면 첫 마디에서 무너진다 */
  timeSignature: string;
  arrangement: Arrangement;
  arrangementCustom: string;
  /** 이번에 새로 올리는 악보 — 여러 장. 실제 악보는 보통 2~4페이지다 */
  sheetFiles: File[];
  /** 라이브러리에서 끌어온 페이지 — 다시 올리지 않고 그대로 쓴다 */
  sheetPages: SheetPage[];
}

interface SavedSong {
  id: string;
  service_date: string | null;
  service_type: string;
  team: string;
  title: string;
  song_key: string;
  arrangement: string;
  arrangement_custom: string;
  sheet_path: string | null;
}

/** 곡 라이브러리 한 건 — /api/worship-songs */
interface LibrarySong {
  id: string;
  team: string;
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
  last_used_at: string | null;
}

let rowSeq = 0;
function newRow(): SongRow {
  rowSeq += 1;
  return {
    key: `song-${rowSeq}`, title: '', songKey: '', sungKey: '', tempoBpm: '', timeSignature: '',
    arrangement: 'full', arrangementCustom: '', sheetFiles: [], sheetPages: [],
  };
}

/** 라이브러리 곡의 악보 이미지 주소 — 여러 장이면 첫 장. 악보가 없으면 null */
function sheetSrc(song: LibrarySong, page = 0): string | null {
  const path = song.sheet_pages?.[page]?.path ?? (page === 0 ? song.sheet_path : null);
  return path ? `/api/worship-sheet?path=${encodeURIComponent(path)}` : null;
}

/** 악보 장 수 — sheet_pages 가 없으면 단일 악보(sheet_path) 기준 */
function sheetPageCount(song: LibrarySong): number {
  if (song.sheet_pages?.length) return song.sheet_pages.length;
  return song.sheet_path ? 1 : 0;
}

function arrangementLabel(value: string, custom: string) {
  if (value === 'custom') return custom || '직접 기입';
  return ARRANGEMENTS.find((item) => item.value === value)?.label ?? value;
}

export default function WorshipPrepPanel() {
  /* 도래하는 정기예배를 기본값으로 잡는다(설교대지 페이지와 같은 규칙).
     렌더마다 시각이 흔들리지 않게 한 번만 계산한다. */
  const upcoming = useMemo(() => getUpcomingService(), []);
  const [serviceType, setServiceType] = useState<string>(upcoming.serviceType);
  const [serviceDate, setServiceDate] = useState(upcoming.serviceDate);
  const [team, setTeam] = useState('');
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([newRow()]);
  const [draftReady, setDraftReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [recent, setRecent] = useState<SavedSong[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<LibrarySong[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const searchSeqRef = useRef(0);
  /* 검색 결과의 악보 썸네일을 눌렀을 때 크게 볼 곡.
     데스크톱은 '저장 곡' 자리에 펼치고, 모바일은 전체 화면으로 띄운다. */
  const [sheetPreview, setSheetPreview] = useState<LibrarySong | null>(null);
  /* 곡과 악보를 올리고 고치는 것은 그 팀 담당자만이다. 서버가 같은 규칙으로 막지만
     (features/membership/guard.ts requireTeamEditor), 막히는 것을 눌러 보고 알게 하면
     다 적은 것이 날아간다. 그래서 팀원에게는 입력칸과 저장 버튼을 아예 그리지 않는다.
     null 은 아직 확인 전 — 그때는 폼도 안내도 그리지 않는다. 잠깐 보였다 사라지면 더 헷갈린다. */
  const [editable, setEditable] = useState<{ admin: boolean; teams: Record<string, string> } | null>(null);

  /* 내가 든 준비찬양 팀만 고를 수 있다. 초대받지 않은 팀은 목록에 없다 */
  useEffect(() => {
    (async () => {
      try {
        const me = await (await fetch('/api/membership/me')).json();
        const categories = (me?.teamCategories ?? {}) as Record<string, string>;
        const mine = Object.entries(categories)
          .filter(([, category]) => category === '준비찬양')
          .map(([name]) => name);
        /* 관리자는 모든 준비찬양 팀을 본다 */
        const list = me?.churchRole === 'admin'
          ? ((await (await fetch('/api/teams')).json())?.teams ?? [])
            .filter((t: { category: string }) => t.category === '준비찬양')
            .map((t: { name: string }) => t.name)
          : mine;
        setMyTeams(list);
        setTeam((prev) => (prev && list.includes(prev) ? prev : (list[0] ?? '')));
        /* 저장 환경이 없는 배포에서는 막지 않는다 — 화면이 통째로 잠기면 손쓸 방법이 없다 */
        setEditable(me?.unavailable
          ? { admin: true, teams: {} }
          : { admin: me?.churchRole === 'admin', teams: (me?.teams ?? {}) as Record<string, string> });
      } catch {
        setMyTeams([]);
        /* 확인이 안 되면 그리기는 한다 — 저장할 때 서버가 다시 본다 */
        setEditable({ admin: true, teams: {} });
      }
    })();
  }, []);

  /** 그 팀 자료를 고칠 수 있는가. 확인 전에는 null */
  const canEditTeam = useCallback(
    (name: string) => (editable ? editable.admin || editable.teams[name] === 'leader' : null),
    [editable],
  );
  const canEdit = canEditTeam(team);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      const draft = raw
        ? JSON.parse(raw) as {
            serviceType?: string; serviceDate?: string; team?: string;
            songs?: Array<Pick<SongRow, 'title' | 'songKey' | 'sungKey' | 'tempoBpm' | 'timeSignature' | 'arrangement' | 'arrangementCustom' | 'sheetPages'>>;
          }
        : null;
      /* 임시저장은 저장 후에도 남는다. 지난 예배 것이면 무시하고 도래하는 예배로 새로 시작한다
         (그러지 않으면 다음 주에 들어와도 지난주 예배가 계속 떠 있다). */
      const isStale = Boolean(draft?.serviceDate && draft.serviceDate < upcoming.serviceDate);
      if (draft && !isStale) {
        setServiceType(draft.serviceType || upcoming.serviceType);
        setServiceDate(draft.serviceDate || upcoming.serviceDate);
        setTeam(draft.team || '주일1부');
        if (draft.songs?.length) {
          setSongs(draft.songs.map((song) => ({
            ...newRow(),
            title: song.title || '',
            songKey: song.songKey || '',
            sungKey: song.sungKey || '',
            tempoBpm: song.tempoBpm || '',
            timeSignature: song.timeSignature || '',
            arrangement: (song.arrangement as Arrangement) || 'full',
            arrangementCustom: song.arrangementCustom || '',
            sheetPages: song.sheetPages ?? [],
          })));
        }
      }
      /* 임시저장이 없거나 지난 것이면 초기값(도래하는 정기예배)을 그대로 둔다. */
    } catch (error) {
      console.warn('[worship-prep] draft load failed', error);
    } finally {
      setDraftReady(true);
    }
    /* 마운트 시 1회만 — upcoming 은 useMemo 로 고정된 값이라 의존성에 넣지 않는다.
       (넣으면 값이 같아도 재실행 판정이 흔들려 임시저장 복원이 다시 돌 수 있다) */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    // 파일은 직렬화 불가 — 텍스트 필드만 초안 저장.
    const draft = {
      serviceType, serviceDate, team,
      songs: songs.map(({ title, songKey, sungKey, tempoBpm, timeSignature, arrangement, arrangementCustom, sheetPages }) => ({ title, songKey, sungKey, tempoBpm, timeSignature, arrangement, arrangementCustom, sheetPages })),
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draftReady, serviceType, serviceDate, team, songs]);

  const loadRecent = useCallback(async (forTeam: string) => {
    try {
      const response = await fetch(`/api/worship-prep?limit=40&team=${encodeURIComponent(forTeam)}`);
      const result = await response.json() as { ok?: boolean; songs?: SavedSong[] };
      if (result.ok && Array.isArray(result.songs)) setRecent(result.songs);
    } catch (error) {
      console.warn('[worship-prep] recent load failed', error);
    }
  }, []);

  /* 제목 검색 — 곡 라이브러리에서 찾는다. 결과를 누르면 곡 행이 채워진다(악보 포함). */
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }
    setSearchStatus('loading');
    const timer = window.setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      try {
        const response = await fetch(`/api/worship-songs?limit=30&search=${encodeURIComponent(term)}`);
        const result = await response.json() as { ok?: boolean; songs?: LibrarySong[] };
        if (seq !== searchSeqRef.current) return;
        setSearchResults(result.ok && Array.isArray(result.songs) ? result.songs : []);
        setSearchStatus('done');
      } catch (error) {
        if (seq !== searchSeqRef.current) return;
        console.warn('[worship-prep] search failed', error);
        setSearchResults([]);
        setSearchStatus('done');
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    void loadRecent(team);
  }, [team, loadRecent]);

  const isValid = useMemo(() => songs.some((song) => song.title.trim()), [songs]);

  /* 조 흐름 — 실제로 부르는 조로 본다. 비어 있으면 악보 조를 쓴다(전조 없이 그대로 치는 경우). */
  const keyFlow = useMemo(
    () => buildKeyFlow(songs.filter((song) => song.title.trim()).map((song) => song.sungKey.trim() || song.songKey.trim())),
    [songs],
  );

  const handleServiceTypeChange = (next: string) => {
    setServiceType(next);
    const auto = nextServiceDate(next);
    if (auto) setServiceDate(auto);
  };

  const updateSong = (key: string, patch: Partial<SongRow>) => {
    setSongs((previous) => previous.map((song) => (song.key === key ? { ...song, ...patch } : song)));
  };

  const handleSheetChange = (key: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    /* 새로 고르면 기존 선택을 대체한다 — 페이지 순서는 고른 순서다 */
    updateSong(key, { sheetFiles: files });
  };

  const isMobile = useIsMobile();
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeSong, setActiveSong] = useState(0);
  const prevLenRef = useRef(songs.length);

  const scrollToSong = useCallback((index: number) => {
    const track = trackRef.current;
    const child = track?.children[index] as HTMLElement | undefined;
    if (track && child) track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    setActiveSong(index);
  }, []);

  const handleTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    let nearest = 0;
    let min = Infinity;
    children.forEach((child, index) => {
      const distance = Math.abs(child.offsetLeft - track.scrollLeft);
      if (distance < min) { min = distance; nearest = index; }
    });
    setActiveSong(nearest);
  };

  const addSong = () => setSongs((previous) => [...previous, newRow()]);
  const removeSong = (key: string) => setSongs((previous) => {
    if (previous.length <= 1) return previous;
    const next = previous.filter((song) => song.key !== key);
    setActiveSong((current) => Math.max(0, Math.min(current, next.length - 1)));
    return next;
  });

  /* 곡 추가 시 새 카드로 부드럽게 슬라이드(오른쪽에서 진입). */
  useEffect(() => {
    if (isMobile && songs.length > prevLenRef.current) {
      requestAnimationFrame(() => scrollToSong(songs.length - 1));
    }
    prevLenRef.current = songs.length;
  }, [songs.length, isMobile, scrollToSong]);

  /* 라이브러리 곡 → 곡 행. 악보는 다시 올리지 않고 경로만 물려받는다. */
  const applyLibrarySong = useCallback((song: LibrarySong) => {
    setSongs((prev) => {
      /* 비어 있는 행이 있으면 거기에 채우고, 없으면 새 행을 붙인다 */
      const emptyIndex = prev.findIndex((row) => !row.title.trim());
      const filled: SongRow = {
        ...newRow(),
        title: song.title,
        songKey: song.song_key || '',
        sungKey: song.sung_key || '',
        tempoBpm: song.tempo_bpm ? String(song.tempo_bpm) : '',
        timeSignature: song.time_signature || '',
        arrangement: (song.arrangement as Arrangement) || 'full',
        arrangementCustom: song.arrangement_custom || '',
        sheetPages: readSheetPages(song),
        sheetFiles: [],
      };
      if (emptyIndex >= 0) {
        const next = [...prev];
        next[emptyIndex] = { ...filled, key: prev[emptyIndex].key };
        return next;
      }
      return [...prev, filled];
    });
    setSearchTerm('');
  }, []);

  const handleDeleteLibrarySong = useCallback(async (song: LibrarySong) => {
    if (!window.confirm(`'${song.title}'을 곡 라이브러리에서 뺍니다. 지난 회차 기록은 그대로 남습니다.`)) return;
    try {
      await fetch(`/api/worship-songs?id=${encodeURIComponent(song.id)}`, { method: 'DELETE' });
      setSearchResults((prev) => prev.filter((item) => item.id !== song.id));
    } catch (error) {
      console.warn('[worship-prep] library delete failed', error);
    }
  }, []);

  const handleSave = async () => {
    if (!isValid || saveStatus === 'saving') return;
    const filled = songs.filter((song) => song.title.trim());

    setSaveStatus('saving');
    setSaveMessage('준비찬양을 저장하고 있습니다...');
    try {
      const formData = new FormData();
      const payloadSongs = await Promise.all(filled.map(async (song, index) => {
        const entry: Record<string, unknown> = {
          title: song.title.trim(),
          songKey: song.songKey.trim(),
          sungKey: song.sungKey.trim(),
          tempoBpm: song.tempoBpm.trim() ? Number(song.tempoBpm.trim()) : null,
          timeSignature: song.timeSignature.trim(),
          arrangement: song.arrangement,
          arrangementCustom: song.arrangementCustom.trim(),
        };
        /* 라이브러리에서 끌어온 페이지는 그대로 두고, 새로 고른 파일만 올린다 */
        entry.sheetPages = song.sheetFiles.length > 0 ? [] : song.sheetPages;
        entry.sheetUploads = await Promise.all(song.sheetFiles.map(async (file, page) => {
          const key = `sheet-${index}-${page}`;
          formData.append(key, file, file.name);
          /* 원본 크기와 흰 여백을 여기서 잰다 — 태블릿 화면의 3~4할을 여백이 먹는다 */
          const measured = await measureSheet(file);
          return { key, w: measured.w, h: measured.h, crop: measured.crop };
        }));
        return entry;
      }));
      formData.append('payload', JSON.stringify({ serviceType, serviceDate, team, songs: payloadSongs }));

      const response = await fetch('/api/worship-prep', { method: 'POST', body: formData });
      const result = await response.json() as { ok?: boolean; message?: string; songCount?: number };
      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setSaveStatus('done');
      setSaveMessage(`저장 완료 · ${team} · ${result.songCount ?? filled.length}곡`);
      void loadRecent(team);
    } catch (error) {
      console.error('[worship-prep] save failed', error);
      setSaveStatus('error');
      setSaveMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  const renderSongList = (items: SavedSong[], emptyText: string) => (
    items.length === 0 ? (
      <div className="empty-state"><div className="empty-icon">♪</div><p>{emptyText}</p></div>
    ) : (
      <div className="search-result-list">
        {items.map((item) => (
          <article className="search-result" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.team} · {item.service_date || '날짜 없음'}
                {item.song_key ? ` · ${item.song_key}` : ''} · {arrangementLabel(item.arrangement, item.arrangement_custom)}
              </span>
            </div>
            {item.sheet_path ? (
              <a className="text-button" href={`/api/worship-sheet?path=${encodeURIComponent(item.sheet_path)}`} target="_blank" rel="noreferrer">악보</a>
            ) : (
              <span className="no-sheet">악보 없음</span>
            )}
          </article>
        ))}
      </div>
    )
  );

  const renderSongCard = (song: SongRow, index: number) => (
    <article className="song-card" key={song.key}>
      <div className="song-row-head">
        <span className="song-row-no">{index + 1}</span>
        {songs.length > 1 && (
          <button className="text-button danger" type="button" onClick={() => removeSong(song.key)}>삭제</button>
        )}
      </div>
      <label>찬양 제목<input value={song.title} onChange={(event) => updateSong(song.key, { title: event.target.value })} placeholder="예: 나의 하나님" /></label>
      <div className="song-inline">
        <label>악보 조<input value={song.songKey} onChange={(event) => updateSong(song.key, { songKey: event.target.value })} placeholder="예: C" /></label>
        <label>부르는 조<input value={song.sungKey} onChange={(event) => updateSong(song.key, { sungKey: event.target.value })} placeholder="예: A" /></label>
      </div>
      <div className="song-inline">
        <label>템포 (BPM)<input value={song.tempoBpm} inputMode="numeric" onChange={(event) => updateSong(song.key, { tempoBpm: event.target.value.replace(/[^0-9]/g, '') })} placeholder="예: 72" /></label>
        <label>박자<input value={song.timeSignature} onChange={(event) => updateSong(song.key, { timeSignature: event.target.value })} placeholder="예: 4/4, 6/8" /></label>
      </div>
      <div className="song-inline">
        <label>찬양 구성<select value={song.arrangement} onChange={(event) => updateSong(song.key, { arrangement: event.target.value as Arrangement })}>{ARRANGEMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      {song.arrangement === 'custom' && (
        <label>구성 직접 기입<input value={song.arrangementCustom} onChange={(event) => updateSong(song.key, { arrangementCustom: event.target.value })} placeholder="예: 1절 → 후렴 → 2절 → 후렴 반복" /></label>
      )}
      <label className="sheet-field">찬양 악보<span className="field-hint">여러 장 선택 가능. 고른 순서가 페이지 순서입니다.</span>
        <input type="file" multiple accept="image/*,application/pdf" onChange={(event) => handleSheetChange(song.key, event)} />
        {song.sheetFiles.length > 0 ? (
          <small className="sheet-name">새 악보 {song.sheetFiles.length}장 — {song.sheetFiles.map((file) => file.name).join(', ')}</small>
        ) : song.sheetPages.length > 0 ? (
          <small className="sheet-name">라이브러리 악보 {song.sheetPages.length}장</small>
        ) : null}
      </label>
    </article>
  );

  return (
    <main className="site-shell">
      <section className="panel search-panel">
        <div className="search-row">
          <label>
            찬양곡 검색
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="제목으로 검색 — 누르면 곡이 채워집니다"
            />
          </label>
        </div>
        {searchTerm.trim() && (
          <div className="search-body">
            {searchResults.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">♪</div>
                <p>{searchStatus === 'loading' ? '검색 중...' : '검색 결과가 없습니다.'}</p></div>
            ) : (
              <div className="search-result-list">
                {searchResults.map((item) => (
                  <article className="search-result" key={item.id}>
                    <button type="button" className="library-pick" onClick={() => applyLibrarySong(item)}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.team}
                        {item.sung_key ? ` · ${item.sung_key}` : item.song_key ? ` · ${item.song_key}` : ''}
                        {item.tempo_bpm ? ` · ${item.tempo_bpm}BPM` : ''}
                        {item.time_signature ? ` · ${item.time_signature}` : ''}
                        {item.sheet_path ? ' · 악보 있음' : ' · 악보 없음'}
                      </span>
                    </button>
                    {/* 악보 썸네일 — 누르면 크게 본다(데스크톱: 저장 곡 자리, 모바일: 전체 화면) */}
                    {sheetSrc(item) && (
                      <button
                        type="button"
                        className="sheet-thumb"
                        onClick={() => setSheetPreview(item)}
                        title={`${item.title} 악보 보기`}
                      >
                        {/* 라이브러리 악보는 크기가 제각각이라 next/image 최적화 대신 원본을 축소해 쓴다 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sheetSrc(item)!} alt={`${item.title} 악보`} loading="lazy" />
                      </button>
                    )}
                    {/* 라이브러리에서 빼는 것은 그 팀 담당자만 — 남의 팀 곡에는 안 보인다 */}
                    {canEditTeam(item.team) && (
                      <button type="button" className="text-button danger"
                        onClick={() => handleDeleteLibrarySong(item)}>빼기</button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>준비찬양</h2></div>
            {canEdit && <span className="required-note">* 곡 1개 이상</span>}
          </div>

          {canEdit && (
            <div className="field-grid service-fields">
              <label>정기예배<select value={serviceType} onChange={(event) => handleServiceTypeChange(event.target.value)}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>일자<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
            </div>
          )}

          {/* 반주자 아이패드에서 이 주소를 북마크해 연주 중에 본다 */}
          <a className="play-link" href={`/worship/play?team=${encodeURIComponent(team)}`} target="_blank" rel="noreferrer">
            🎹 연주용 악보 보기
          </a>

          {canEdit && keyFlow.length > 0 && (
            <div className="key-flow" aria-label="조 흐름">
              {keyFlow.map((step, index) => (
                <span className="key-flow-step" key={`${step.label}-${index}`}>
                  {step.relation && (
                    <span className="key-flow-arrow">
                      →{relationLabel(step.relation) && <em>{relationLabel(step.relation)}</em>}
                    </span>
                  )}
                  <strong>{step.label}</strong>
                </span>
              ))}
            </div>
          )}
          <label>찬양팀<select value={team} onChange={(event) => setTeam(event.target.value)}>{myTeams.map((name) => <option key={name}>{name}</option>)}</select></label>

          {/* 팀원에게는 여기서 화면이 끝난다 — 아래 '저장 곡'에서 악보를 본다 */}
          {canEdit === false && (
            <p className="field-hint">
              곡과 악보는 <b>담당자가 올립니다.</b> 옆(모바일은 아래)의 <b>{team} 저장 곡</b>에서
              악보를 보실 수 있습니다. 연주 중에는 <b>🎹 연주용 악보 보기</b>가 편합니다.
            </p>
          )}

          {canEdit && (isMobile ? (
            <>
              {/* 기본 필드 아래 찬양제목 탭 — 손으로 좌우 드래그·탭 이동 */}
              <div className="song-tabs" role="tablist">
                {songs.map((song, index) => (
                  <button
                    key={song.key}
                    type="button"
                    className={`song-tab ${activeSong === index ? 'active' : ''}`}
                    onClick={() => scrollToSong(index)}
                  >
                    {song.title.trim() || `${index + 1}번 곡`}
                  </button>
                ))}
                <button type="button" className="song-tab add" onClick={addSong}>+ 곡 추가</button>
              </div>
              <div className="song-track" ref={trackRef} onScroll={handleTrackScroll}>
                {songs.map((song, index) => renderSongCard(song, index))}
              </div>
            </>
          ) : (
            <>
              <div className="song-list">
                {songs.map((song, index) => renderSongCard(song, index))}
              </div>
              <button className="secondary-button" type="button" onClick={addSong}>+ 곡 추가</button>
            </>
          ))}

          {canEdit && (
            <button className="primary-button" onClick={() => void handleSave()} disabled={!isValid || saveStatus === 'saving'}>
              {saveStatus === 'saving' ? '저장 중...' : '준비찬양 저장'}
            </button>
          )}
          {saveMessage && <p className={`field-program-message ${saveStatus}`}>{saveMessage}</p>}

          {canEdit && songs.some((song) => song.title.trim()) && (
            <div className="setlist-preview">
              <p className="setlist-preview-label">준비 곡 순서</p>
              <ol>
                {songs.filter((song) => song.title.trim()).map((song, index) => (
                  <li key={song.key} onClick={() => (isMobile ? scrollToSong(songs.indexOf(song)) : undefined)}>
                    <span>{index + 1}</span>
                    <p>
                      {song.title.trim()}
                      {song.songKey.trim() && <em> · {song.songKey.trim()}</em>}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* 데스크톱에서 악보를 보는 동안에는 이 자리를 악보가 차지한다. 모바일은 아래 전체 화면으로 */}
        {sheetPreview && !isMobile ? (
          <section className="panel preview-panel">
            <div className="panel-heading">
              <div><span className="step-number success">02</span><h2>{sheetPreview.title} 악보</h2></div>
              <button type="button" className="text-button" onClick={() => setSheetPreview(null)}>닫기</button>
            </div>
            <div className="sheet-view">
              {Array.from({ length: sheetPageCount(sheetPreview) }, (_, page) => {
                const src = sheetSrc(sheetPreview, page);
                return src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={page} src={src} alt={`${sheetPreview.title} 악보 ${page + 1}장`} />
                ) : null;
              })}
            </div>
          </section>
        ) : (
          <section className="panel preview-panel">
            <div className="panel-heading">
              <div><span className="step-number success">02</span><h2>{team} 저장 곡</h2></div>
              <span className="section-count">{recent.length}곡</span>
            </div>
            {renderSongList(recent, '이 팀에 저장된 곡이 없습니다.')}
          </section>
        )}
      </div>

      {/* 모바일 — 악보는 전체 화면으로. 좁은 화면에서 옆에 끼워 넣으면 음표가 안 보인다 */}
      {sheetPreview && isMobile && (
        <div className="sheet-fullscreen" role="dialog" aria-label={`${sheetPreview.title} 악보`}>
          <div className="sheet-fullscreen-bar">
            {/* 악보를 덮고 있는 동안의 유일한 뒤로가기 — 검색어·결과는 그대로 두므로 목록이 그대로 돌아온다 */}
            <button type="button" className="sheet-back" onClick={() => setSheetPreview(null)}>← 검색으로 돌아가기</button>
            <strong>{sheetPreview.title}</strong>
          </div>
          <div className="sheet-fullscreen-body">
            {Array.from({ length: sheetPageCount(sheetPreview) }, (_, page) => {
              const src = sheetSrc(sheetPreview, page);
              return src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={page} src={src} alt={`${sheetPreview.title} 악보 ${page + 1}장`} />
              ) : null;
            })}
          </div>
        </div>
      )}

      <footer className="page-footer">UnoWorship Pro · 헵시바 선교단</footer>
    </main>
  );
}
