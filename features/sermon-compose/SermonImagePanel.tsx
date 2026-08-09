'use client';

// 설교 참고 사진 업로드 폼 — 올린 이미지 묶음은 설교대지와 별개로 자기 프로그램이 된다.
// 폰 사진 원본은 Vercel 요청 상한(4.5MB)을 넘기 쉬워서 브라우저에서 WebP 로 줄여 보낸다.

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { compressImage } from '../../lib/sermon-compose/compressImage';
import {
  MAX_ITEMS_PER_PROGRAM,
  defaultSubProgramTitle,
} from '../../lib/sermon-compose/subProgram';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import ServiceFields, { type ServiceFieldsValue } from './ServiceFields';

interface PickedImage {
  key: string;
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
  caption: string;
}

type Status = 'idle' | 'reading' | 'saving' | 'done' | 'error';

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export default function SermonImagePanel() {
  /* 도래하는 정기예배를 기본값으로 잡는다 — 렌더마다 시각이 흔들리지 않게 한 번만 계산한다. */
  const upcoming = useMemo(() => getUpcomingService(), []);
  const [fields, setFields] = useState<ServiceFieldsValue>({
    serviceType: upcoming.serviceType,
    serviceDate: upcoming.serviceDate,
    title: '',
  });
  const [images, setImages] = useState<PickedImage[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  /* 미리보기 object URL 은 컴포넌트가 사라질 때 반드시 해제한다. */
  const liveUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = liveUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const autoTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'image');
  const busy = status === 'reading' || status === 'saving';
  const canSave = images.length > 0 && !busy;

  const handlePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    const room = MAX_ITEMS_PER_PROGRAM - images.length;
    if (room <= 0) {
      setStatus('error');
      setMessage(`이미지는 한 프로그램에 ${MAX_ITEMS_PER_PROGRAM}장까지 올릴 수 있습니다.`);
      return;
    }

    setStatus('reading');
    setMessage(`이미지 ${Math.min(files.length, room)}장을 준비하고 있습니다...`);

    const picked: PickedImage[] = [];
    const failed: string[] = [];

    for (const file of files.slice(0, room)) {
      try {
        const compressed = await compressImage(file);
        liveUrls.current.add(compressed.previewUrl);
        picked.push({
          key: `${file.name}-${file.lastModified}-${picked.length}`,
          blob: compressed.blob,
          width: compressed.width,
          height: compressed.height,
          previewUrl: compressed.previewUrl,
          caption: '',
        });
      } catch {
        failed.push(file.name);
      }
    }

    setImages((prev) => [...prev, ...picked]);

    const skipped = files.length - Math.min(files.length, room);
    setStatus(picked.length > 0 ? 'done' : 'error');
    setMessage(
      [
        picked.length > 0 ? `${picked.length}장 준비 완료` : '',
        failed.length > 0 ? `열지 못한 파일: ${failed.join(', ')}` : '',
        skipped > 0 ? `${MAX_ITEMS_PER_PROGRAM}장을 넘어 ${skipped}장은 제외했습니다` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
  };

  const removeImage = (key: string) => {
    setImages((prev) => {
      const target = prev.find((image) => image.key === key);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        liveUrls.current.delete(target.previewUrl);
      }
      return prev.filter((image) => image.key !== key);
    });
  };

  const moveImage = (index: number, delta: number) => {
    setImages((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setCaption = (key: string, caption: string) => {
    setImages((prev) => prev.map((image) => (image.key === key ? { ...image, caption } : image)));
  };

  const handleSave = async () => {
    if (!canSave) return;

    setStatus('saving');
    setMessage('이미지 프로그램을 저장하고 있습니다...');
    try {
      const formData = new FormData();
      formData.append(
        'payload',
        JSON.stringify({
          serviceType: fields.serviceType,
          serviceDate: fields.serviceDate,
          title: fields.title.trim(),
          images: images.map((image) => ({
            width: image.width,
            height: image.height,
            caption: image.caption.trim(),
          })),
        }),
      );
      images.forEach((image, index) => {
        formData.append(`image${index}`, image.blob, `${index + 1}.webp`);
      });

      const response = await fetch('/api/sermon-compose/image-program', {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json()) as {
        ok?: boolean; message?: string; title?: string; itemCount?: number;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setStatus('done');
      setMessage(`이미지 프로그램 저장 완료 · ${result.title} · ${result.itemCount}장`);
    } catch (error) {
      console.error('[sermon-image-program] save failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="site-shell">
      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>설교 참고 사진</h2></div>
            <span className="required-note">* 사진 1장 이상</span>
          </div>

          <ServiceFields
            value={fields}
            onChange={setFields}
            autoTitle={autoTitle}
            detectedServiceType={upcoming.serviceType}
            disabled={busy}
          />

          <label className="sheet-field">
            사진 선택
            <span className="field-hint">
              여러 장을 한 번에 고를 수 있습니다. 올린 순서가 곧 자막 순서입니다.
              긴 변 1920px WebP 로 줄여서 보냅니다.
            </span>
            <input type="file" accept="image/*" multiple onChange={(event) => void handlePick(event)} disabled={busy} />
          </label>

          <button className="primary-button" onClick={() => void handleSave()} disabled={!canSave}>
            {status === 'saving' ? '저장 중...' : `사진 프로그램 저장${images.length > 0 ? ` (${images.length}장)` : ''}`}
          </button>
          {message && (
            <p className={`field-program-message ${status === 'reading' ? 'saving' : status}`}>{message}</p>
          )}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>미리보기</h2></div>
            <span className="section-count">{images.length}장</span>
          </div>

          {images.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">사진</div>
              <p>올린 사진이<br />여기에 순서대로 표시됩니다.</p>
            </div>
          ) : (
            <div className="image-grid">
              {/* figure 기본 좌우 여백(40px)이 그리드 칸을 먹어 카드가 쪼그라든다 — style 로 지운다 */}
              {images.map((image, index) => (
                <figure className="image-card" key={image.key} style={{ margin: 0 }}>
                  {/* 로컬 blob 미리보기라 next/image 최적화 대상이 아니다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.previewUrl} alt={`참고 사진 ${index + 1}`} />
                  <figcaption className="image-card-footer">
                    {/* 카드가 좁아 크기 표기가 버튼을 밀어낸다 — 텍스트만 줄이고 버튼은 줄이지 않는다 */}
                    <span
                      title={`${image.width}×${image.height} · ${formatSize(image.blob.size)}`}
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {index + 1} · {image.width}×{image.height} · {formatSize(image.blob.size)}
                    </span>
                    <div style={{ flexShrink: 0 }}>
                      <button className="text-button" type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="앞으로 이동">↑</button>
                      <button className="text-button" type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} aria-label="뒤로 이동">↓</button>
                      <button className="text-button danger" type="button" onClick={() => removeImage(image.key)} aria-label="삭제">삭제</button>
                    </div>
                  </figcaption>
                  <div style={{ padding: '0 10px 10px', background: '#fff' }}>
                    <input
                      value={image.caption}
                      onChange={(event) => setCaption(image.key, event.target.value)}
                      placeholder="설명 (선택)"
                      aria-label={`참고 사진 ${index + 1} 설명`}
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
