'use client';

/**
 * ShortcutSettings — 단축키 참조
 *
 * Phase 1: 읽기 전용 참조 표
 * Phase 2: 개별 단축키 커스터마이즈
 */

import type { ShortcutEntry } from '@/lib/settings/settingsTypes';

const SHORTCUTS: ShortcutEntry[] = [
  // 편집
  { id: 'undo', label: '되돌리기', keys: 'Ctrl+Z', category: 'edit' },
  { id: 'redo', label: '다시 실행', keys: 'Ctrl+Shift+Z', category: 'edit' },
  { id: 'copy', label: '복사', keys: 'Ctrl+C', category: 'edit' },
  { id: 'paste', label: '붙여넣기', keys: 'Ctrl+V', category: 'edit' },
  { id: 'duplicate', label: '복제', keys: 'Ctrl+D', category: 'edit' },
  { id: 'delete', label: '삭제', keys: 'Delete / Backspace', category: 'edit' },

  // 선택
  { id: 'select-all', label: '전체 선택', keys: 'Ctrl+A', category: 'selection' },
  { id: 'multi-select', label: '다중 선택', keys: 'Shift + 클릭', category: 'selection' },
  { id: 'deselect', label: '선택 해제', keys: 'Esc', category: 'selection' },

  // 변형
  { id: 'nudge', label: '1 단위 이동', keys: '화살표 키', category: 'transform' },
  { id: 'nudge-large', label: '큰 단위 이동', keys: 'Shift + 화살표', category: 'transform' },
  { id: 'lock-aspect', label: '비율 유지 리사이즈', keys: 'Shift 드래그', category: 'transform' },
  { id: 'center-resize', label: '중심 기준 리사이즈', keys: 'Alt 드래그', category: 'transform' },

  // 뷰
  { id: 'motion', label: '모션 패널 토글', keys: '(상단 메뉴)', category: 'view' },
  { id: 'ppt-slide-importer', label: 'PPT 이미지 폴더 가져오기', keys: 'P', category: 'view' },

  // 송출 (향후)
  { id: 'record-toggle', label: '녹화 토글 (준비중)', keys: 'R', category: 'broadcast' },
  { id: 'live-toggle', label: '라이브 토글 (준비중)', keys: 'L', category: 'broadcast' },
];

const CATEGORY_LABELS: Record<ShortcutEntry['category'], string> = {
  edit: '편집',
  selection: '선택',
  transform: '변형',
  view: '뷰',
  broadcast: '송출',
};

export default function ShortcutSettings() {
  // 카테고리별 그룹
  const grouped = SHORTCUTS.reduce<Record<string, ShortcutEntry[]>>(
    (acc, s) => {
      (acc[s.category] ||= []).push(s);
      return acc;
    },
    {},
  );

  return (
    <div>
      <p className="text-[11px] text-gray-500 mb-4">
        Phase 1에서는 읽기 전용 참조입니다. 커스터마이즈는 Phase 2에서 지원
        예정입니다.
      </p>

      {Object.entries(grouped).map(([cat, entries]) => (
        <section key={cat} className="mb-5">
          <h3 className="text-[12px] font-semibold text-gray-300 mb-2">
            {CATEGORY_LABELS[cat as ShortcutEntry['category']]}
          </h3>
          <div className="rounded border border-[#1f1f1f] overflow-hidden">
            {entries.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center justify-between px-3 py-2 text-[11px] ${
                  i % 2 === 0 ? 'bg-[#0a0a0a]' : 'bg-[#0d0d0d]'
                }`}
              >
                <span className="text-gray-300">{e.label}</span>
                <kbd className="px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] font-mono text-[10px] text-gray-400">
                  {e.keys}
                </kbd>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
