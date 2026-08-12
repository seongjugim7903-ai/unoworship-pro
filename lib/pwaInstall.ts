'use client';

// 앱 설치 안내 — 어디서 열었는지에 따라 방법이 다르다.
//
// 카톡 안에서 링크를 누르면 카카오 내장 브라우저로 열린다. 거기서는 설치가 안 되므로
// Chrome·Safari 로 옮겨야 한다 — 교회에서 링크를 단톡방으로 돌리므로 이 경우가 가장 흔하다.

export type InstallEnvironment = 'browser' | 'ios' | 'kakao-android' | 'kakao-ios' | 'standalone';

export function detectEnvironment(): InstallEnvironment {
  if (typeof window === 'undefined') return 'standalone';
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (standalone) return 'standalone';

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const inKakao = /KAKAOTALK/i.test(ua);
  if (inKakao) return isIOS ? 'kakao-ios' : 'kakao-android';
  return isIOS ? 'ios' : 'browser';
}

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __uljuInstall?: InstallPromptEvent | null;
  }
}

/**
 * 브라우저가 내준 설치 기회.
 *
 * 이벤트를 잡아 두는 곳은 layout.tsx 의 인라인 스크립트다 — Chrome 이
 * beforeinstallprompt 를 페이지가 뜨자마자 쏘기 때문에 React 가 마운트된 뒤에
 * 리스너를 붙이면 이미 늦다. 여기서는 잡아 둔 것을 꺼내 쓰기만 한다.
 */
export function getInstallPrompt(): InstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.__uljuInstall ?? null;
}

/** 설치 기회가 생기거나 설치가 끝나면 알려 준다. 정리 함수를 돌려준다 */
export function watchInstall(onChange: () => void): () => void {
  window.addEventListener('ulju:installable', onChange);
  window.addEventListener('ulju:installed', onChange);
  return () => {
    window.removeEventListener('ulju:installable', onChange);
    window.removeEventListener('ulju:installed', onChange);
  };
}

/**
 * 이 브라우저에 이미 설치돼 있는가.
 *
 * 이미 설치했으면 Chrome 은 설치 기회를 주지 않는다. 그때 "설치하세요"만 띄우면
 * 할 수 있는 일이 없어 막힌다 — 홈 화면 아이콘으로 열라고 안내해야 한다.
 * Chromium 계열에서만 답이 온다. 그 밖에서는 빈 배열이라 false 다.
 */
export async function isAlreadyInstalled(): Promise<boolean> {
  const query = (navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
  }).getInstalledRelatedApps;
  if (!query) return false;
  try {
    const apps = await query.call(navigator);
    return apps.some((app) => app.platform === 'webapp');
  } catch {
    return false;
  }
}

/**
 * 손에 들고 쓰는 기기인가.
 *
 * 설치를 요구하고 막는 화면은 여기서만 띄운다 — 데스크톱에서 막으면 담당자가 PC로
 * 들어올 길이 없어진다. 설치하는 방법도 모바일과 다르다.
 */
export function isHandheld(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function installSteps(environment: InstallEnvironment, hasPrompt: boolean): string[] {
  switch (environment) {
    case 'kakao-android': return ['Chrome에서 열기', '앱 설치 누르기', '홈 화면에서 실행'];
    case 'kakao-ios': return ['카카오톡 메뉴 열기', 'Safari로 열기', '공유 > 홈 화면에 추가'];
    case 'ios': return ['Safari 공유 버튼', '홈 화면에 추가', '추가 확인'];
    default: return hasPrompt
      ? ['앱 설치 누르기', '설치 확인', '홈 화면에서 실행']
      : ['Chrome 메뉴 열기', '앱 설치 선택', '홈 화면에서 실행'];
  }
}
