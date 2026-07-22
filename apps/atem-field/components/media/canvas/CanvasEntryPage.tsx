'use client';

/**
 * CanvasEntryPage — /media/canvas
 *
 * 캔버스 홈/디자인 라이브러리.
 * - 개인별 저장 디자인
 * - 교회 안에서 공유된 디자인
 * - 교회 공용 템플릿
 * - 새 디자인 생성 진입
 */

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Clock3,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Monitor,
  Plus,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { SyncMeta } from '@/lib/media/mediaTypes';
import { listSavedCanvasDesigns, type SavedCanvasDesign } from '@/app/canvas/lib/canvasDesignLibrary';

type DesignPurpose =
  | '예배 송출'
  | '프롬프트'
  | '설교 타이틀'
  | '유튜브 썸네일'
  | 'SNS 정사각형'
  | '주보'
  | '전단지'
  | '현수막'
  | '명함'
  | '새가족';

type DesignItem = {
  id: string;
  name: string;
  purpose: DesignPurpose;
  owner: string;
  updatedAt: string;
  elements: number;
  visibility: '내 디자인' | '공유됨' | '템플릿';
  thumbnail: string;
  href: string;
};

const SHARED_DESIGNS: DesignItem[] = [
  {
    id: 'choir-caption',
    name: '찬양대 특송 자막',
    purpose: '예배 송출',
    owner: '찬양대',
    updatedAt: '06.05 20:12',
    elements: 12,
    visibility: '공유됨',
    thumbnail: 'from-blue-900 via-blue-600 to-cyan-400',
    href: '/canvas?mode=new&purpose=worship-output',
  },
  {
    id: 'prayer-night-title',
    name: '금요기도회 오프닝',
    purpose: '설교 타이틀',
    owner: '목회실',
    updatedAt: '06.04 17:36',
    elements: 21,
    visibility: '공유됨',
    thumbnail: 'from-purple-950 via-purple-700 to-indigo-500',
    href: '/canvas?mode=new&purpose=sermon-title',
  },
];

const CHURCH_TEMPLATES: DesignItem[] = [
  {
    id: 'template-sermon-clean',
    name: '설교 제목 기본 템플릿',
    purpose: '설교 타이틀',
    owner: 'UnoWorship',
    updatedAt: '기본 제공',
    elements: 11,
    visibility: '템플릿',
    thumbnail: 'from-slate-800 via-slate-600 to-stone-400',
    href: '/canvas?mode=new&purpose=sermon-title',
  },
  {
    id: 'template-youtube-clean',
    name: '유튜브 썸네일 기본 템플릿',
    purpose: '유튜브 썸네일',
    owner: 'UnoWorship',
    updatedAt: '기본 제공',
    elements: 14,
    visibility: '템플릿',
    thumbnail: 'from-red-600 via-orange-500 to-yellow-300',
    href: '/canvas?mode=new&purpose=youtube-thumbnail',
  },
];

export default function CanvasEntryPage() {
  const syncMeta = useMediaStore((s) => s.syncMeta['canvas.projects']);
  const [savedDesigns, setSavedDesigns] = useState<DesignItem[]>([]);

  useEffect(() => {
    const loadSavedDesigns = () => {
      setSavedDesigns(listSavedCanvasDesigns().map(savedToDesignItem));
    };

    loadSavedDesigns();
    window.addEventListener('focus', loadSavedDesigns);
    window.addEventListener('storage', loadSavedDesigns);
    return () => {
      window.removeEventListener('focus', loadSavedDesigns);
      window.removeEventListener('storage', loadSavedDesigns);
    };
  }, []);

  const recentDesigns = savedDesigns.slice(0, 4);

  return (
    <main className="w-full max-w-[1480px] mx-auto px-6 py-7">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
            CANVAS LIBRARY
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">
            캔버스 홈
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            저장된 디자인과 공유 템플릿을 다시 열고 새 디자인을 시작합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SyncBadge meta={syncMeta} />
          <Link
            href="/media/canvas/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
          >
            <Plus size={16} strokeWidth={2.2} />
            새 디자인
          </Link>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <LibraryStat icon={<Clock3 size={17} />} label="최근 작업" value={String(recentDesigns.length)} tone="violet" />
        <LibraryStat icon={<ImageIcon size={17} />} label="내 디자인" value={String(savedDesigns.length)} tone="emerald" />
        <LibraryStat icon={<Share2 size={17} />} label="공유됨" value="2" tone="sky" />
        <LibraryStat icon={<LayoutTemplate size={17} />} label="교회 템플릿" value="2" tone="amber" />
      </section>

      <section className="mb-7 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-700">
              <Sparkles size={19} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-950">교회 디자인 자산 공간</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600">
                방송실, 행정실, 찬양팀이 만든 자료를 한곳에서 열고 재사용할 수 있습니다.
              </p>
            </div>
          </div>
          <Link
            href="/media/canvas/new"
            className="inline-flex h-9 items-center rounded-md border border-violet-200 bg-white px-3 text-[12px] font-semibold text-violet-700 transition-colors hover:border-violet-400 hover:bg-violet-50"
          >
            만들 디자인 선택
          </Link>
        </div>
      </section>

      <DesignSection
        title="최근 디자인"
        description="최근 수정했거나 송출 준비에 자주 쓰는 디자인"
        items={recentDesigns}
        icon={<Clock3 size={16} />}
        emptyText="아직 저장된 디자인이 없습니다. 새 디자인을 만들고 저장하면 여기에 표시됩니다."
      />

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
        <DesignSection
          title="내 디자인"
          description="내 계정에서 만든 개인 작업"
          items={savedDesigns}
          icon={<ImageIcon size={16} />}
          compact
          emptyText="저장된 개인 디자인이 없습니다."
        />
        <DesignSection
          title="공유된 디자인"
          description="교회 구성원이 함께 사용할 수 있는 작업"
          items={SHARED_DESIGNS}
          icon={<Users size={16} />}
          compact
        />
      </div>

      <DesignSection
        title="교회 템플릿"
        description="새 디자인을 빠르게 시작할 수 있는 기본 틀"
        items={CHURCH_TEMPLATES}
        icon={<LayoutTemplate size={16} />}
        className="mt-8"
      />
    </main>
  );
}

