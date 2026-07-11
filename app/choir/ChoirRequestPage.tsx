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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ChoirRequestPage() {
  const [churchName, setChurchName] = useState('');
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

  useEffect(() => {
    setServiceDate(todayISO());
  }, []);

  const sections = useMemo(
    () => lyrics.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean),
    [lyrics],
  );

  const isValid = Boolean(songTitle.trim() && composer.trim() && lyrics.trim());

  useEffect(() => {
    return () => images.forEach((image) => URL.revokeObjectURL(image.url));
  }, [images]);

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

          <div className="field-grid two-columns">
            <label>교회명<input value={churchName} onChange={(event) => setChurchName(event.target.value)} placeholder="예: 울주교회" /></label>
            <label>예배일<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
          </div>
          <div className="field-grid two-columns">
            <label>예배 종류<select value={serviceType} onChange={(event) => setServiceType(event.target.value)}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>곡명 *<input value={songTitle} onChange={(event) => setSongTitle(event.target.value)} placeholder="예: 은혜" /></label>
          </div>
          <div className="field-grid two-columns">
            <label>작곡 *<input value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="예: 손경민" /></label>
            <label>편곡<input value={arranger} onChange={(event) => setArranger(event.target.value)} placeholder="선택 입력" /></label>
          </div>

          <label>가사 *<span className="field-hint">빈 줄로 자막 섹션을 나눕니다.</span>
            <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder={'1절 가사를 입력하세요\n한 섹션 안의 줄바꿈은 그대로 유지됩니다.\n\n후렴 가사를 입력하세요\n빈 줄 다음은 새 이미지가 됩니다.'} rows={12} />
          </label>
          <label>방송실 메모<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="선택 입력" /></label>

          <div className="copyright-note">
            <strong>저작권 자료 확인</strong>
            <p>교회가 보유하거나 사용 허가를 받은 가사만 입력해 주세요. UnoWorship은 입력 자료를 예배 화면용 이미지로 편집하는 도구입니다.</p>
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
            <span>{churchName || '교회명 미입력'}</span><span>{serviceType}</span><span>{serviceDate || '날짜 미입력'}</span>
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
