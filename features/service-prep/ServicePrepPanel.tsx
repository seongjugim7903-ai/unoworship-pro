'use client';

// 예배준비 — 새신자 명단 · 목사님 긴급 준비 내용 · 그날 준비 항목을 챙기는 화면.
// 1단계: 뼈대. 3단계에서 각 항목을 저장·공유하도록 채운다.

export default function ServicePrepPanel() {
  return (
    <main className="site-shell">
      <section className="panel form-panel">
        <div className="panel-heading">
          <div><span className="step-number">예배준비</span><h2>예배 준비</h2></div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>
            새신자 명단 · 목사님 긴급 준비 내용 ·<br />
            그날의 준비 항목을 챙기는 화면입니다.<br />
            <br />
            전체 팀을 살피며 예배를 준비하도록<br />
            곧 항목별 저장·공유를 붙입니다.
          </p>
        </div>
      </section>
    </main>
  );
}
