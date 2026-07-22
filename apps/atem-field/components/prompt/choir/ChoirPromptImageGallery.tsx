'use client';

// 찬양대 PMT(무대 sub모니터, 검정 배경+큰 흰 글자) 섹션들을 이미지로 렌더해 보여주고
// 개별 다운로드·전체 저장·공유 링크 복사를 제공하는 공용 컴포넌트.
// 자막 요청 완료 화면과 모바일 공유 페이지에서 함께 쓴다.

import { useState, useEffect } from 'react';
import type { PromptLayoutType } from '@/lib/types';
import {
  renderPromptImages,
  downloadBlob,
  sanitizeFileName,
  type PromptSectionImage,
} from '@/lib/prompt/promptImageExport';

interface SectionInput {
  label?: string;
  text: string;
}

export default function ChoirPromptImageGallery({
  sections,
  promptLayout,
  songTitle,
  shareUrl,
}: {
  sections: SectionInput[];
  promptLayout: PromptLayoutType;
  songTitle: string;
  shareUrl?: string;
}) {
  const [images, setImages] = useState<PromptSectionImage[]>([]);
  const [status, setStatus] = useState<'rendering' | 'done' | 'error'>('rendering');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    // status 초기값이 이미 'rendering' 이라 여기서 다시 세팅하지 않는다.
    renderPromptImages(sections, promptLayout)
      .then((imgs) => {
        if (cancelled) {
          imgs.forEach((im) => URL.revokeObjectURL(im.url));
          return;
        }
        imgs.forEach((im) => created.push(im.url));
        setImages(imgs);
        setStatus('done');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [sections, promptLayout]);

  const handleDownload = (img: PromptSectionImage) => {
    downloadBlob(img.blob, `${sanitizeFileName(songTitle)}_${sanitizeFileName(img.label)}.png`);
  };

  const handleDownloadAll = () => {
    // 브라우저 다중 다운로드 차단 완화를 위해 약간의 간격을 둔다
    images.forEach((img, i) => setTimeout(() => handleDownload(img), i * 300));
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    // http LAN(비보안 컨텍스트)에서는 navigator.clipboard 가 없을 수 있어 감지 후 폴백한다.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error('clipboard unavailable');
    } catch {
      window.prompt('아래 링크를 복사해서 카톡에 붙여넣으세요.', shareUrl);
    }
  };

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
        이미지를 생성하지 못했습니다. 페이지를 새로고침해 주세요.
      </div>
    );
  }

  return (
    <div>
      {/* ── 상단 액션 ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          무대 모니터 이미지
          {status === 'done' && <span className="ml-2 text-violet-600">{images.length}장</span>}
        </h3>
        <div className="flex items-center gap-2">
          {shareUrl && (
            <button
              onClick={handleCopyLink}
              disabled={status !== 'done'}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:border-violet-400 hover:text-violet-700 disabled:opacity-40 transition-colors"
            >
              {copied ? '복사됨 ✓' : '카톡용 링크 복사'}
            </button>
          )}
          <button
            onClick={handleDownloadAll}
            disabled={status !== 'done'}
            className="h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-[11px] font-bold text-white disabled:opacity-40 transition-colors"
          >
            전체 저장
          </button>
        </div>
      </div>

      {/* ── 생성 중 ── */}
      {status === 'rendering' ? (
        <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full mb-2" />
          이미지 생성 중...
        </div>
      ) : (
        /* ── 이미지 그리드 ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {images.map((img) => (
            <div
              key={img.index}
              className="rounded-lg overflow-hidden border border-gray-200 bg-black"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={`${songTitle} ${img.label}`}
                className="w-full block"
                loading="lazy"
              />
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                <span className="text-xs font-semibold text-gray-700">{img.label}</span>
                <button
                  onClick={() => handleDownload(img)}
                  className="h-7 px-3 rounded-md border border-gray-300 bg-white text-[11px] font-semibold text-violet-600 hover:bg-violet-50 hover:border-violet-400 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
