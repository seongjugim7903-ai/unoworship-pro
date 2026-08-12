'use client';

// 앱 설치 안내 — 어디서 열었는지에 따라 방법이 다르다.
//
// 카톡 안에서 링크를 누르면 카카오 내장 브라우저로 열린다. 거기서는 설치가 안 되므로
// Chrome·Safari 로 옮겨야 한다 — 교회에서 링크를 단톡방으로 돌리므로 이 경우가 가장 흔하다.

import { useCallback, useEffect, useState } from 'react';

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

/**
 * 카카오 내장 브라우저에서 바깥 브라우저로 옮긴다.
 *
 * 크롬을 못 박지 않는다 — 갤럭시는 삼성인터넷이 기본인 경우가 많고, 그때
 * package=com.android.chrome 을 넣으면 그냥 아무 일도 일어나지 않는다. 실제로 그랬다.
 * 기본 브라우저가 열리게 두고, 그마저 막히면 원래 주소로 떨어진다.
 */
export function openInOutsideBrowser(): void {
  const target = new URL(window.location.href);
  const fallback = encodeURIComponent(target.toString());
  window.location.href = `intent://${target.host}${target.pathname}${target.search}`
    + `#Intent;scheme=https;action=android.intent.action.VIEW;`
    + `S.browser_fallback_url=${fallback};end`;
}

export function installSteps(environment: InstallEnvironment, hasPrompt: boolean): string[] {
  switch (environment) {
    case 'kakao-android': return ['브라우저로 열기', '앱 설치 누르기', '홈 화면에서 실행'];
    case 'kakao-ios': return ['카카오톡 메뉴 열기', 'Safari로 열기', '공유 > 홈 화면에 추가'];
    case 'ios': return ['Safari 공유 버튼', '홈 화면에 추가', '추가 확인'];
    default: return hasPrompt
      ? ['앱 설치 누르기', '설치 확인', '홈 화면에서 실행']
      : ['Chrome 메뉴 열기', '앱 설치 선택', '홈 화면에서 실행'];
  }
}

/**
 * 설치 상태와 설치 동작 — 배너(`app/pwa/PwaInstallPrompt.tsx`)와 초대 첫 화면
 * (`features/membership/InstallGate.tsx`)이 **똑같은 경로**를 쓰게 하려고 여기 모았다.
 *
 * 두 곳이 각자 구현하고 있었더니 담당자 화면의 배너에서는 설치가 되는데 초대 화면에서는
 * 안 되는 상태가 생겼다. 원인을 찾는 데도 오래 걸렸다 — 갈라져 있으면 또 갈라진다.
 *
 * 기억할 것 두 가지.
 *   설치 기회는 브라우저가 준다. 크롬은 사용자가 그 사이트를 좀 만져 본 뒤에야 준다 —
 *   링크로 막 들어온 첫 화면에서는 잠깐 없을 수 있고, 오면 여기서 알아서 켜진다.
 *   기회는 한 번 쓰면 사라진다. 그래서 자동으로 쓰지 않고 사용자가 누를 때만 쓴다.
 */
export function useInstall() {
  const [environment, setEnvironment] = useState<InstallEnvironment>('standalone');
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnvironment(detectEnvironment());
    const sync = () => {
      setCanInstall(Boolean(getInstallPrompt()));
      setEnvironment(detectEnvironment());
    };
    sync();
    void isAlreadyInstalled().then(setInstalled);
    return watchInstall(sync);
  }, []);

  const install = useCallback(async () => {
    const prompt = getInstallPrompt();
    if (!prompt) {
      /* 아직 기회가 없다. 새로고침하면 브라우저가 다시 판단한다 */
      window.location.reload();
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      /* 같은 이벤트로 두 번 열 수 없다 */
      window.__uljuInstall = null;
      setCanInstall(false);
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setMessage('설치했습니다. 홈 화면의 ULJU 아이콘으로 열어 주세요.');
      } else {
        setCancelled(true);
        setMessage('설치를 취소하셨습니다. 설치해야 다음으로 넘어갑니다.');
      }
    } catch {
      setMessage('설치창을 열지 못했습니다. 브라우저 메뉴(⋮)에서 앱 설치를 눌러 주세요.');
    }
  }, []);

  return { environment, canInstall, installed, cancelled, message, setMessage, install };
}
