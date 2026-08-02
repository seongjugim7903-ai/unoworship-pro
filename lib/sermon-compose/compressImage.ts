// 설교 참고 사진을 브라우저에서 축소·WebP 변환한다.
// Vercel API 라우트의 요청 본문 상한이 4.5MB 라 폰 사진 원본을 그대로 올릴 수 없다.
// 찬양대 자막이 같은 이유로 WebP 를 쓴다 (202607190002_choir_webp_storage.sql 참조).

/** 긴 변 기준 최대 픽셀 — 1920 이면 송출 해상도에 충분하다 */
const MAX_EDGE = 1920;
const WEBP_QUALITY = 0.9;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  /** 미리보기용 object URL — 다 쓰면 revokeObjectURL 해야 한다 */
  previewUrl: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 열지 못했습니다.'));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다.'))),
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

/** 긴 변이 MAX_EDGE 를 넘으면 비율을 유지한 채 줄인다 */
function fitSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const scale = MAX_EDGE / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const image = await loadImage(file);
  const size = fitSize(image.naturalWidth, image.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('캔버스를 만들지 못했습니다.');
  context.drawImage(image, 0, 0, size.width, size.height);

  const blob = await toBlob(canvas);
  return {
    blob,
    width: size.width,
    height: size.height,
    previewUrl: URL.createObjectURL(blob),
  };
}
