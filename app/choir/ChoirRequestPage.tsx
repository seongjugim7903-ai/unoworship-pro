'use client';

// 찬양대 자막 요청 — 가사 입력, PNG 생성, 모바일 저장·카카오톡 공유를 한 화면에서 처리한다.

import { useEffect, useMemo, useState } from 'react';
import {
  downloadBlob,
  renderChoirImages,
  sanitizeFileName,
  type ChoirImage,
} from '../../lib/choirImageRenderer';

/* Blob URL 미리보기는 next/image보다 일반 img가 적합하다. */
/* eslint-disable @next/next/no-img-element */

const SERVICE_TYPES = ['주일낮예배', '주일오후예배', '수요예배', '금요기도회', '기타'];
const SAVED_REQUESTS_KEY = 'unoworship-pro:choir-requests';

interface SavedChoirRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  serviceType: string;
  serviceDate: string;
  songTitle: string;
  composer: string;
  arranger: string;
  lyrics: string;
  note: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function createRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `choir-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '저장 시간 없음';
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  const [savedRequests, setSavedRequests] = useState<SavedChoirRequest[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [fieldProgramStatus, setFieldProgramStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [fieldProgramMessage, setFieldProgramMessage] = useState('');
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [cloudSaveMessage, setCloudSaveMessage] = useState('');

  useEffect(() => {
    setServiceDate(todayISO());
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_REQUESTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedChoirRequest[];
      if (Array.isArray(parsed)) setSavedRequests(parsed);
    } catch (error) {
      console.warn('[choir-request] saved requests load failed', error);
    }
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

  const isValid = Boolean(songTitle.trim() && composer.trim() && lyrics.trim());
  const hasSavableContent = Boolean(songTitle.trim() || composer.trim() || arranger.trim() || lyrics.trim() || note.trim());
  const canSaveFieldProgram = Boolean(songTitle.trim() && lyrics.trim());

  useEffect(() => {
    return () => images.forEach((image) => URL.revokeObjectURL(image.url));
  }, [images]);

  const saveCloudRequest = async (imagesToSave: ChoirImage[] = images) => {
    if (!currentRequest.songTitle || !currentRequest.lyrics) {
      setCloudSaveStatus('idle');
      setCloudSaveMessage('곡명과 가사가 있어야 DB에 저장됩니다.');
      return;
    }

    setCloudSaveStatus('saving');
    setCloudSaveMessage(imagesToSave.length > 0 ? '가사와 생성 이미지를 DB에 저장하고 있습니다.' : '가사를 DB에 저장하고 있습니다.');

    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({
        ...currentRequest,
        source: 'unoworship-pro',
      }));
      imagesToSave.forEach((image) => {
        const fileName = `${sanitizeFileName(currentRequest.songTitle)}_${String(image.index).padStart(2, '0')}.png`;
        formData.append(`image-${String(image.index).padStart(3, '0')}`, new File([image.blob], fileName, { type: 'image/png' }));
      });

      const response = await fetch('/api/choir-requests', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json() as {
        ok?: boolean;
        message?: string;
        requestId?: string;
        imageCount?: number;
        sectionCount?: number;
      };

      if (!response.ok || !result.ok) {
        setCloudSaveStatus('error');
        setCloudSaveMessage(result.message ?? 'Supabase DB 저장에 실패했습니다.');
        return;
      }

      setCloudSaveStatus('done');
      setCloudSaveMessage(
        `DB 저장 완료: ${result.sectionCount ?? sections.length}개 섹션 · 이미지 ${result.imageCount ?? imagesToSave.length}장 · 요청 ${result.requestId}`,
      );
    } catch (error) {
      console.error('[choir-request] cloud save failed', error);
      setCloudSaveStatus('error');
      setCloudSaveMessage('DB 저장 중 오류가 발생했습니다.');
    }
  };

  const handleGenerate = async () => {
    if (!isValid || status === 'rendering') return;
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages([]);
    setMessage('');
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
      await saveCloudRequest(generated);
    } catch (error) {
      console.error('[choir-request] image generation failed', error);
      setStatus('error');
      setMessage('이미지를 생성하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.');
    }
  };

  const handleReset = () => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages([]);
    setStatus('idle');
    setMessage('');
  };

  const persistSavedRequests = (nextRequests: SavedChoirRequest[]) => {
    setSavedRequests(nextRequests);
    window.localStorage.setItem(SAVED_REQUESTS_KEY, JSON.stringify(nextRequests));
  };

  const saveFieldProgramFile = async () => {
    if (!canSaveFieldProgram) {
      setFieldProgramStatus('idle');
      setFieldProgramMessage('곡명과 가사가 있어야 현장 워십 프로그램 파일로 저장됩니다.');
      return;
    }

    setFieldProgramStatus('saving');
    setFieldProgramMessage('현장 워십 프로그램 파일을 저장하고 있습니다.');

    try {
      const response = await fetch('/api/field-programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRequest),
      });
      const result = await response.json() as {
        ok?: boolean;
        message?: string;
        fileName?: string;
        sectionCount?: number;
        updatedExisting?: boolean;
      };

      if (!response.ok || !result.ok) {
        setFieldProgramStatus('error');
        setFieldProgramMessage(result.message ?? '현장 워십 프로그램 파일 저장에 실패했습니다.');
        return;
      }

      setFieldProgramStatus('done');
      setFieldProgramMessage(
        `${result.updatedExisting ? '기존 프로그램 업데이트' : '새 프로그램 생성'}: ${result.fileName} · ${result.sectionCount ?? 0}개 섹션`,
      );
    } catch (error) {
      console.error('[choir-request] field program save failed', error);
      setFieldProgramStatus('error');
      setFieldProgramMessage('현장 워십 프로그램 파일 저장 중 오류가 발생했습니다.');
    }
  };

  const createSavedRequest = (notice: string) => {
    const now = new Date().toISOString();
    const nextRequest: SavedChoirRequest = {
      id: createRequestId(),
      createdAt: now,
      updatedAt: now,
      ...currentRequest,
    };
    persistSavedRequests([nextRequest, ...savedRequests]);
    setActiveRequestId(nextRequest.id);
    setSaveMessage(notice);
  };

  const updateSavedRequest = (notice: string) => {
    if (!activeRequestId) {
      createSavedRequest(notice);
      return;
    }

    const now = new Date().toISOString();
    let didUpdate = false;
    const nextRequests = savedRequests.map((request) => {
      if (request.id !== activeRequestId) return request;
      didUpdate = true;
      return {
        ...request,
        ...currentRequest,
        updatedAt: now,
      };
    });

    if (!didUpdate) {
      createSavedRequest(notice);
      return;
    }

    persistSavedRequests(nextRequests);
    setSaveMessage(notice);
  };

  const handleSavePrimary = async () => {
    updateSavedRequest(activeRequestId ? '수정 내용을 저장했습니다.' : '요청을 저장했습니다.');
    await saveFieldProgramFile();
  };

  const handleSaveUpdate = async () => {
    updateSavedRequest('저장된 요청을 업데이트했습니다.');
    await saveFieldProgramFile();
  };

  const handleSaveAsNew = async () => {
    createSavedRequest('새 요청으로 저장했습니다.');
    await saveFieldProgramFile();
  };

  const handleEditSavedRequest = (request: SavedChoirRequest) => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setActiveRequestId(request.id);
    setServiceType(request.serviceType);
    setServiceDate(request.serviceDate || todayISO());
    setSongTitle(request.songTitle);
    setComposer(request.composer);
    setArranger(request.arranger);
    setLyrics(request.lyrics);
    setNote(request.note);
    setImages([]);
    setStatus('idle');
    setMessage('');
    setSaveMessage('저장된 요청을 수정 모드로 불러왔습니다.');
  };

  const handleDownloadAll = () => {
    images.forEach((image, index) => {
      window.setTimeout(() => {
        downloadBlob(image.blob, `${sanitizeFileName(songTitle)}_${String(index + 1).padStart(2, '0')}.png`);
      }, index * 250);
    });
  };

  const handleShare = async (image: ChoirImage) => {
    const file = new File([image.blob], `${sanitizeFileName(songTitle)}_${image.index}.png`, {
      type: 'image/png',
    });

    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({
          files: [file],
          title: `${songTitle} ${image.label}`,
          text: `${songTitle} 찬양대 자막`,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    downloadBlob(image.blob, file.name);
    setMessage('이 기기에서는 파일 공유창을 지원하지 않아 이미지를 저장했습니다. 저장된 이미지를 카카오톡에 첨부해 주세요.');
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">UNOWORSHIP PRO</p>
          <h1>찬양대 자막 요청</h1>
          <p className="header-copy">가사를 입력하면 무대용 자막 이미지를 만들어 바로 공유할 수 있습니다.</p>
        </div>
        <div className="status-pill"><span /> 모바일 공유 준비</div>
      </header>

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
            <label>예배일<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
            <label>예배 종류<select value={serviceType} onChange={(event) => setServiceType(event.target.value)}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          </div>
          <div className="field-grid song-fields">
            <label>곡명 *<input value={songTitle} onChange={(event) => setSongTitle(event.target.value)} placeholder="예: 은혜" /></label>
            <label>작곡 *<input value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="예: 손경민" /></label>
            <label>편곡<input value={arranger} onChange={(event) => setArranger(event.target.value)} placeholder="선택 입력" /></label>
          </div>

          <label>가사 *<span className="field-hint">빈 줄로 자막 섹션을 나눕니다.</span>
            <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder={'1절 가사를 입력하세요\n한 섹션 안의 줄바꿈은 그대로 유지됩니다.\n\n후렴 가사를 입력하세요\n빈 줄 다음은 새 이미지가 됩니다.'} rows={12} />
          </label>
          <label>방송실 메모<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="선택 입력" /></label>

          <div className="save-panel">
            <div className="save-actions">
              <button className="secondary-button" onClick={() => void handleSavePrimary()} disabled={!hasSavableContent}>저장하기</button>
              <button className="secondary-button" onClick={() => void handleSaveUpdate()} disabled={!activeRequestId || !hasSavableContent}>저장</button>
              <button className="secondary-button" onClick={() => void handleSaveAsNew()} disabled={!hasSavableContent}>새로저장</button>
              <button className="secondary-button" onClick={() => void saveFieldProgramFile()} disabled={!canSaveFieldProgram || fieldProgramStatus === 'saving'}>
                {fieldProgramStatus === 'saving' ? '파일 저장 중' : '워십 파일 저장'}
              </button>
              <button className="secondary-button" onClick={() => void saveCloudRequest()} disabled={!canSaveFieldProgram || cloudSaveStatus === 'saving'}>
                {cloudSaveStatus === 'saving' ? 'DB 저장 중' : 'DB 저장'}
              </button>
            </div>
            {saveMessage && <p className="save-message">{saveMessage}</p>}
            {fieldProgramMessage && <p className={`field-program-message ${fieldProgramStatus}`}>{fieldProgramMessage}</p>}
            {cloudSaveMessage && <p className={`field-program-message ${cloudSaveStatus}`}>{cloudSaveMessage}</p>}
            {savedRequests.length > 0 && (
              <div className="saved-request-list">
                {savedRequests.slice(0, 5).map((request) => (
                  <article className={request.id === activeRequestId ? 'saved-request active' : 'saved-request'} key={request.id}>
                    <div>
                      <strong>{request.songTitle || '제목 없는 요청'}</strong>
                      <span>{request.serviceType} · {request.serviceDate || '날짜 없음'} · {formatSavedAt(request.updatedAt)}</span>
                    </div>
                    <button className="text-button" onClick={() => handleEditSavedRequest(request)}>수정</button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <button className="primary-button" onClick={handleGenerate} disabled={!isValid || status === 'rendering'}>
            {status === 'rendering' ? '이미지 생성 중...' : '자막 이미지 생성'}
          </button>
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
          <div className="result-heading"><div><span className="step-number success">03</span><h2>생성된 자막 이미지</h2><p>{images.length}장의 PNG 파일이 준비되었습니다.</p></div><div className="result-actions"><button className="secondary-button" onClick={handleReset}>새 요청</button><button className="primary-button compact" onClick={handleDownloadAll}>전체 저장</button></div></div>
          {message && <p className="info-message">{message}</p>}
          <div className="image-grid">{images.map((image) => <article className="image-card" key={image.index}><img src={image.url} alt={`${songTitle} ${image.label}`} /><div className="image-card-footer"><span>{image.label}</span><div><button className="text-button" onClick={() => downloadBlob(image.blob, `${sanitizeFileName(songTitle)}_${image.index}.png`)}>저장</button><button className="share-button" onClick={() => void handleShare(image)}>카카오톡</button></div></div></article>)}</div>
        </section>
      )}

      <footer className="page-footer">UnoWorship Pro · 찬양대 콘텐츠 협조 공간</footer>
    </main>
  );
}
