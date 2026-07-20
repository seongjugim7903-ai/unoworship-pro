'use client';

// 찬양대 자막 요청 — 가사 입력, PNG 생성, 모바일 저장·카카오톡 공유를 한 화면에서 처리한다.

import { useEffect, useMemo, useState } from 'react';
import {
  downloadBlob,
  renderChoirImages,
  sanitizeFileName,
  type ChoirImage,
} from '../../lib/choirImageRenderer';
import {
  clearChoirImageCache,
  loadChoirImageCache,
  saveChoirImageCache,
} from '../../lib/choirImageCache';
import { nextServiceDate } from '../../lib/nextServiceDate';

/* Blob URL 미리보기는 next/image보다 일반 img가 적합하다. */
/* eslint-disable @next/next/no-img-element */

const SERVICE_TYPES = ['주일낮예배', '주일오후예배', '수요예배', '금요기도회', '기타'];
const DRAFT_KEY = 'unoworship-pro:choir-request-draft:v1';

interface ChoirRequestDraft {
  serviceType: string;
  serviceDate: string;
  songTitle: string;
  composer: string;
  arranger: string;
  lyrics: string;
  note: string;
  /* 저장된 요청을 이어서 수정 중일 때 대상 id — 재생성이 중복 행을 만들지 않게 한다. */
  editingRequestId?: string | null;
}

interface SearchChoirRequest {
  id: string;
  created_at: string;
  updated_at: string;
  service_date: string | null;
  service_type: string;
  song_title: string;
  composer: string;
  arranger: string;
  lyrics: string;
  note: string;
  section_count: number;
  status: string;
}

interface ApiResult {
  ok?: boolean;
  message?: string;
  requestId?: string;
  programId?: string;
  imageCount?: number;
  sectionCount?: number;
  storagePath?: string;
  updatedExisting?: boolean;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function readApiResult(response: Response): Promise<ApiResult> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResult;
  } catch {
    return {
      message: response.status === 413
        ? '생성 이미지 용량이 서버 요청 한도를 초과했습니다.'
        : `서버 응답을 읽지 못했습니다. (HTTP ${response.status})`,
    };
  }
}

