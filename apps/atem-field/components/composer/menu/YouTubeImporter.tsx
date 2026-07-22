'use client';

/**
 * components/composer/menu/YouTubeImporter.tsx
 * 유튜브 링크 입력 모달 → VideoElement 생성
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { VideoElement } from '@/lib/canvasTypes';
import { extractYouTubeId, getEmbedUrl, getThumbnailUrl } from '@/lib/youtube';

export function useYouTubeImporter() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, open, close };
}

interface YouTubeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function YouTubeModal({ isOpen, onClose }: YouTubeModalProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; thumb: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  const {
    currentSetlistId,
    activeItemId,
    activeSectionId,
    addElement,
    setSelectedElement,
  } = useStore();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setError('');
      setFileError('');
      setVideoFile(null);
      setIsUploading(false);
      setPreview(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // URL 변경 시 미리보기 갱신
  useEffect(() => {
    if (!url.trim()) {
      setPreview(null);
      setError('');
      return;
    }
    const id = extractYouTubeId(url.trim());
    if (id) {
      setPreview({ id, thumb: getThumbnailUrl(id, 'hq') });
      setError('');
    } else {
      setPreview(null);
      if (url.length > 10) setError('유효한 유튜브 링크가 아닙니다');
    }
  }, [url]);

  const handleInsert = useCallback(() => {
    if (!preview || !currentSetlistId || !activeItemId || !activeSectionId) return;

    const store = useStore.getState();
    const setlist = store.setlists.find((s) => s.id === currentSetlistId);
    const item = setlist?.items.find((i) => i.id === activeItemId);
    const section = item?.sections.find((s) => s.id === activeSectionId);
    const zIndex = section?.elements?.length ?? 0;

    const embedUrl = getEmbedUrl(preview.id, { autoplay: false, muted: true });

    const newEl: VideoElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'video',
      src: embedUrl,
      youtubeId: preview.id,
      thumbnailUrl: getThumbnailUrl(preview.id, 'hq'),
      loop: false,
      muted: true,
      autoplay: false,
      // 16:9 전체 채움
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex,
      locked: false,
      visible: true,
    };

    addElement(currentSetlistId, activeItemId, activeSectionId, newEl);
    setSelectedElement(newEl.id);
    onClose();
  }, [preview, currentSetlistId, activeItemId, activeSectionId, addElement, setSelectedElement, onClose]);

  const handleLocalVideoInsert = useCallback(async () => {
    if (!videoFile || !currentSetlistId || !activeItemId || !activeSectionId || isUploading) return;

    setFileError('');
    setIsUploading(true);

    try {
      // [FIX] FormData(multipart) 파서가 Next16 + 커스텀서버에서 실패하므로 raw 바이너리로 전송한다.
      //   파일 Blob 을 그대로 body 로 보내면 브라우저가 Content-Type/Content-Length 를 자동 설정,
      //   파일명만 x-filename 헤더로 전달한다.
      const res = await fetch('/api/media/videos/upload', {
        method: 'POST',
        body: videoFile,
        headers: { 'x-filename': encodeURIComponent(videoFile.name) },
        credentials: 'include',
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.video?.url) {
        // 실제 원인(detail)까지 노출해 진단 가능하게 한다.
        throw new Error(
          [payload?.error, payload?.detail].filter(Boolean).join(' — ') ||
            '영상 파일 업로드에 실패했습니다',
        );
      }

      const store = useStore.getState();
      const setlist = store.setlists.find((s) => s.id === currentSetlistId);
      const item = setlist?.items.find((i) => i.id === activeItemId);
      const section = item?.sections.find((s) => s.id === activeSectionId);
      const zIndex = section?.elements?.length ?? 0;

      const newEl: VideoElement = {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'video',
        src: payload.video.url,
        loop: true,   // 배경 영상은 끊기면 안 되므로 반복 재생(절대 멈추지 않게)
        muted: true,  // 출력 창은 사용자 제스처가 없어 muted 여야 자동재생이 브라우저에 허용됨
        autoplay: true, // 출력(송출)에서 자동 재생. 에디터는 VideoElementView 에서 별도로 정지 유지.
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex,
        locked: false,
        visible: true,
      };

      addElement(currentSetlistId, activeItemId, activeSectionId, newEl);
      setSelectedElement(newEl.id);
      onClose();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '영상 파일 업로드에 실패했습니다');
    } finally {
      setIsUploading(false);
    }
  }, [
    videoFile,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    isUploading,
    addElement,
    setSelectedElement,
    onClose,
  ]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="max-h-[86vh] w-[460px] overflow-y-auto rounded-xl border border-[#333] bg-[#1a1a1a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-gray-200 mb-1 font-medium">영상 삽입</p>
        <p className="text-[10px] text-gray-500 mb-3">유튜브 링크 또는 로컬 영상 파일을 추가합니다</p>

        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && preview) handleInsert();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full bg-[#0a0a0a] border border-[#444] rounded px-3 py-2 text-sm text-white
                     outline-none focus:border-blue-500 mb-3 placeholder-gray-600"
        />

        {error && (
          <p className="text-[11px] text-red-400 mb-3">{error}</p>
        )}

        {/* 썸네일 미리보기 */}
        {preview && (
          <div className="mb-4 rounded-lg overflow-hidden border border-[#333]">
            <img
              src={preview.thumb}
              alt="YouTube thumbnail"
              className="w-full aspect-video object-cover"
            />
            <div className="px-3 py-2 bg-[#111]">
              <p className="text-[10px] text-gray-400 font-mono">{preview.id}</p>
            </div>
          </div>
        )}

        <div className="my-4 h-px bg-[#333]" />

        <div className="mb-4">
          <p className="text-[11px] text-gray-300 mb-1 font-medium">영상파일 업로드</p>
          <p className="text-[10px] text-gray-500 mb-2">
            MP4, MOV, M4V, WEBM 파일을 서버에 저장한 뒤 모든 송출 창에서 같은 영상으로 재생합니다.
          </p>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
            onChange={(e) => {
              setFileError('');
              setVideoFile(e.target.files?.[0] ?? null);
            }}
            className="block w-full text-[11px] text-gray-300
                       file:mr-3 file:h-8 file:rounded file:border-0 file:bg-[#2a2a2a]
                       file:px-3 file:text-[11px] file:font-medium file:text-gray-200
                       hover:file:bg-[#333]"
          />
          {videoFile && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded border border-[#333] bg-[#101010] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] text-gray-200">{videoFile.name}</p>
                <p className="text-[10px] text-gray-500">{formatFileSize(videoFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={handleLocalVideoInsert}
                disabled={isUploading}
                className={`h-8 shrink-0 rounded px-3 text-[11px] font-medium transition-colors ${
                  isUploading
                    ? 'bg-[#2a2a2a] text-gray-600 cursor-wait'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                {isUploading ? '업로드 중...' : '영상 삽입'}
              </button>
            </div>
          )}
          {fileError && (
            <p className="mt-2 text-[11px] text-red-400">{fileError}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-8 rounded bg-[#2a2a2a] hover:bg-[#333] text-xs text-gray-400 transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!preview}
            className={`flex-1 h-8 rounded text-xs font-medium transition-colors cursor-pointer ${
              preview
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-[#2a2a2a] text-gray-600 cursor-not-allowed'
            }`}
          >
            유튜브 삽입
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MB`;
  return `${(mib / 1024).toFixed(2)} GB`;
}
