'use client';

// 설교대지 화면의 소탭 래퍼.
//   · 원문 저장 — 기존 SermonOutlinePage 를 그대로 렌더한다(그 파일은 수정하지 않는다)
//   · 참고 이미지 — 신규 SermonImagePanel
// 새 기능은 전부 app/sermon-compose 아래에만 둔다.

import { useState } from 'react';
import SermonOutlinePage from '../sermon/SermonOutlinePage';
import SermonImagePanel from './SermonImagePanel';
import SermonYoutubePanel from './SermonYoutubePanel';

type Tab = 'outline' | 'image' | 'youtube';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'outline', label: '원문 저장' },
  { id: 'image', label: '참고 사진' },
  { id: 'youtube', label: '참고 영상' },
];

/** site-shell 과 좌우 여백을 맞춘다. globals.css 를 건드리지 않으려고 인라인으로 둔다. */
const barStyle: React.CSSProperties = {
  maxWidth: 1260,
  margin: '0 auto',
  padding: '0 28px',
};

export default function SermonSection() {
  const [tab, setTab] = useState<Tab>('outline');

  return (
    <>
      <div style={barStyle}>
        <div className="song-tabs" role="tablist" aria-label="설교대지 화면 전환">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`song-tab${tab === item.id ? ' active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'outline' && <SermonOutlinePage />}
      {tab === 'image' && <SermonImagePanel />}
      {tab === 'youtube' && <SermonYoutubePanel />}
    </>
  );
}