export default function ChoirRequestPage() {
  const churchName = '';
  const [serviceType, setServiceType] = useState('주일낮예배');
  const [serviceDate, setServiceDate] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [arranger, setArranger] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<ChoirImage[]>([]);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [fieldProgramMessage, setFieldProgramMessage] = useState('');
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [cloudSaveMessage, setCloudSaveMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [searchMessage, setSearchMessage] = useState('');
  const [searchResults, setSearchResults] = useState<SearchChoirRequest[]>([]);
  const [kakaoShareBusy, setKakaoShareBusy] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<ChoirRequestDraft>;
        setServiceType(draft.serviceType || '주일낮예배');
        setServiceDate(draft.serviceDate || todayISO());
        setSongTitle(draft.songTitle || '');
        setComposer(draft.composer || '');
        setArranger(draft.arranger || '');
        setLyrics(draft.lyrics || '');
        setNote(draft.note || '');
        setEditingRequestId(draft.editingRequestId || null);
      } else {
        setServiceDate(todayISO());
      }
    } catch (error) {
      console.warn('[choir-request] draft load failed', error);
      setServiceDate(todayISO());
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;

    const draft: ChoirRequestDraft = {
      serviceType,
      serviceDate,
      songTitle,
      composer,
      arranger,
      lyrics,
      note,
      editingRequestId,
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [arranger, composer, draftReady, editingRequestId, lyrics, note, serviceDate, serviceType, songTitle]);

  useEffect(() => {
    let cancelled = false;

    void loadChoirImageCache()
      .then((cachedImages) => {
        if (cancelled || cachedImages.length === 0) return;
        setImages(cachedImages);
        setStatus('done');
        setMessage('새로고침 전에 생성한 자막 이미지를 복원했습니다.');
      })
      .catch((error) => {
        console.warn('[choir-request] image cache load failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(
    () => lyrics.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean),
    [lyrics],
  );

  const currentRequest = useMemo(() => ({
    serviceType,
    serviceDate,
    songTitle: songTitle.trim(),
    composer: composer.trim(),
    arranger: arranger.trim(),
    lyrics: lyrics.trim(),
    note: note.trim(),
  }), [arranger, composer, lyrics, note, serviceDate, serviceType, songTitle]);

  const isValid = Boolean(songTitle.trim() && lyrics.trim());

  useEffect(() => {
    return () => images.forEach((image) => URL.revokeObjectURL(image.url));
  }, [images]);

  const saveCloudRequest = async (imagesToSave: ChoirImage[] = images) => {
    if (!currentRequest.songTitle || !currentRequest.lyrics) {
      setCloudSaveStatus('idle');
      setCloudSaveMessage('곡명과 가사가 있어야 저장됩니다.');
      return;
    }

    setCloudSaveStatus('saving');
    const originalBytes = imagesToSave.reduce((sum, image) => sum + image.blob.size, 0);
    const uploadBytes = imagesToSave.reduce((sum, image) => sum + image.uploadBlob.size, 0);
    const savedPercent = originalBytes > 0 ? Math.max(0, Math.round((1 - uploadBytes / originalBytes) * 100)) : 0;
    setCloudSaveMessage(imagesToSave.length > 0
      ? `고품질 압축 이미지 ${imagesToSave.length}장을 저장하고 있습니다. (용량 ${savedPercent}% 절감)`
      : '가사를 저장하고 있습니다.');

    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({
        ...currentRequest,
        source: 'unoworship-pro',
        requestId: editingRequestId ?? undefined,
      }));
      imagesToSave.forEach((image) => {
        const isWebp = image.uploadBlob.type === 'image/webp';
        const extension = isWebp ? 'webp' : 'png';
        const fileName = `${sanitizeFileName(currentRequest.songTitle)}_${String(image.index).padStart(2, '0')}.${extension}`;
        formData.append(
          `image-${String(image.index).padStart(3, '0')}`,
          new File([image.uploadBlob], fileName, { type: image.uploadBlob.type || 'image/png' }),
        );
      });

      const response = await fetch('/api/choir-requests', {
        method: 'POST',
        body: formData,
      });
      const result = await readApiResult(response);

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      /* 이후 재생성은 방금 저장한 행을 업데이트하게 만든다 — 중복 행 방지 */
      if (result.requestId) setEditingRequestId(result.requestId);
      setCloudSaveStatus('done');
      setCloudSaveMessage(
        `${result.updatedExisting ? '기존 요청 업데이트' : '저장'} 완료: ${result.sectionCount ?? sections.length}개 섹션 · 이미지 ${result.imageCount ?? imagesToSave.length}장 · 요청 ${result.requestId}`,
      );
    } catch (error) {
      console.error('[choir-request] cloud save failed', error);
      setCloudSaveStatus('error');
      setCloudSaveMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  const saveFieldProgramFile = async () => {
    if (!currentRequest.songTitle || !currentRequest.lyrics) return;

    try {
      const response = await fetch('/api/field-programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRequest),
      });

      if (response.status === 409) {
        return;
      }

      const result = await response.json() as {
        ok?: boolean;
        fileName?: string;
        sectionCount?: number;
        message?: string;
      };

      if (response.ok && result.ok) {
        setFieldProgramMessage(`현장 프로그램 파일 자동 저장 완료: ${result.fileName} · ${result.sectionCount ?? 0}개 섹션`);
      } else if (result.message) {
        setFieldProgramMessage(result.message);
      }
    } catch (error) {
      console.warn('[choir-request] field program auto save skipped', error);
    }
  };

  const handleServiceTypeChange = (next: string) => {
    setServiceType(next);
    const auto = nextServiceDate(next);
    if (auto) setServiceDate(auto);
  };

  const handleGenerate = async () => {
    if (!isValid || status === 'rendering') return;
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages([]);
    setMessage('');
    setFieldProgramMessage('');
    setStatus('rendering');

    try {
      const generated = await renderChoirImages({
        churchName: churchName.trim(),
        serviceType,
        serviceDate,
        songTitle: songTitle.trim(),
        composer: composer.trim(),
        arranger: arranger.trim(),
        sections,
      });
      setImages(generated);
      setStatus('done');
      try {
        await saveChoirImageCache(generated);
      } catch (error) {
        console.warn('[choir-request] image cache save failed', error);
      }
      await saveCloudRequest(generated);
      await saveFieldProgramFile();
    } catch (error) {
      console.error('[choir-request] image generation failed', error);
      setStatus('error');
      setMessage('이미지를 생성하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.');
    }
  };

  /* 새 요청 — 생성 이미지와 폼 입력을 전부 비운다 (드래프트도 빈 값으로 덮여 새로고침 후에도 깨끗). */
  const handleReset = () => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages([]);
    setStatus('idle');
    setMessage('');
    setEditingRequestId(null);
    setCloudSaveStatus('idle');
    setCloudSaveMessage('');
    setFieldProgramMessage('');
    setServiceType('주일낮예배');
    setServiceDate(todayISO());
    setSongTitle('');
    setComposer('');
    setArranger('');
    setLyrics('');
    setNote('');
    void clearChoirImageCache().catch((error) => {
      console.warn('[choir-request] image cache clear failed', error);
    });
  };

  const handleSearch = async () => {
    setSearchStatus('loading');
    setSearchMessage('');

    try {
      const params = new URLSearchParams({
        limit: '20',
      });
      const query = searchTerm.trim();
      if (query) params.set('search', query);

      const response = await fetch(`/api/choir-requests?${params.toString()}`);
      const result = await response.json() as {
        ok?: boolean;
        message?: string;
        requests?: SearchChoirRequest[];
      };

      if (!response.ok || !result.ok) {
        setSearchStatus('error');
        setSearchMessage(result.message ?? '지난 곡을 불러오지 못했습니다.');
        setSearchResults([]);
        return;
      }

      const requests = Array.isArray(result.requests) ? result.requests : [];
      setSearchResults(requests);
      setSearchStatus('done');
      setSearchMessage(requests.length > 0 ? `${requests.length}곡을 찾았습니다.` : '검색 결과가 없습니다.');
    } catch (error) {
      console.error('[choir-request] search failed', error);
      setSearchStatus('error');
      setSearchMessage('지난 곡 검색 중 오류가 발생했습니다.');
      setSearchResults([]);
    }
  };

  const handleEditSearchResult = (request: SearchChoirRequest) => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setEditingRequestId(request.id);
    setCloudSaveStatus('idle');
    setCloudSaveMessage('');
    setFieldProgramMessage('');
    setServiceType(request.service_type || '주일낮예배');
    setServiceDate(request.service_date || todayISO());
    setSongTitle(request.song_title || '');
    setComposer(request.composer || '');
    setArranger(request.arranger || '');
    setLyrics(request.lyrics || '');
    setNote(request.note || '');
    setImages([]);
    setStatus('idle');
    setMessage('');
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchMessage('');
    setMessage('지난 곡을 수정 모드로 불러왔습니다. 편집 후 자막 이미지를 다시 생성해 주세요.');
    void clearChoirImageCache().catch((error) => {
      console.warn('[choir-request] image cache clear failed', error);
    });
  };

  const handleDeleteSearchResult = async (request: SearchChoirRequest) => {
    if (deletingRequestId) return;

    const label = request.song_title || '제목 없는 곡';
    if (!window.confirm(`《${label}》 요청과 저장된 이미지가 모두 삭제됩니다. 삭제할까요?`)) return;

    setDeletingRequestId(request.id);
    try {
      const response = await fetch(`/api/choir-requests?id=${encodeURIComponent(request.id)}`, {
        method: 'DELETE',
      });
      const result = await readApiResult(response);

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `삭제에 실패했습니다. (HTTP ${response.status})`);
      }

      setSearchResults((previous) => previous.filter((row) => row.id !== request.id));
      setSearchStatus('done');
      setSearchMessage(`《${label}》 요청을 삭제했습니다.`);
      /* 방금 지운 요청을 수정 중이었다면 연결을 끊어 재생성이 새 요청으로 저장되게 한다. */
      if (editingRequestId === request.id) setEditingRequestId(null);
    } catch (error) {
      console.error('[choir-request] delete failed', error);
      setSearchStatus('error');
      setSearchMessage(error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingRequestId(null);
    }
  };

  /* 생성 이미지를 파일 그대로 공유창에 싣는다 — 다운로드 없이 카카오톡 대화방에 바로 첨부된다. */
  const handleKakaoShare = async () => {
    if (images.length === 0 || kakaoShareBusy) return;

    const files = images.map((image, index) => new File(
      [image.blob],
      `${sanitizeFileName(songTitle)}_${String(index + 1).padStart(2, '0')}.png`,
      { type: 'image/png' },
    ));
    const totalMegabytes = files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024);
    const canShareFiles = typeof navigator.share === 'function'
      && (!navigator.canShare || navigator.canShare({ files }));

    if (!canShareFiles) {
      setMessage('이 브라우저는 파일 공유를 지원하지 않습니다. 각 이미지의 저장 버튼으로 내려받아 카카오톡에 첨부해 주세요.');
      return;
    }

    setKakaoShareBusy(true);
    setMessage(`자막 이미지 ${files.length}장이 담겼습니다. 카카오톡 대화방을 골라 보내기만 누르시면 끝!`);
    try {
      await navigator.share({
        files,
        text: `《${songTitle}》\n이미지 ${files.length}장이 복사되었습니다.`,
      });
      setMessage(`${songTitle} 자막 ${files.length}장 전달 완료 — 오늘도 수고하셨습니다. 🎵`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessage('보내기를 취소했습니다. 준비되면 다시 눌러 주세요.');
      } else {
        const errorName = error instanceof DOMException ? error.name : 'UnknownError';
        setMessage(
          `공유창을 열지 못했습니다. ${files.length}장 · ${totalMegabytes.toFixed(1)}MB · 오류 ${errorName}. 모바일 Chrome 또는 Safari에서 다시 시도해 주세요.`,
        );
      }
    } finally {
      setKakaoShareBusy(false);
    }
  };

  return (
    <main className="site-shell">
      <section className="panel search-panel">
        <div className="search-row">
          <label>
            지난 곡 검색
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSearch();
              }}
              placeholder="곡명, 작곡, 편곡으로 검색"
            />
          </label>
          <button
            className="secondary-button search-button"
            onClick={() => void handleSearch()}
            disabled={searchStatus === 'loading'}
          >
            {searchStatus === 'loading' ? '검색 중' : '검색'}
          </button>
        </div>
        {searchMessage && <p className={`search-message ${searchStatus}`}>{searchMessage}</p>}
        {searchResults.length > 0 && (
          <div className="search-result-list">
            {searchResults.map((request) => (
              <article className="search-result" key={request.id}>
                <div>
                  <strong>{request.song_title || '제목 없는 곡'}</strong>
                  <span>
                    최근 연주 {request.service_date || '날짜 없음'} · {request.section_count ?? 0}개 섹션
                    {request.composer ? ` · ${request.composer}` : ''}
                  </span>
                </div>
                <div className="search-result-actions">
                  <button className="text-button" onClick={() => handleEditSearchResult(request)}>수정</button>
                  <button
                    className="text-button danger"
                    onClick={() => void handleDeleteSearchResult(request)}
                    disabled={deletingRequestId === request.id}
                  >
                    {deletingRequestId === request.id ? '삭제 중' : '삭제'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>요청 정보</h2></div>
            <span className="required-note">* 필수 입력</span>
          </div>

          {/* 교회명 필드는 워크스페이스 정보 연동 전까지 화면에서 숨긴다.
          <div className="field-grid two-columns">
            <label>교회명<input value={churchName} onChange={(event) => setChurchName(event.target.value)} placeholder="예: 울주교회" /></label>
          </div>
          */}
          <div className="field-grid service-fields">
            <label>예배 종류<select value={serviceType} onChange={(event) => handleServiceTypeChange(event.target.value)}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>예배일<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
          </div>
          <div className="field-grid song-fields">
            <label>곡명 *<input value={songTitle} onChange={(event) => setSongTitle(event.target.value)} placeholder="예: 은혜" /></label>
            <label>작곡<input value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="선택 입력" /></label>
            <label>편곡<input value={arranger} onChange={(event) => setArranger(event.target.value)} placeholder="선택 입력" /></label>
          </div>

          <label>가사 *<span className="field-hint">빈 줄로 자막 섹션을 나눕니다.</span>
            <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder={'1절 가사를 입력하세요\n한 섹션 안의 줄바꿈은 그대로 유지됩니다.\n\n후렴 가사를 입력하세요\n빈 줄 다음은 새 이미지가 됩니다.'} rows={12} />
          </label>
          <label>방송실 메모<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="선택 입력" /></label>

          {editingRequestId && (
            <p className="editing-badge">
              저장된 요청을 수정 중입니다 — 재생성하면 기존 요청이 업데이트됩니다.
            </p>
          )}
          <button className="primary-button" onClick={handleGenerate} disabled={!isValid || status === 'rendering'}>
            {status === 'rendering' ? '이미지 생성 중...' : '자막 이미지 생성'}
          </button>
          {status === 'rendering' && <p className="generation-status rendering">이미지 생성 중 ...</p>}
          {status === 'done' && <p className="generation-status done">이미지 생성 완료!</p>}
          {cloudSaveMessage && <p className={`field-program-message ${cloudSaveStatus}`}>{cloudSaveMessage}</p>}
          {fieldProgramMessage && <p className="field-program-message">{fieldProgramMessage}</p>}
          {status === 'error' && <p className="error-message">{message}</p>}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number">02</span><h2>요청 미리보기</h2></div>
            <span className="section-count">{sections.length}개 섹션</span>
          </div>
          <div className="preview-meta">
            <span>{serviceType}</span><span>{serviceDate || '날짜 미입력'}</span>
          </div>
          {sections.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">Aa</div><p>가사를 입력하면<br />섹션 미리보기가 나타납니다.</p></div>
          ) : (
            <div className="text-preview-list">{sections.map((section, index) => <div className="text-preview" key={`${index}-${section.slice(0, 12)}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{section}</p></div>)}</div>
          )}
        </section>
      </div>

      {status === 'done' && (
        <section className="panel result-panel">
          <div className="result-heading">
            <div><span className="step-number success">03</span><h2>생성된 자막 이미지</h2><p>{images.length}장의 PNG 파일이 준비되었습니다.</p></div>
            <div className="result-actions">
              <button className="secondary-button reset-button" onClick={handleReset}>새 요청</button>
              <button
                className="kakao-button"
                onClick={() => void handleKakaoShare()}
                disabled={kakaoShareBusy}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3C6.92 3 2.8 6.24 2.8 10.23c0 2.57 1.71 4.83 4.29 6.11l-.87 3.25c-.08.29.25.52.5.35l3.87-2.58c.46.05.93.08 1.41.08 5.08 0 9.2-3.23 9.2-7.21C21.2 6.24 17.08 3 12 3Z" /></svg>
                {kakaoShareBusy ? '보내는 중...' : '카카오톡으로 보내기'}
              </button>
            </div>
          </div>
          {message && <p className="info-message">{message}</p>}
          <div className="image-grid">{images.map((image) => <article className="image-card" key={image.index}><img src={image.url} alt={`${songTitle} ${image.label}`} /><div className="image-card-footer"><span>{image.label}</span><button className="text-button" onClick={() => downloadBlob(image.blob, `${sanitizeFileName(songTitle)}_${image.index}.png`)}>저장</button></div></article>)}</div>
        </section>
      )}

      <footer className="page-footer">UnoWorship Pro · 찬양대 콘텐츠 협조 공간</footer>
    </main>
  );
}
