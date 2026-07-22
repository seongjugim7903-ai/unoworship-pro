'use client';

import { Home, LayoutTemplate, Shapes, Type, Image as ImageIcon, Upload, Layers } from 'lucide-react';

/**
 * SidebarIcons — 좌측 60px 아이콘 스트립
 *
 * 미리캔버스 스타일: 아이콘 + 작은 라벨
 * 클릭 시 해당 패널 토글 (같은 아이콘 재클릭 → 닫기)
 */

export type SidebarTab = 'template' | 'element' | 'text' | 'photo' | 'upload' | 'layer';

interface SidebarIconsProps {
  activeTab: SidebarTab | null;
  onTabChange: (tab: SidebarTab | null) => void;
}

const TABS: { id: SidebarTab; icon: React.ElementType; label: string }[] = [
  { id: 'template', icon: LayoutTemplate, label: '템플릿' },
  { id: 'element',  icon: Shapes,         label: '요소' },
  { id: 'text',     icon: Type,           label: '텍스트' },
  { id: 'photo',    icon: ImageIcon,      label: '사진' },
  { id: 'upload',   icon: Upload,         label: '업로드' },
  { id: 'layer',    icon: Layers,         label: '레이어' },
];

export default function SidebarIcons({ activeTab, onTabChange }: SidebarIconsProps) {
  return (
    <div className="flex flex-col items-center w-[60px] bg-white border-r border-gray-200 py-2 gap-0.5 flex-shrink-0">
      <button
        onClick={() => { window.location.href = '/media/canvas'; }}
        className="flex flex-col items-center justify-center w-[52px] h-[52px] rounded-lg
                   text-gray-500 hover:bg-violet-50 hover:text-[#7c3aed] transition-colors gap-0.5"
        title="캔버스 홈으로"
      >
        <Home size={20} strokeWidth={1.7} />
        <span className="text-[9px] font-medium leading-none">홈</span>
      </button>

      <div className="my-1 h-px w-8 bg-gray-200" />

      {TABS.map(({ id, icon: Icon, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(isActive ? null : id)}
            className={`flex flex-col items-center justify-center w-[52px] h-[52px] rounded-lg
                        transition-colors gap-0.5
              ${isActive
                ? 'bg-[#7c3aed]/10 text-[#7c3aed]'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            title={label}
          >
            <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
            <span className="text-[9px] font-medium leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
