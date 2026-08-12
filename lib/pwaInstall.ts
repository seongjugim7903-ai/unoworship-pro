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
