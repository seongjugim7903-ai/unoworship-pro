'use client';

/**
 * useCanvasImageImporter.ts
 * 캔버스 에디터 전용 이미지 임포터 훅
 *
 * UnoLive의 useImageImporter를 canvasStore 기반으로 포팅:
 * - 로컬 파일 선택 → Base64 로드 → ImageElement 생성
 * - 화면용은 px 기준, 인쇄용은 300dpi 출력 픽셀판 기준으로 배치
 * - 원본 픽셀 정보를 저장해 인쇄 체크 패널에서 실효 DPI를 계산한다
 */

import { useCallback, useRef } from 'react';
import { getCanvasPurpose, type CanvasPurpose } from './canvasPurpose';
import { useCanvasStore, type CanvasPage } from './canvasStore';
import type { ImageElement } from '@/lib/canvasTypes';

const MAX_SCREEN_INITIAL_IMAGE_RATIO = 0.8;
const MAX_PRINT_INITIAL_IMAGE_RATIO = 0.8;
const DEFAULT_PRINT_IMAGE_DPI = 300;
const MM_PER_INCH = 25.4;

type ImagePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 이미지 원본 크기 → 현재 캔버스 % 좌표 변환.
 *
 * - 화면용(px) 캔버스: 이미지 픽셀을 출력 픽셀 기준으로 1:1 배치한다.
 * - 인쇄용(mm) 캔버스: 300dpi 출력 목표 픽셀판을 기준으로
 *   원본 픽셀 크기가 차지하는 비율을 계산한다.
 * - 저해상도 이미지는 자동 확대하지 않고, 부족 여부는 PRINT CHECK에서 알려준다.
 */
function calcImagePlacement(
  natW: number,
  natH: number,
  page: CanvasPage,
  purpose: CanvasPurpose | null,
): ImagePlacement {
  if (!Number.isFinite(natW) || !Number.isFinite(natH) || natW <= 0 || natH <= 0) {
    return { x: 10, y: 10, width: 40, height: 40 };
  }

  const isPrintCanvas = purpose?.unit === 'mm';
  if (isPrintCanvas) {
    const outputWidthPx = mmToPx(page.width, DEFAULT_PRINT_IMAGE_DPI);
    const outputHeightPx = mmToPx(page.height, DEFAULT_PRINT_IMAGE_DPI);
    const widthPct = (natW / outputWidthPx) * 100;
    const heightPct = (natH / outputHeightPx) * 100;
    const fitScale = Math.min(
      1,
      (MAX_PRINT_INITIAL_IMAGE_RATIO * 100) / widthPct,
      (MAX_PRINT_INITIAL_IMAGE_RATIO * 100) / heightPct,
    );
    const placedWidthPct = widthPct * fitScale;
    const placedHeightPct = heightPct * fitScale;
    return {
      x: (100 - placedWidthPct) / 2,
      y: (100 - placedHeightPct) / 2,
      width: placedWidthPct,
      height: placedHeightPct,
    };
  }

  const naturalWidthInCanvasUnit = natW;
  const naturalHeightInCanvasUnit = natH;
  const maxWidth = page.width * MAX_SCREEN_INITIAL_IMAGE_RATIO;
  const maxHeight = page.height * MAX_SCREEN_INITIAL_IMAGE_RATIO;
  const fitScale = Math.min(
    1,
    maxWidth / naturalWidthInCanvasUnit,
    maxHeight / naturalHeightInCanvasUnit,
  );

  const placedWidth = naturalWidthInCanvasUnit * fitScale;
  const placedHeight = naturalHeightInCanvasUnit * fitScale;
  const widthPct = (placedWidth / page.width) * 100;
  const heightPct = (placedHeight / page.height) * 100;
  const x = (100 - widthPct) / 2;
  const y = (100 - heightPct) / 2;

  return { x, y, width: widthPct, height: heightPct };
}

function mmToPx(mm: number, dpi: number) {
  return (mm / MM_PER_INCH) * dpi;
}

/** Base64 data URL을 받아 ImageElement를 생성하여 캔버스에 추가 */
function addImageFromDataUrl(dataUrl: string, sourceName?: string) {
  const img = new Image();
  img.onload = () => {
    const state = useCanvasStore.getState();
    const page = state.getActivePage();
    if (!page) return;

    const purpose = getCanvasPurpose(state.project.purposeId);
    const placement = calcImagePlacement(img.naturalWidth, img.naturalHeight, page, purpose);
    const elements = state.getElements();

    const newEl: ImageElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'image',
      src: dataUrl,
      objectFit: 'fill',
      imageMeta: {
        sourceName,
        naturalWidthPx: img.naturalWidth,
        naturalHeightPx: img.naturalHeight,
        assumedDpi: purpose?.unit === 'mm' ? DEFAULT_PRINT_IMAGE_DPI : undefined,
        hasEmbeddedDpi: false,
      },
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: 0,
      opacity: 1,
      zIndex: elements.length,
      locked: false,
      visible: true,
    };

    state.addElement(newEl);
  };
  img.src = dataUrl;
}

export function useCanvasImageImporter() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** 단일 또는 복수 파일 처리 */
  const handleFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = (files as FileList)[i] ?? (files as File[])[i];
      if (!file) continue;
      if (!file.type.startsWith('image/')) {
        console.warn('이미지 파일만 업로드 가능합니다:', file.name);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (typeof dataUrl === 'string') {
          addImageFromDataUrl(dataUrl, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // 같은 파일 재선택 허용
      e.target.value = '';
    },
    [handleFiles]
  );

  return {
    fileInputRef,
    triggerFilePicker,
    handleFileChange,
    handleFiles,
  };
}
