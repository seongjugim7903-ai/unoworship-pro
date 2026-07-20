'use client';

// 준비찬양 — 정기예배·일자·찬양팀별로 준비 곡(제목·악보·조·구성)을 저장한다.

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { nextServiceDate } from '../../lib/nextServiceDate';

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
const TEAMS = ['주일1부', '주일2부', '수요예배', '금요기도회'];
const DRAFT_KEY = 'unoworship-pro:worship-prep-draft:v1';

type Arrangement = 'chorus_only' | 'chorus_first' | 'custom';
const ARRANGEMENTS: Array<{ value: Arrangement; label: string }> = [
  { value: 'chorus_first', label: '후렴 먼저' },
  { value: 'chorus_only', label: '후렴만' },
  { value: 'custom', label: '직접 기입' },
];

interface SongRow {
  key: string;
  title: string;
  songKey: string;
  arrangement: Arrangement;
  arrangementCustom: string;
  sheet: File | null;
  sheetName: string;
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
}

let rowSeq = 0;
function newRow(): SongRow {
  rowSeq += 1;
  return { key: `song-${rowSeq}`, title: '', songKey: '', arrangement: 'chorus_first', arrangementCustom: '', sheet: null, sheetName: '' };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function arrangementLabel(value: string, custom: string) {
  if (value === 'custom') return custom || '직접 기입';
  return ARRANGEMENTS.find((item) => item.value === value)?.label ?? value;
}

export default function WorshipPrepPage() {
  const [serviceType, setServiceType] = useState('주일낮예배');
  const [serviceDate, setServiceDate] = useState('');
  const [team, setTeam] = useState('주일1부');
  const [songs, setSongs] = useState<SongRow[]>([newRow()]);
  const [draftReady, setDraftReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [recent, setRecent] = useState<SavedSong[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as {
          serviceType?: string; serviceDate?: string; team?: string;
          songs?: Array<Pick<SongRow, 'title' | 'songKey' | 'arrangement' | 'arrangementCustom'>>;
        };
        setServiceType(draft.serviceType || '주일낮예배');
        setServiceDate(draft.serviceDate || todayISO());
        setTeam(draft.team || '주일1부');
        if (draft.songs?.length) {
          setSongs(draft.songs.map((song) => ({
            ...newRow(),
            title: song.title || '',
            songKey: song.songKey || '',
            arrangement: (song.arrangement as Arrangement) || 'chorus_first',
            arrangementCustom: song.arrangementCustom || '',
          })));
        }
      } else {
        setServiceDate(todayISO());
      }
    } catch (error) {
      console.warn('[worship-prep] draft load failed', error);
      setServiceDate(todayISO());
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    // 파일은 직렬화 불가 — 텍스트 필드만 초안 저장.
    const draft = {
      serviceType, serviceDate, team,
      songs: songs.map(({ title, songKey, arrangement, arrangementCustom }) => ({ title, songKey, arrangement, arrangementCustom })),
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

  useEffect(() => {
    void loadRecent(team);
  }, [team, loadRecent]);

  const isValid = useMemo(() => songs.some((song) => song.title.trim()), [songs]);

  const handleServiceTypeChange = (next: string) => {
    setServiceType(next);
    const auto = nextServiceDate(next);
    if (auto) setServiceDate(auto);
  };

  const updateSong = (key: string, patch: Partial<SongRow>) => {
    setSongs((previous) => previous.map((song) => (song.key === key ? { ...song, ...patch } : song)));
  };

  const handleSheetChange = (key: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    updateSong(key, { sheet: file, sheetName: file?.name ?? '' });
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

  const handleSave = async () => {
    if (!isValid || saveStatus === 'saving') return;
    const filled = songs.filter((song) => song.title.trim());

    setSaveStatus('saving');
    setSaveMessage('준비찬양을 저장하고 있습니다...');
    try {
      const formData = new FormData();
      const payloadSongs = filled.map((song, index) => {
        const entry: Record<string, unknown> = {
          title: song.title.trim(),
          songKey: song.songKey.trim(),
          arrangement: song.arrangement,
          arrangementCustom: song.arrangementCustom.trim(),
        };
        if (song.sheet) {
          const sheetKey = `sheet-${index}`;
          entry.sheetKey = sheetKey;
          formData.append(sheetKey, song.sheet, song.sheet.name);
        }
        return entry;
      });
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
        <label>조 (Key)<input value={song.songKey} onChange={(event) => updateSong(song.key, { songKey: event.target.value })} placeholder="예: G, Am" /></label>
        <label>찬양 구성<select value={song.arrangement} onChange={(event) => updateSong(song.key, { arrangement: event.target.value as Arrangement })}>{ARRANGEMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      {song.arrangement === 'custom' && (
        <label>구성 직접 기입<input value={song.arrangementCustom} onChange={(event) => updateSong(song.key, { arrangementCustom: event.target.value })} placeholder="예: 1절 → 후렴 → 2절 → 후렴 반복" /></label>
      )}
      <label className="sheet-field">찬양 악보<span className="field-hint">이미지 또는 PDF. 팀별로 저장됩니다.</span>
        <input type="file" accept="image/*,application/pdf" onChange={(event) => handleSheetChange(song.key, event)} />
        {song.sheetName && <small className="sheet-name">{song.sheetName}</small>}
      </label>
    </article>
  );

  return (
    <main className="site-shell">
      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>준비찬양</h2></div>
            <span className="required-note">* 곡 1개 이상</span>
          </div>

          <div className="field-grid service-fields">
            <label>정기예배<select value={serviceType} onChange={(event) => handleServiceTypeChange(event.target.value)}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>일자<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
          </div>
          <label>찬양팀<select value={team} onChange={(event) => setTeam(event.target.value)}>{TEAMS.map((name) => <option key={name}>{name}</option>)}</select></label>

          {isMobile ? (
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
          )}

          <button className="primary-button" onClick={() => void handleSave()} disabled={!isValid || saveStatus === 'saving'}>
            {saveStatus === 'saving' ? '저장 중...' : '준비찬양 저장'}
          </button>
          {saveMessage && <p className={`field-program-message ${saveStatus}`}>{saveMessage}</p>}

          {songs.some((song) => song.title.trim()) && (
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

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>{team} 저장 곡</h2></div>
            <span className="section-count">{recent.length}곡</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">♪</div><p>이 팀에 저장된 곡이<br />여기에 표시됩니다.</p></div>
          ) : (
            <div className="search-result-list">
              {recent.map((item) => (
                <article className="search-result" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.service_date || '날짜 없음'} · {item.service_type}
                      {item.song_key ? ` · ${item.song_key}` : ''} · {arrangementLabel(item.arrangement, item.arrangement_custom)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="page-footer">UnoWorship Pro · 헵시바 선교단</footer>
    </main>
  );
}
