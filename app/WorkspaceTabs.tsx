'use client';

// 랜딩 → 각 기능 진입. 탭 상시 노출을 없애 오조작을 줄인다.

import { useState } from 'react';
import ChoirRequestPage from './choir/ChoirRequestPage';
import SermonOutlinePage from './sermon/SermonOutlinePage';
import WorshipPrepPage from './worship/WorshipPrepPage';

type View = 'home' | 'choir' | 'sermon' | 'worship';

const MENU: Array<{ id: Exclude<View, 'home'>; label: string; desc: string }> = [
  { id: 'choir', label: '헵시바 선교단', desc: '찬양대 자막 · 카카오톡 공유' },
  { id: 'sermon', label: '설교대지', desc: '설교 대지 · 주보 정리' },
  { id: 'worship', label: '준비찬양', desc: '팀별 찬양 준비 · 악보' },
];

export default function WorkspaceTabs() {
  const [view, setView] = useState<View>('home');

  if (view === 'home') {
    return (
      <main className="landing">
        <div className="landing-inner">
          <p className="landing-brand">ULJU COMMUNITY</p>
          <div className="landing-copy">
            <h1>예배 뒤에서 섬기는<br />당신을 위해</h1>
            <p>찬양은 곡조로 드리는 기도, 예배를 여는 첫 고백입니다.<br />보이지 않아도 가장 귀한 그 사역을 응원합니다.</p>
          </div>
          <nav className="landing-menu" aria-label="기능 선택">
            {MENU.map((item) => (
              <button key={item.id} type="button" className="landing-btn" onClick={() => setView(item.id)}>
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </nav>
        </div>
      </main>
    );
  }

  const current = MENU.find((item) => item.id === view);

  return (
    <>
      <header className="feature-topbar">
        <button className="feature-back" type="button" onClick={() => setView('home')}>← 홈</button>
        <span className="feature-title">{current?.label}</span>
      </header>
      {view === 'choir' && <ChoirRequestPage />}
      {view === 'sermon' && <SermonOutlinePage />}
      {view === 'worship' && <WorshipPrepPage />}
    </>
  );
}
