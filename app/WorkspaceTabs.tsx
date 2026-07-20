'use client';

// 상단 탭 — 자막 협조와 설교대지를 전환한다.

import { useState } from 'react';
import ChoirRequestPage from './choir/ChoirRequestPage';
import SermonOutlinePage from './sermon/SermonOutlinePage';
import WorshipPrepPage from './worship/WorshipPrepPage';

type WorkspaceTab = 'choir' | 'sermon' | 'worship';

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'choir', label: '헵시바 선교단' },
  { id: 'sermon', label: '설교대지' },
  { id: 'worship', label: '준비찬양' },
];

export default function WorkspaceTabs() {
  const [tab, setTab] = useState<WorkspaceTab>('choir');

  return (
    <>
      <header className="workspace-topbar">
        <p className="workspace-brand">ULJU COMMUNITY</p>
        <nav className="workspace-tabs" aria-label="작업 메뉴">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'choir' && <ChoirRequestPage />}
      {tab === 'sermon' && <SermonOutlinePage />}
      {tab === 'worship' && <WorshipPrepPage />}
    </>
  );
}
