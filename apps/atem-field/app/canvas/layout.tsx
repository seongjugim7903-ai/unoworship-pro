import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'UnoLive Canvas',
  description: '캔버스 디자인 에디터',
};

/**
 * 캔버스 에디터 전용 레이아웃
 * - 라이트 모드 강제
 * - UnoLive 다크 모드와 완전 분리
 */
export default function CanvasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f0f0f0]" style={{ colorScheme: 'light' }}>
      {children}
    </div>
  );
}
