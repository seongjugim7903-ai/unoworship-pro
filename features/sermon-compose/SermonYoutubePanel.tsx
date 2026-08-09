'use client';

// 설교 참고 유튜브 링크 폼 — 링크와 설명을 넣으면 그대로 자기 프로그램이 된다.
// 영상 파일은 받지 않는다(Vercel 4.5MB 요청 상한 + 스토리지 용량). 링크만으로 충분한 이유는
// 현장 UnoLive 가 VideoElement.youtubeId 로 임베드·재생을 이미 지원하기 때문이다.

import { useMemo, useState } from 'react';
import {
  MAX_ITEMS_PER_PROGRAM,
  defaultSubProgramTitle,
} from '../../lib/sermon-compose/subProgram';
import { parseYoutubeLink, youtubeThumbnailUrl } from '../../lib/sermon-compose/youtubeLink';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import ServiceFields, { type ServiceFieldsValue } from './ServiceFields';

interface PickedLink {
  key: string;
  url: string;
  videoId: string;
  caption: string;
}

type Status = 'idle' | 'saving' | 'done' | 'error';

let linkSeq = 0;

export default function SermonYoutubePanel() {
  /* 도래하는 정기예배를 기본값으로 잡는다 — 렌더마다 시각이 흔들리지 않게 한 번만 계산한다. */
  const upcoming = useMemo(() => getUpcomingService(), []);
  const [fields, setFields] = useState<ServiceFieldsValue>({
    serviceType: upcoming.serviceType,
    serviceDate: upcoming.serviceDate,
    title: '',
  });
  const [links, setLinks] = useState<PickedLink[]>([]);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [draftError, setDraftError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const autoTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'youtube');
  const busy = status === 'saving';
  const canSave = links.length > 0 && !busy;

  const addLink = () => {
    if (links.length >= MAX_ITEMS_PER_PROGRAM) {
      setDraftError(`링크는 한 프로그램에 ${MAX_ITEMS_PER_PROGRAM}개까지 넣을 수 있습니다.`);
      return;
    }

    const parsed = parseYoutubeLink(draftUrl);
    if (!parsed.ok) {
      setDraftError(parsed.message);
      return;
    }
    if (links.some((link) => link.videoId === parsed.videoId)) {
      setDraftError('이미 넣은 영상입니다.');
      return;
    }

    linkSeq += 1;
    setLinks((prev) => [
      ...prev,
      { key: `yt-${linkSeq}`, url: draftUrl.trim(), videoId: parsed.videoId, caption: draftCaption.trim() },
    ]);
    setDraftUrl('');
    setDraftCaption('');
    setDraftError('');
  };

  const removeLink = (key: string) => setLinks((prev) => prev.filter((link) => link.key !== key));

  const moveLink = (index: number, delta: number) => {
    setLinks((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setCaption = (key: string, caption: string) => {
    setLinks((prev) => prev.map((link) => (link.key === key ? { ...link, caption } : link)));
  };

  const handleSave = async () => {
    if (!canSave) return;

    setStatus('saving');
    setMessage('유튜브 프로그램을 저장하고 있습니다...');
    try {
      const response = await fetch('/api/sermon-compose/youtube-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: fields.serviceType,
          serviceDate: fields.serviceDate,
          title: fields.title.trim(),
          links: links.map((link) => ({ url: link.url, caption: link.caption })),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean; message?: string; title?: string; itemCount?: number;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setStatus('done');
      setMessage(`유튜브 프로그램 저장 완료 · ${result.title} · ${result.itemCount}개`);
    } catch (error) {
      console.error('[sermon-youtube-program] save failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="site-shell">
      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>설교 참고 영상 (유튜브)</h2></div>
            <span className="required-note">* 링크 1개 이상</span>
          </div>

          <ServiceFields
            value={fields}
            onChange={setFields}
            autoTitle={autoTitle}
            detectedServiceType={upcoming.serviceType}
            disabled={busy}
          />

          <label>
            유튜브 링크
            <span className="field-hint">주소창의 링크를 그대로 붙여넣으세요. 공유 링크(youtu.be)와 쇼츠도 됩니다.</span>
            <input
              value={draftUrl}
              onChange={(event) => { setDraftUrl(event.target.value); setDraftError(''); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLink(); } }}
              placeholder="https://youtu.be/..."
              disabled={busy}
            />
          </label>

          <label>
            설명
            <span className="field-hint">자막 아래 표시할 짧은 설명입니다. 비워도 됩니다.</span>
            <input
              value={draftCaption}
              onChange={(event) => setDraftCaption(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLink(); } }}
              placeholder="예: 도입 예화 영상"
              disabled={busy}
            />
          </label>

          <button className="secondary-button" type="button" onClick={addLink} disabled={busy}>
            + 링크 추가
          </button>
          {draftError && <p className="error-message">{draftError}</p>}

          <button className="primary-button" onClick={() => void handleSave()} disabled={!canSave}>
            {status === 'saving' ? '저장 중...' : `유튜브 프로그램 저장${links.length > 0 ? ` (${links.length}개)` : ''}`}
          </button>
          {message && <p className={`field-program-message ${status}`}>{message}</p>}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>미리보기</h2></div>
            <span className="section-count">{links.length}개</span>
          </div>

          {links.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">영상</div>
              <p>넣은 유튜브 영상이<br />여기에 순서대로 표시됩니다.</p>
            </div>
          ) : (
            <div className="image-grid">
              {/* figure 기본 좌우 여백(40px)이 그리드 칸을 먹어 카드가 쪼그라든다 — style 로 지운다 */}
              {links.map((link, index) => (
                <figure className="image-card" key={link.key} style={{ margin: 0 }}>
                  {/* 유튜브 썸네일은 외부 도메인이라 next/image 를 쓰지 않는다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={youtubeThumbnailUrl(link.videoId)} alt={`참고 영상 ${index + 1}`} />
                  <figcaption className="image-card-footer">
                    {/* 카드가 좁아 영상 ID 가 버튼을 밀어낸다 — 텍스트만 줄이고 버튼은 줄이지 않는다 */}
                    <span
                      title={link.url}
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {index + 1} · {link.videoId}
                    </span>
                    <div style={{ flexShrink: 0 }}>
                      <button className="text-button" type="button" onClick={() => moveLink(index, -1)} disabled={index === 0} aria-label="앞으로 이동">↑</button>
                      <button className="text-button" type="button" onClick={() => moveLink(index, 1)} disabled={index === links.length - 1} aria-label="뒤로 이동">↓</button>
                      <button className="text-button danger" type="button" onClick={() => removeLink(link.key)} aria-label="삭제">삭제</button>
                    </div>
                  </figcaption>
                  <div style={{ padding: '0 10px 10px', background: '#fff' }}>
                    <input
                      value={link.caption}
                      onChange={(event) => setCaption(link.key, event.target.value)}
                      placeholder="설명 (선택)"
                      aria-label={`참고 영상 ${index + 1} 설명`}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="page-footer">UnoWorship Pro · 헵시바 선교단</footer>
    </main>
  );
}
