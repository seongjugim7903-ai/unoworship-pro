// 임시 홈 — Phase 0 스캐폴드 상태 확인 페이지 (Phase 2에서 컴포저 UI로 대체)

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px' }}>
      <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, letterSpacing: '.16em', color: '#7c5cff', textTransform: 'uppercase' }}>
        UnoWorship Pro · Phase 0
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 12px' }}>스캐폴드 기동 확인</h1>
      <p style={{ color: '#98a0b3', fontSize: 14, lineHeight: 1.7 }}>
        커스텀 서버 + socket.io + zod + vitest 골격이 살아 있습니다.
        진단은 <a href="/health" style={{ color: '#b9a5ff' }}>/health</a> 를 확인하세요.
        컴포저 UI는 Phase 2에서 새 디자인(5영역 레이아웃)으로 들어옵니다.
      </p>
    </main>
  );
}
