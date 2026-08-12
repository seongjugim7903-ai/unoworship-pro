'use client';

// 방송실 — 한 예배의 모든 팀 자료를 한자리에서 살피는 읽기 전용 운영 화면.
//   예배(예배종류+일자)를 고르면 설교대지·주보·준비찬양·찬양대 자막을 모아 보여준다.

import { useCallback, useEffect, useState } from 'react';
import { nextServiceDate } from '../../lib/nextServiceDate';

const SERVICE_TYPES = ['주일낮예배', '주일오후예배', '수요예배', '금요기도회', '월삭감사예배'];
const ARRANGEMENT: Record<string, string> = { full: '전체', chorus_only: '후렴만', chorus_first: '후렴 먼저', custom: '직접' };

interface Sermon {
  content: string;
  hymn: string;
  metadata?: { sermonTitle?: string; scriptureRef?: string; preacher?: string } | null;
}
interface Song {
  id: string; team: string; title: string;
  song_key: string; sung_key: string;
  arrangement: string; arrangement_custom: string;
  sheet_path: string | null; sheet_pages?: Array<{ path?: string }> | null;
}
interface Choir { id: string; song_title: string; composer: string; arranger: string; section_count: number }
interface Data {
  sermon: Sermon | null;
  bulletin: { content: string } | null;
  worshipSongs: Song[];
  choirRequests: Choir[];
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function arrLabel(a: string, custom: string) { return a === 'custom' ? (custom || '직접') : (ARRANGEMENT[a] ?? a); }
function firstSheet(song: Song) { return song.sheet_path || song.sheet_pages?.find((p) => p.path)?.path || null; }

export default function BroadcastPanel() {
  const [serviceType, setServiceType] = useState('주일낮예배');
  const [date, setDate] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => { setDate(nextServiceDate('주일낮예배') ?? todayISO()); }, []);

  const load = useCallback(async (st: string, d: string) => {
    if (!d) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch(`/api/broadcast?serviceType=${encodeURIComponent(st)}&date=${d}`);
      const json = await res.json() as Data & { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message ?? '자료를 불러오지 못했습니다.');
      setData(json);
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '자료를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { if (date) void load(serviceType, date); }, [serviceType, date, load]);

  const onServiceType = (value: string) => {
    setServiceType(value);
    const auto = nextServiceDate(value);
    if (auto) setDate(auto);
  };

  const sermon = data?.sermon;
  const meta = sermon?.metadata ?? undefined;
  const songsByTeam = (data?.worshipSongs ?? []).reduce<Record<string, Song[]>>((acc, song) => {
    (acc[song.team] ||= []).push(song);
    return acc;
  }, {});

  return (
    <main className="site-shell">
      <section className="panel search-panel">
        <div className="search-row">
          <label>예배 종류
            <select value={serviceType} onChange={(event) => onServiceType(event.target.value)}>
              {SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>일자
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>
        <p className="search-message">
          {status === 'loading' ? '불러오는 중...' : status === 'error' ? message : `${date || '날짜'} · ${serviceType} 자료입니다.`}
        </p>
      </section>

      {/* 설교 */}
      <section className="panel bc-section">
        <div className="panel-heading"><div><span className="step-number">설교</span><h2>설교대지 · 주보</h2></div></div>
        {sermon ? (
          <div className="bc-body">
            {meta?.sermonTitle && <p className="bc-title">{meta.sermonTitle}</p>}
            <div className="bc-meta">
              {meta?.scriptureRef && <span>본문 {meta.scriptureRef}</span>}
              {meta?.preacher && <span>설교 {meta.preacher}</span>}
              {sermon.hymn && <span>찬송/찬양 {sermon.hymn.split('\n').filter(Boolean).join(', ')}</span>}
            </div>
            {sermon.content && <pre className="bc-pre">{sermon.content}</pre>}
          </div>
        ) : (
          <p className="field-hint">이 예배의 설교대지가 아직 없습니다.</p>
        )}
        {data?.bulletin?.content ? (
          <div className="bc-body">
            <p className="bc-subtitle">주보 · 교회소식</p>
            <pre className="bc-pre">{data.bulletin.content}</pre>
          </div>
        ) : (
          <p className="field-hint">이번 주 주보가 아직 없습니다.</p>
        )}
      </section>

      {/* 준비찬양 */}
      <section className="panel bc-section">
        <div className="panel-heading"><div><span className="step-number">찬양</span><h2>준비찬양 (전 팀)</h2></div><span className="section-count">{data?.worshipSongs.length ?? 0}곡</span></div>
        {(data?.worshipSongs.length ?? 0) === 0 ? (
          <p className="field-hint">이 예배에 준비된 찬양이 없습니다.</p>
        ) : (
          Object.entries(songsByTeam).map(([team, songs]) => (
            <div key={team} className="bc-team">
              <p className="bc-subtitle">{team}</p>
              <div className="search-result-list">
                {songs.map((song) => (
                  <article className="search-result" key={song.id}>
                    <div>
                      <strong>{song.title}</strong>
                      <span>
                        {(song.sung_key || song.song_key) ? `${song.sung_key || song.song_key} · ` : ''}
                        {arrLabel(song.arrangement, song.arrangement_custom)}
                      </span>
                    </div>
                    {firstSheet(song)
                      ? <a className="text-button" href={`/api/worship-sheet?path=${encodeURIComponent(firstSheet(song)!)}`} target="_blank" rel="noreferrer">악보</a>
                      : <span className="no-sheet">악보 없음</span>}
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* 찬양대 자막 */}
      <section className="panel bc-section">
        <div className="panel-heading"><div><span className="step-number">자막</span><h2>찬양대 자막</h2></div><span className="section-count">{data?.choirRequests.length ?? 0}곡</span></div>
        {(data?.choirRequests.length ?? 0) === 0 ? (
          <p className="field-hint">이 예배의 찬양대 자막이 없습니다.</p>
        ) : (
          <div className="search-result-list">
            {data!.choirRequests.map((item) => (
              <article className="search-result" key={item.id}>
                <div>
                  <strong>{item.song_title}</strong>
                  <span>
                    {item.section_count}개 섹션
                    {item.composer ? ` · ${item.composer}` : ''}
                    {item.arranger ? ` · 편곡 ${item.arranger}` : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
