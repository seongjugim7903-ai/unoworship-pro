import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ULJU',
    short_name: 'ULJU',
    description: '설교대지 · 준비찬양 · 찬양대 자막을 예배용 프로그램으로 준비합니다.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    /* 연주용 악보 보기는 아이패드를 가로로 눕혀 쓴다 — 세로 고정하면 그 화면이 막힌다 */
    orientation: 'any',
    background_color: '#f5f7fb',
    theme_color: '#6754d9',
    lang: 'ko-KR',
    categories: ['productivity', 'utilities'],
    /* 자기 자신을 가리킨다 — navigator.getInstalledRelatedApps() 로 "이미 설치돼
       있는지"를 물어보기 위한 것이다. 이미 설치했으면 Chrome 이 설치 기회를 주지
       않는데, 그때 설치 안내만 띄우면 초대받은 사람이 할 수 있는 일이 없어진다. */
    related_applications: [
      {
        platform: 'webapp',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://unoworship-pro-eight.vercel.app'}/manifest.webmanifest`,
      },
    ],
    prefer_related_applications: false,
    icons: [
      {
        src: '/icons/ulju-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/ulju-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/ulju-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
