import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  FileText,
  Image as ImageIcon,
  Monitor,
  PanelTop,
  RectangleHorizontal,
  Smartphone,
  Tv,
} from 'lucide-react';
import { CANVAS_PURPOSES, type CanvasPurpose } from '@/app/canvas/lib/canvasPurpose';

type Preset = CanvasPurpose;

const GROUPS: Preset['group'][] = ['예배 화면', '온라인 콘텐츠', '인쇄/홍보'];

const ICONS: Partial<Record<Preset['id'], ReactNode>> = {
  'worship-output': <Monitor size={21} />,
  'prompt-output': <Tv size={21} />,
  'sermon-title': <PanelTop size={21} />,
  'youtube-thumbnail': <ImageIcon size={21} />,
  'sns-square': <Smartphone size={21} />,
  'bulletin-a4': <BookOpen size={21} />,
  'flyer-a5': <FileText size={21} />,
  leaflet: <BookOpen size={21} />,
  poster: <ImageIcon size={21} />,
  banner: <RectangleHorizontal size={21} />,
  'business-card': <BadgeCheck size={21} />,
  'shaped-business-card': <BadgeCheck size={21} />,
  sticker: <ImageIcon size={21} />,
  'pop-display': <RectangleHorizontal size={21} />,
  'board-sign': <RectangleHorizontal size={21} />,
  envelope: <FileText size={21} />,
  package: <FileText size={21} />,
  fan: <ImageIcon size={21} />,
  'id-card': <BadgeCheck size={21} />,
  calendar: <BookOpen size={21} />,
  'paper-holder': <FileText size={21} />,
  'cup-carrier': <ImageIcon size={21} />,
  'goods-print': <ImageIcon size={21} />,
};

const ACCENTS: Partial<Record<Preset['id'], string>> = {
  'worship-output': 'bg-violet-50 text-violet-700 border-violet-100',
  'prompt-output': 'bg-zinc-100 text-zinc-800 border-zinc-200',
  'sermon-title': 'bg-sky-50 text-sky-700 border-sky-100',
  'youtube-thumbnail': 'bg-red-50 text-red-700 border-red-100',
  'sns-square': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100',
  'bulletin-a4': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'flyer-a5': 'bg-amber-50 text-amber-700 border-amber-100',
  leaflet: 'bg-lime-50 text-lime-700 border-lime-100',
  poster: 'bg-rose-50 text-rose-700 border-rose-100',
  banner: 'bg-orange-50 text-orange-700 border-orange-100',
  'business-card': 'bg-blue-50 text-blue-700 border-blue-100',
};

export default function NewCanvasDesignPage() {
  return (
    <main className="w-full max-w-[1440px] mx-auto px-6 py-7">
      <div className="mb-7">
        <Link
          href="/media/canvas"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 transition-colors hover:border-violet-300 hover:text-violet-700"
        >
          <ArrowLeft size={15} />
          캔버스 홈
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
              NEW DESIGN
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">
              무엇을 디자인할까요?
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              선택한 용도에 맞춰 캔버스 규격과 출력 준비 항목이 달라집니다.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {GROUPS.map((group) => {
          const presets = CANVAS_PURPOSES.filter((preset) => preset.group === group);
          return (
            <section key={group}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-gray-950">{group}</h2>
                  {group === '인쇄/홍보' && (
                    <p className="mt-0.5 text-[12px] text-gray-500">
                      와우프레스 공식 칼선 파일을 기준 자료로 묶어 둔 디자인 종류입니다.
                    </p>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-gray-400">
                  {presets.length}개
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {presets.map((preset) => (
                  <PresetCard key={preset.id} preset={preset} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function PresetCard({ preset }: { preset: Preset }) {
  const icon = ICONS[preset.id] ?? <FileText size={21} />;
  const accent = ACCENTS[preset.id] ?? 'bg-slate-50 text-slate-700 border-slate-100';

  return (
    <Link
      href={`/canvas?mode=new&purpose=${preset.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-[164px] flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg"
    >
      <div>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accent}`}>
            {icon}
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
            {preset.sizeLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <h3 className="min-w-0 text-[15px] font-bold text-gray-950 group-hover:text-violet-700">
            {preset.label}
          </h3>
          {preset.sourceCutline && (
            <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              {preset.sourceCutline.vendorLabel}
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-gray-500">
          {preset.templateLead}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-violet-700">
          시작하기
        </span>
        {preset.sourceCutline && (
          <span className="truncate text-[10px] font-medium text-gray-400">
            {preset.sourceCutline.fileName}
          </span>
        )}
      </div>
    </Link>
  );
}
