/**
 * lib/imageProcessing/removeBackground.ts
 * 이미지 배경 제거 — @imgly/background-removal (브라우저 ML 모델)
 *
 * - 서버 API 없이 100% 클라이언트 사이드 실행
 * - ONNX 모델(~40MB)은 최초 실행 시 다운로드 후 브라우저 캐시에 저장
 * - 결과: 배경이 투명(alpha=0)인 PNG data URL 반환
 */

export interface RemoveBgProgress {
  /** 현재 단계 키 (예: 'downloading:0', 'computing:inference') */
  key: string;
  /** 진행률 0–1 */
  progress: number;
}

/**
 * 이미지 배경을 제거하고 투명 배경 PNG data URL 을 반환합니다.
 *
 * @param imageSrc - 원본 이미지 data URL 또는 URL
 * @param onProgress - 진행 상황 콜백 (모델 다운로드 + 추론)
 * @returns 배경이 제거된 PNG data URL
 */
export async function removeBackground(
  imageSrc: string,
  onProgress?: (p: RemoveBgProgress) => void,
): Promise<string> {
  // 동적 import — 번들 크기 최적화 (라이브러리 ~40MB 모델 포함)
  const { removeBackground: imglyRemoveBackground } = await import('@imgly/background-removal');

  const blob = await imglyRemoveBackground(imageSrc, {
    model: 'isnet_fp16',
    output: {
      format: 'image/png',
      quality: 1,
    },
    progress: (key: string, current: number, total: number) => {
      onProgress?.({ key, progress: total > 0 ? current / total : 0 });
    },
  });

  // Blob → data URL
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('배경 제거 결과를 읽을 수 없습니다.'));
    reader.readAsDataURL(blob);
  });
}
