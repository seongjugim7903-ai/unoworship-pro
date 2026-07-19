import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hephzibah Choir',
    short_name: 'Hephzibah',
    description: '찬양대 가사를 예배용 자막 이미지로 만들고 공유합니다.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f7fb',
    theme_color: '#6754d9',
    lang: 'ko-KR',
    categories: ['productivity', 'utilities'],
    icons: [
      {
        src: '/icons/hephzibah-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/hephzibah-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/hephzibah-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
