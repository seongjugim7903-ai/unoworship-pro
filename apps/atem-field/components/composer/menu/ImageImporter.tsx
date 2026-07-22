'use client';

/**
 * components/composer/menu/ImageImporter.tsx
 * 이미지/PDF 파일 선택 → Base64 로드 → 에디터 캔버스에 ImageElement 삽입
 *
 * 지원 형식: JPG, PNG, GIF, WebP, SVG, PDF (첫 페이지)
 * 원본 이미지 크기를 1920×1080 캔버스 대비 비율로 변환하여
 * 적절한 크기(최대 80%)로 중앙에 배치
 */

import { useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import { ImageElement } from '@/lib/canvasTypes';
import { compressImageDataUrl } from '@/lib/imageProcessing/compressImageDataUrl';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

/** 이미지 원본 크기 → 캔버스 % 좌표 변환 (최대 80% 채우기, 비율 유지) */
function calcImagePlacement(natW: number, natH: number, useFullCanvas = false) {
  if (useFullCanvas) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const ratioW = natW / CANVAS_W;
  const ratioH = natH / CANVAS_H;

  let widthPct: number;
  let heightPct: number;

  if (ratioW <= 0.8 && ratioH <= 0.8) {
    widthPct = (natW / CANVAS_W) * 100;
    heightPct = (natH / CANVAS_H) * 100;
  } else {
    const scale = Math.min(0.8 / ratioW, 0.8 / ratioH);
    widthPct = ratioW * scale * 100;
    heightPct = ratioH * scale * 100;
  }

  const x = (100 - widthPct) / 2;
  const y = (100 - heightPct) / 2;

  return { x, y, width: widthPct, height: heightPct };
}

function isPngFile(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
}

function shouldUseFullCanvasPlacement(natW: number, natH: number): boolean {
  if (!natW || !natH) return false;
  const aspect = natW / natH;
  const canvasAspect = CANVAS_W / CANVAS_H;
  const aspectDelta = Math.abs(aspect - canvasAspect);
  return aspectDelta < 0.02 && natW >= 1280 && natH >= 720;
}

/** PDF 첫 페이지를 캔버스를 통해 PNG data URL 로 변환 */
async function pdfToImage(dataUrl: string): Promise<{ src: string; width: number; height: number }> {
  // pdf.js 동적 로드 (번들 크기 절약)
  const pdfjsLib = await import('pdfjs-dist');
  // worker 비활성화 — 메인 스레드에서 직접 실행 (PDF 1페이지만 처리하므로 충분)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const data = atob(dataUrl.split(',')[1]);
  const uint8 = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) uint8[i] = data.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
  const page = await pdf.getPage(1);

  // 고해상도 렌더 (2x 스케일)
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d')!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvasContext: ctx, viewport } as any).promise;

  return {
    src: canvas.toDataURL('image/png'),
    width: viewport.width / scale,
    height: viewport.height / scale,
  };
}

export function useImageImporter() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    currentSetlistId,
    activeItemId,
    activeSectionId,
    addElement,
    setSelectedElement,
  } = useStore();

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const insertImage = useCallback(
    (
      dataUrl: string,
      natW: number,
      natH: number,
      options?: { sourceName?: string; useFullCanvas?: boolean }
    ) => {
      const placement = calcImagePlacement(natW, natH, options?.useFullCanvas);

      const store = useStore.getState();
      const setlist = store.setlists.find((s) => s.id === currentSetlistId);
      const item = setlist?.items.find((i) => i.id === activeItemId);
      const section = item?.sections.find((s) => s.id === activeSectionId);
      const zIndex = section?.elements?.length ?? 0;

      const newEl: ImageElement = {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'image',
        src: dataUrl,
        objectFit: 'fill',
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotation: 0,
        opacity: 1,
        keyMode: 'none',
        zIndex,
        locked: false,
        visible: true,
        imageMeta: {
          sourceName: options?.sourceName,
          naturalWidthPx: natW,
          naturalHeightPx: natH,
          hasEmbeddedDpi: false,
        },
      };

      addElement(currentSetlistId!, activeItemId!, activeSectionId!, newEl);
      setSelectedElement(newEl.id);
    },
    [currentSetlistId, activeItemId, activeSectionId, addElement, setSelectedElement]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentSetlistId || !activeItemId || !activeSectionId) return;

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/');
      const isPng = isPngFile(file);

      if (!isImage && !isPdf) {
        alert('지원되지 않는 파일 형식입니다.\nJPG, PNG, GIF, WebP, SVG, PDF 파일을 선택해 주세요.');
        e.target.value = '';
        return;
      }

      try {
        // 파일 → data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
          reader.readAsDataURL(file);
        });

        if (isPdf) {
          // PDF → 첫 페이지를 이미지로 변환 (이미 캔버스 렌더링이므로 추가 압축 불필요)
          const { src, width, height } = await pdfToImage(dataUrl);
          insertImage(src, width, height, {
            sourceName: file.name,
            useFullCanvas: shouldUseFullCanvasPlacement(width, height),
          });
        } else if (isPng) {
          // PNG(포토샵/악보): 공유 유틸이 작은 건 무손실 유지, 큰 건 다운스케일 + WebP(투명 보존).
          const compressed = await compressImageDataUrl(dataUrl, { keepAlpha: true });
          if (compressed.warned) {
            alert(
              `이미지 용량이 큽니다 (${compressed.sizeKB}KB).\n` +
              `송출 시 딜레이가 생길 수 있어 해상도를 더 줄이는 것을 권장합니다.`
            );
          }
          insertImage(compressed.dataUrl, compressed.width, compressed.height, {
            sourceName: file.name,
            useFullCanvas: shouldUseFullCanvasPlacement(compressed.width, compressed.height),
          });
        } else {
          // 이미지 → 다운스케일 + WebP 압축 후 삽입
          const compressed = await compressImageDataUrl(dataUrl);

          if (compressed.warned) {
            alert(
              `이미지 용량이 큽니다 (${compressed.sizeKB}KB).\n` +
              `송출 시 딜레이가 발생할 수 있습니다.\n` +
              `더 작은 이미지를 사용하거나 해상도를 줄여 주세요.`
            );
          }

          insertImage(compressed.dataUrl, compressed.width, compressed.height, {
            sourceName: file.name,
          });
        }
      } catch (err) {
        console.error('파일 처리 실패:', err);
        alert(`파일을 처리할 수 없습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      }

      // 같은 파일 재선택 허용
      e.target.value = '';
    },
    [currentSetlistId, activeItemId, activeSectionId, insertImage]
  );

  return { fileInputRef, triggerFilePicker, handleFileChange };
}
