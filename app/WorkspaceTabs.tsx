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
        <div className="landing-bg" aria-hidden="true" />
        <header className="landing-head">
          <span className="landing-head-brand">ULJU COMMUNITY</span>
        </header>
        <div className="landing-inner">
          <div className="landing-copy">
            <h1>온전한 예배를 여는<br />섬김이들을 환영합니다</h1>
            <blockquote className="landing-verse">
              <p>“각각 은사를 받은 대로 하나님의 여러 가지 은혜를 맡은 선한 청지기 같이 서로 봉사하라”</p>
              <cite>베드로전서 4장 10절</cite>
            </blockquote>
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