function DesignSection({
  title,
  description,
  items,
  icon,
  compact = false,
  className = '',
  emptyText = '표시할 디자인이 없습니다.',
}: {
  title: string;
  description: string;
  items: DesignItem[];
  icon: ReactNode;
  compact?: boolean;
  className?: string;
  emptyText?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-gray-950">
            <span className="text-violet-600">{icon}</span>
            <h2 className="text-[15px] font-bold">{title}</h2>
          </div>
          <p className="mt-0.5 text-[12px] text-gray-500">{description}</p>
        </div>
        <button className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 transition-colors hover:border-violet-300 hover:text-violet-700">
          전체 보기
        </button>
      </div>

      <div className={compact ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'}>
        {items.length > 0
          ? items.map((item) => (
              <DesignCard key={item.id} item={item} />
            ))
          : (
              <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="text-[13px] font-semibold text-gray-500">{emptyText}</p>
                <Link
                  href="/media/canvas/new"
                  className="mt-3 inline-flex h-8 items-center rounded-md bg-gray-950 px-3 text-[12px] font-semibold text-white hover:bg-violet-700"
                >
                  새 디자인 만들기
                </Link>
              </div>
            )}
      </div>
    </section>
  );
}

function DesignCard({ item }: { item: DesignItem }) {
  return (
    <Link
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg"
    >
      <div className={`relative aspect-[16/9] bg-gradient-to-br ${item.thumbnail}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.35),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_45%)]" />
        <div className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-black/35 px-2 text-[10px] font-bold text-white backdrop-blur">
          {item.purpose}
        </div>
        <div className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur">
          {item.purpose === '주보' ? <FileText size={19} /> : <Monitor size={19} />}
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-bold text-gray-950 group-hover:text-violet-700">
            {item.name}
          </p>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
            {item.visibility}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] text-gray-500">
          {item.owner} · {item.elements}개 요소 · {item.updatedAt}
        </p>
      </div>
    </Link>
  );
}

function savedToDesignItem(saved: SavedCanvasDesign): DesignItem {
  const purpose = (saved.purposeLabel ?? '디자인') as DesignPurpose;
  return {
    id: saved.id,
    name: saved.name || saved.project.name || '제목 없는 디자인',
    purpose,
    owner: '나',
    updatedAt: formatSavedAt(saved.updatedAt),
    elements: saved.project.pages.reduce((sum, page) => sum + page.elements.length, 0),
    visibility: '내 디자인',
    thumbnail: thumbnailForPurpose(saved.purposeId),
    href: `/canvas?project=${encodeURIComponent(saved.id)}`,
  };
}

function formatSavedAt(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '방금 저장';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;

  const date = new Date(timestamp);
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function thumbnailForPurpose(purposeId?: string) {
  const map: Record<string, string> = {
    'worship-output': 'from-violet-700 via-fuchsia-600 to-rose-500',
    'prompt-output': 'from-zinc-950 via-zinc-800 to-zinc-600',
    'sermon-title': 'from-slate-950 via-indigo-900 to-cyan-700',
    'youtube-thumbnail': 'from-red-600 via-orange-500 to-yellow-300',
    'sns-square': 'from-fuchsia-500 via-pink-400 to-sky-400',
    'bulletin-a4': 'from-emerald-600 via-teal-500 to-sky-500',
    'flyer-a5': 'from-amber-500 via-orange-400 to-rose-400',
    banner: 'from-orange-500 via-amber-400 to-lime-400',
    'business-card': 'from-blue-700 via-sky-500 to-cyan-300',
  };
  return purposeId && map[purposeId]
    ? map[purposeId]
    : 'from-gray-700 via-gray-500 to-gray-300';
}

function LibraryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'violet' | 'emerald' | 'sky' | 'amber';
}) {
  const toneMap = {
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  } as const;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border ${toneMap[tone]}`}>
        {icon}
      </div>
      <p className="text-[11px] font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

function SyncBadge({ meta }: { meta?: SyncMeta }) {
  if (!meta) return null;
  const map = {
    synced: { color: 'bg-green-50 text-green-700 border-green-200', label: '동기화됨' },
    syncing: { color: 'bg-sky-50 text-sky-700 border-sky-200', label: '동기화 중' },
    pending: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: '대기 중' },
    offline: { color: 'bg-gray-100 text-gray-600 border-gray-200', label: '오프라인' },
    conflict: { color: 'bg-red-50 text-red-700 border-red-200', label: '충돌' },
  } as const;
  const style = map[meta.status];
  return (
    <span className={`inline-flex h-10 items-center rounded-lg border px-3 text-[12px] font-semibold ${style.color}`}>
      {style.label}
    </span>
  );
}
