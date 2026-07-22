'use client';

// 모바일 공유용 찬양대 무대 모니터 이미지 뷰어 — programId 로 서버에서 프로그램을 받아 이미지 갤러리로 렌더.
// 로그인 불필요(/share 는 공개 라우트, GET /api/programs/:id 도 공개).

import { useState, useEffect } from 'react';
import type { SavedProgram } from '@/lib/generators/programTypes';
import ChoirPromptImageGallery from '@/components/prompt/choir/ChoirPromptImageGallery';

export default function ChoirPromptShareView({ id }: { id: string }) {
  const [program, setProgram] = useState<SavedProgram | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/programs/${id}`);
        if (!res.ok) throw new Error('not found');
        const { program: p }: { program: SavedProgram } = await res.json();
        if (!cancelled) {
          setProgram(p);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('notfound');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (status === 'notfound' || !program) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-gray-500">요청한 자료를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const composer =
    typeof program.formData?.composer === 'string' ? program.formData.composer : '';
  const songTitle =
    (typeof program.formData?.songTitle === 'string' && program.formData.songTitle) ||
    program.item.title.replace('[찬양대] ', '');
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <header className="mb-5">
        <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
          {program.worshipName}
        </p>
        <h1 className="mt-1 text-xl md:text-2xl font-bold text-gray-900">{songTitle}</h1>
        {composer && <p className="mt-0.5 text-sm text-gray-500">작곡 {composer}</p>}
      </header>

      <ChoirPromptImageGallery
        sections={program.item.sections}
        promptLayout={program.item.promptLayout ?? 'black-white'}
        songTitle={songTitle}
        shareUrl={shareUrl}
      />
    </div>
  );
}
