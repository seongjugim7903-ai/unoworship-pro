import type { Metadata } from 'next';
import MediaTopBar from '@/components/media/layout/MediaTopBar';

export const metadata: Metadata = {
  title: 'UnoMedia — 자막협조 지휘체계',
  description:
    '소형 교회 미디어부를 위한 협업 + 입력 + 방송 관제 플랫폼. UnoLive의 웹 관문.',
};

/**
 * app/media/layout.tsx
 * UnoMedia 전역 레이아웃
 *
 * 3역할 통합 엔트리:
 *   ① UnoLive 제품 랜딩 (비로그인 · 좌측 마케팅 내비로 접근)
 *   ② 각 교회 미디어부 자막협조 대시보드 (우측 워크스페이스 내비)
 *   ③ 오퍼레이터 데스크탑 온보딩 (좌측 제품 메뉴 내 확장)
 *
 * 상단 TopBar는 전역. 내용은 각 페이지가 주입.
 */
export default function MediaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full bg-[#f8fafc] text-gray-900 flex flex-col"
      style={{ colorScheme: 'light' }}
    >
      <MediaTopBar />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
