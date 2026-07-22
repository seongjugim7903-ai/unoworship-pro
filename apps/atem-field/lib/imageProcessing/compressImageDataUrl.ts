// 이미지 data URL 을 다운스케일 + 압축(WebP 우선·알파 보존)하는 브라우저 전용 공용 유틸.
// 수동 업로드(ImageImporter)와 자동 PPT 악보 가져오기(PptSlideImporter) 양쪽에서 재사용한다.

/** 최대 저장 해상도 — 1920×1080 캔버스 이상은 불필요 */
const MAX_STORE_W = 1920;
const MAX_STORE_H = 1080;
/** 일반 사진용 압축 품질 단계(높은→낮은) */
const QUALITY_STEPS = [0.75, 0.65, 0.55];
/** 알파(PNG·악보 선화) 보존 경로용 고품질 단계 — 선/글자 뭉개짐 방지 */
const QUALITY_STEPS_ALPHA = [0.92, 0.85, 0.78];
/** 목표 최대 용량 (Base64 기준 약 200KB) */
const TARGET_MAX_BYTES = 200 * 1024;
/** 경고 임계값 */
const WARN_BYTES = 500 * 1024;

export interface CompressResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeKB: number;
  warned: boolean;
  /** 압축이 실제로 적용됐는지(원본 유지면 false) */
  changed: boolean;
}

/** Base64 data URL 의 실제 바이트 크기 추정 */
export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.round(base64.length * 0.75);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}

function keep(dataUrl: string, w: number, h: number, bytes: number): CompressResult {
  return {
    dataUrl,
    width: w,
    height: h,
    sizeKB: Math.round(bytes / 1024),
    warned: bytes > WARN_BYTES,
    changed: false,
  };
}

/**
 * data URL 이미지를 다운스케일 + 압축한다.
 * - 이미 작고(≤200KB) 해상도도 적정이면 원본 유지(changed=false).
 * - keepAlpha: WebP(알파 지원)로 압축해 투명도 보존, WebP 미지원 시 PNG 무손실 다운스케일.
 * - SVG(벡터)·비이미지는 손대지 않는다.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  opts?: { keepAlpha?: boolean },
): Promise<CompressResult> {
  const keepAlpha = opts?.keepAlpha ?? false;
  const originalBytes = estimateDataUrlBytes(dataUrl);

  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image')) {
    return keep(dataUrl, 0, 0, originalBytes);
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return keep(dataUrl, 0, 0, originalBytes);
  }

  const natW = img.naturalWidth;
  const natH = img.naturalHeight;

  // SVG(벡터)는 래스터 압축하지 않는다.
  if (dataUrl.startsWith('data:image/svg')) {
    return keep(dataUrl, natW, natH, originalBytes);
  }

  const withinRes = natW <= MAX_STORE_W && natH <= MAX_STORE_H;
  // 이미 작고 해상도도 적정 → 원본 유지(로고·아이콘 선명도 보존, 재인코딩 안 함).
  if (originalBytes <= TARGET_MAX_BYTES && withinRes) {
    return keep(dataUrl, natW, natH, originalBytes);
  }

  let targetW = natW;
  let targetH = natH;
  if (natW > MAX_STORE_W || natH > MAX_STORE_H) {
    const scale = Math.min(MAX_STORE_W / natW, MAX_STORE_H / natH);
    targetW = Math.max(1, Math.round(natW * scale));
    targetH = Math.max(1, Math.round(natH * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return keep(dataUrl, natW, natH, originalBytes);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const isWebPSupported = canvas.toDataURL('image/webp', 0.5).startsWith('data:image/webp');
  // WebP 는 알파를 지원하므로 keepAlpha 여도 WebP 로 압축(투명 보존). WebP 미지원 시에만 PNG(무손실).
  const format = isWebPSupported ? 'image/webp' : keepAlpha ? 'image/png' : 'image/jpeg';
  const steps = keepAlpha ? QUALITY_STEPS_ALPHA : QUALITY_STEPS;

  let out = '';
  let bytes = 0;
  if (format === 'image/png') {
    out = canvas.toDataURL('image/png');
    bytes = estimateDataUrlBytes(out);
  } else {
    for (const quality of steps) {
      out = canvas.toDataURL(format, quality);
      bytes = estimateDataUrlBytes(out);
      if (bytes <= TARGET_MAX_BYTES) break;
    }
  }

  // 압축본이 원본보다 크면(이미 최적화된 작은 이미지) 원본 유지.
  if (!out || bytes >= originalBytes) {
    return keep(dataUrl, natW, natH, originalBytes);
  }

  return {
    dataUrl: out,
    width: targetW,
    height: targetH,
    sizeKB: Math.round(bytes / 1024),
    warned: bytes > WARN_BYTES,
    changed: true,
  };
}
