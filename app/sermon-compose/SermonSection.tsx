'use client';

// 설교대지 화면의 소탭 래퍼.
//   · 원문 저장   — 신규 SermonOutlinePanel (찬송가·찬양을 나눠 각각 프로그램으로 만든다)
//   · 원문 저장 안에 주보 업로드 블록(BulletinUploadBlock)이 들어 있다
//   · 교회소식    — 신규 SermonChurchNewsPanel (빈 줄마다 한 섹션)
//   · 참고 사진   — 신규 SermonImagePanel
//   · 참고 영상   — 신규 SermonYoutubePanel
// 새 기능은 전부 app/sermon-compose 아래에만 둔다.
// 기존 app/sermon/SermonOutlinePage.tsx 는 한 줄도 수정하지 않고 그대로 남겨 둔다.

import { useState } from 'react';
import SermonOutlinePanel from './SermonOutlinePanel';
import SermonChurchNewsPanel from './SermonChurchNewsPanel';
import SermonImagePanel from './SermonImagePanel';
import SermonYoutubePanel from './SermonYoutubePanel';

type Tab = 'outline' | 'news' | 'image' | 'youtube';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'outline', label: '원문 저장' },
  { id: 'news', label: '교회소식' },
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

      {tab === 'outline' && <SermonOutlinePanel />}
      {tab === 'news' && <SermonChurchNewsPanel />}
      {tab === 'image' && <SermonImagePanel />}
      {tab === 'youtube' && <SermonYoutubePanel />}
    </>
  );
}
