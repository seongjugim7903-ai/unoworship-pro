'use client';

// PPT 변환본이 없는 찬양곡 처리 창.
//
// 흐름은 이렇다.
//   1. 곡을 누르면 브라우저에 그 곡 PPT 검색이 열린다
//   2. 사용자가 파일을 받는다
//   3. 다운로드 폴더 자동감지(DownloadsPptAutoImporter)가 변환해 slide-images 프로그램으로 만든다
//   4. 이 창이 그것을 알아채고 그 곡만 프로그램으로 만들어 저장한 뒤 목록에서 지운다
//
// 왜 이 창이 따로 도는가 — 자동감지는 이미 4초마다 다운로드 폴더를 본다. 그 위에
// "어느 곡을 기다리는 중인지"만 얹으면 되고, 하나 끝날 때마다 남은 것이 줄어야
// 사용자가 몇 곡 남았는지 안다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedProgram } from '@/lib/generators/programTypes';
import { fetchSlideImagePrograms } from '@/lib/generators/worshipServiceGenerator';
import { openPptBrowserSearch } from '@/lib/pptBrowserSearch';
import { buildPrepProgram } from './buildWorshipPrepPrograms';
import type { CloudPrepSong, WorshipPrepSet } from './types';

/** 자동감지와 같은 주기로 본다 — 더 자주 봐도 변환이 그만큼 빨라지지 않는다 */
const POLL_MS = 4_000;

interface Props {
  set: WorshipPrepSet;
  /** 아직 변환본을 못 찾은 곡들 */
  missing: CloudPrepSong[];
  /** 한 곡이 프로그램이 되었을 때 — 호출부가 세트리스트에 넣는다 */
  onResolved: (program: SavedProgram) => void | Promise<void>;
  onClose: () => void;
}

export default function MissingPraiseModal({ set, missing, onResolved, onClose }: Props) {
  const [pending, setPending] = useState<CloudPrepSong[]>(missing);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  /* 같은 곡을 두 번 저장하지 않게 — 폴링이 겹칠 수 있다 */
  const busyRef = useRef(false);

  useEffect(() => { setPending(missing); }, [missing]);

  const sweep = useCallback(async () => {
    if (busyRef.current || pending.length === 0) return;
    busyRef.current = true;
    setChecking(true);
    try {
      const slidePrograms = await fetchSlideImagePrograms();
      const done: string[] = [];

      for (const song of pending) {
        const program = buildPrepProgram(set, song, slidePrograms);
        if (!program) continue;
        const res = await fetch('/api/programs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(program),
        });
        if (!res.ok) continue;
        await onResolved(program);
        done.push(song.id);
      }

      if (done.length > 0) setPending((prev) => prev.filter((song) => !done.includes(song.id)));
      setError('');
    } catch {
      setError('변환본 목록을 확인하지 못했습니다. 잠시 뒤 다시 봅니다.');
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }, [pending, set, onResolved]);

  /* 받아 놓은 것이 이미 있을 수 있으니 열자마자 한 번 보고, 이후 주기적으로 본다 */
  useEffect(() => {
    void sweep();
    const timer = window.setInterval(() => { void sweep(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sweep]);

  const allDone = pending.length === 0;

  return (
    /* z-index 는 인라인으로 준다 — 이 프로젝트 Tailwind 는 표준 스케일(z-50 까지)만
       생성해서 z-[70] 같은 임의값이 규칙으로 나오지 않는다. 드롭다운(z-50)보다 위여야 한다. */
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4" style={{ zIndex: 70 }}>
      <div className="w-full max-w-md rounded-xl border border-[#333] bg-[#1a1a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
          <div>
            <p className="text-xs font-bold text-emerald-400">PPT 변환본이 없는 찬양</p>
            <p className="mt-0.5 text-[10px] text-gray-500">
              {set.serviceDate} {set.serviceType} · {set.team}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-[#222] hover:text-white"
          >
            닫기
          </button>
        </div>

        {allDone ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-emerald-400">모두 프로그램이 되었습니다</p>
            <p className="mt-1 text-[10px] text-gray-500">남은 곡이 없습니다.</p>
          </div>
        ) : (
          <>
            <p className="px-4 pt-3 text-[10px] leading-relaxed text-gray-400">
              곡을 누르면 브라우저에 PPT 검색이 열립니다. 파일을 내려받으면
              다운로드 폴더 자동감지가 변환하고, 여기서 알아서 프로그램으로 만든 뒤 목록에서 지웁니다.
            </p>
            <div className="max-h-72 overflow-auto p-2">
              {pending.map((song) => (
                <button
                  key={song.id}
                  onClick={() => openPptBrowserSearch(song.title)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#222]"
                >
                  <span className="truncate text-xs font-semibold text-white">{song.title}</span>
                  <span className="flex-shrink-0 rounded-full bg-[#222] px-2 py-0.5 text-[9px] text-emerald-300">
                    🔍 PPT 검색
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-[#2a2a2a] px-4 py-2">
          <span className="text-[10px] text-gray-500">
            {error || (checking ? '변환본 확인 중...' : `남은 곡 ${pending.length}개 · 자동으로 확인합니다`)}
          </span>
          <button
            onClick={() => { void sweep(); }}
            className="rounded-md border border-[#333] px-2 py-1 text-[10px] text-gray-400 transition-colors hover:border-emerald-600 hover:text-emerald-300"
          >
            지금 확인
          </button>
        </div>
      </div>
    </div>
  );
}
