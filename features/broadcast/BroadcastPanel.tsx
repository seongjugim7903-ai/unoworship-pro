'use client';

// 방송실 — 다가오는 예배 기준으로 모든 팀 자료를 한자리에서 살피는 읽기 전용 운영 화면.
// 1단계: 뼈대. 2단계에서 준비찬양 악보 · 찬양대 자막 · 설교대지 · 주보를 모아 보여준다.

export default function BroadcastPanel() {
  return (
    <main className="site-shell">
      <section className="panel form-panel">
        <div className="panel-heading">
          <div><span className="step-number">방송실</span><h2>예배 운영</h2></div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🎛️</div>
          <p>
            다가오는 예배의 모든 팀 자료를<br />
            한 화면에 모아 보는 방송실 화면입니다.<br />
            <br />
            준비찬양 악보 · 찬양대 자막 · 설교대지 · 주보를<br />
            곧 여기서 함께 볼 수 있게 만듭니다.
          </p>
        </div>
      </section>
    </main>
  );
}
