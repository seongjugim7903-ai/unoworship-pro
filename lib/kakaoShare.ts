// 카카오톡 공유 — 공식 JavaScript SDK(sendDefault)로 통상적인 카카오 공유창을 연다.
// 사전 요건: Kakao Developers 앱의 JavaScript 키(NEXT_PUBLIC_KAKAO_JS_KEY) + 사이트 도메인 등록.

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js';
const KAKAO_SDK_INTEGRITY = 'sha384-OL+ylM/iuPLtW5U3XcvLSGhE8JzReKDank5InqlHGWPhb4140/yrBw0bg0y7+C9J';
const KAKAO_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

interface KakaoSdk {
  isInitialized(): boolean;
  init(appKey: string): void;
  Share: {
    sendDefault(settings: Record<string, unknown>): void;
    uploadImage(settings: { file: FileList | File[] }): Promise<{
      infos: { original: { url: string; length: number; content_type: string } };
    }>;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let sdkPromise: Promise<KakaoSdk> | null = null;

export function isKakaoShareConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
}

function loadKakaoSdk(): Promise<KakaoSdk> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoSdk>((resolve, reject) => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!appKey) {
      reject(new Error('NEXT_PUBLIC_KAKAO_JS_KEY가 설정되지 않았습니다.'));
      return;
    }

    const finishInit = () => {
      const kakao = window.Kakao;
      if (!kakao) {
        reject(new Error('카카오 SDK를 불러오지 못했습니다.'));
        return;
      }
      if (!kakao.isInitialized()) kakao.init(appKey);
      resolve(kakao);
    };

    if (window.Kakao) {
      finishInit();
      return;
    }

    const script = document.createElement('script');
    script.src = KAKAO_SDK_URL;
    script.integrity = KAKAO_SDK_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = finishInit;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('카카오 SDK 스크립트 로드에 실패했습니다. 네트워크를 확인해 주세요.'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export interface ChoirKakaoShareInput {
  songTitle: string;
  serviceType: string;
  serviceDate: string;
  imageCount: number;
  /* 카카오 서버 업로드용 대표 이미지 후보 — 5MB 이하 첫 파일을 사용한다. */
  thumbnailCandidates: File[];
  linkUrl: string;
}

export async function shareChoirImagesToKakao(input: ChoirKakaoShareInput) {
  const kakao = await loadKakaoSdk();

  const thumbnail = input.thumbnailCandidates.find((file) => file.size <= KAKAO_UPLOAD_LIMIT_BYTES);
  let imageUrl = '';
  if (thumbnail) {
    try {
      const uploaded = await kakao.Share.uploadImage({ file: [thumbnail] });
      imageUrl = uploaded.infos.original.url;
    } catch (error) {
      console.warn('[kakao-share] thumbnail upload failed — sharing without image', error);
    }
  }

  const link = { mobileWebUrl: input.linkUrl, webUrl: input.linkUrl };
  const description = [
    input.serviceType,
    input.serviceDate || null,
    `자막 이미지 ${input.imageCount}장`,
  ].filter(Boolean).join(' · ');

  if (imageUrl) {
    kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: `${input.songTitle} — 찬양대 자막`,
        description,
        imageUrl,
        imageWidth: 1920,
        imageHeight: 1080,
        link,
      },
      buttons: [{ title: '자막 협조 페이지 열기', link }],
    });
    return;
  }

  kakao.Share.sendDefault({
    objectType: 'text',
    text: `${input.songTitle} — 찬양대 자막\n${description}`,
    link,
    buttons: [{ title: '자막 협조 페이지 열기', link }],
  });
}
