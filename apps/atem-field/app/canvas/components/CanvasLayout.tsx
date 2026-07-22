'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import TopBar from './TopBar';
import BottomBar from './BottomBar';
import SidebarIcons, { type SidebarTab } from './sidebar/SidebarIcons';
import PhotoPanel from './sidebar/PhotoPanel';
import CanvasWorkspace from './workspace/CanvasWorkspace';
import { useCanvasStore, type CanvasProject } from '@/app/canvas/lib/canvasStore';
import { getCanvasPurpose, type CanvasPurpose } from '@/app/canvas/lib/canvasPurpose';
import { getSavedCanvasDesign, saveCanvasDesign } from '@/app/canvas/lib/canvasDesignLibrary';
import { downloadCanvasProjectAsPng, openCanvasProjectPdfPrintWindow } from '@/app/canvas/lib/canvasExport';
import { createTextElement, createShapeElement, type CanvasElement, type ShapeType } from '@/lib/canvasTypes';

/**
 * CanvasLayout — 캔버스 에디터 전체 레이아웃
 *
 * ┌──────────────────────────────────────────────┐
 * │                   TopBar                     │
 * ├────┬──────────┬──────────────────┬───────────┤
 * │Icon│SidePanel │   Workspace      │Properties │
 * │60px│  280px   │   (flex-1)       │  280px    │
 * ├────┴──────────┴──────────────────┴───────────┤
 * │                  BottomBar                   │
 * └──────────────────────────────────────────────┘
 */

const SIDE_PANEL_WIDTH = 280;
const PRINT_TARGET_DPI = 300;
const MM_PER_INCH = 25.4;

type PrintGuideVisibility = {
  work: boolean;
  trim: boolean;
  safe: boolean;
};

type CanvasViewMode = 'fit' | 'actual-pixels';

function getDefaultPageNamesForPurpose(purpose: CanvasPurpose) {
  if (purpose.id === 'business-card') {
    return ['앞면', '뒷면'];
  }

  return ['페이지 1'];
}

export default function CanvasLayout() {
  const searchParams = useSearchParams();
  const urlPurposeInfo = useMemo(
    () => getCanvasPurpose(searchParams.get('purpose')),
    [searchParams],
  );
  const isNewDesign = searchParams.get('mode') === 'new';
  const projectId = searchParams.get('project');
  const loadedProjectRef = useRef<string | null>(null);
  const projectInitializedKeyRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<SidebarTab | null>('template');
  const [zoom, setZoom] = useState(100);
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>('fit');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [printGuideVisibility, setPrintGuideVisibility] = useState<PrintGuideVisibility>({
    work: true,
    trim: true,
    safe: true,
  });

  const project = useCanvasStore((s) => s.project);
  const activePageId = useCanvasStore((s) => s.activePageId);
  const { setProjectName, setProjectPurpose, setProject, createProject, setActivePage, addPage, addElement } = useCanvasStore();
  const projectPurposeInfo = useMemo(
    () => getCanvasPurpose(project.purposeId),
    [project.purposeId],
  );
  const purposeInfo = urlPurposeInfo ?? projectPurposeInfo;
  const activePage = useMemo(
    () => project.pages.find((page) => page.id === activePageId) ?? project.pages[0] ?? null,
    [activePageId, project.pages],
  );
  const outputPixelSize = useMemo(() => {
    if (!activePage) return null;

    if (purposeInfo?.unit === 'mm') {
      return {
        width: mmToPx(activePage.width, PRINT_TARGET_DPI),
        height: mmToPx(activePage.height, PRINT_TARGET_DPI),
      };
    }

    return {
      width: Math.round(activePage.width),
      height: Math.round(activePage.height),
    };
  }, [activePage, purposeInfo?.unit]);
  const actualSizeLabel = outputPixelSize
    ? `${outputPixelSize.width} x ${outputPixelSize.height}px`
    : undefined;

  useEffect(() => {
    if (!projectId || loadedProjectRef.current === projectId) return;
    const saved = getSavedCanvasDesign(projectId);
    if (!saved) return;

    setProject(saved.project);
    loadedProjectRef.current = projectId;
  }, [projectId, setProject]);

  useEffect(() => {
    if (!urlPurposeInfo || !isNewDesign || projectId) return;

    const initKey = `${urlPurposeInfo.id}:${urlPurposeInfo.canvasWidth}x${urlPurposeInfo.canvasHeight}`;
    if (projectInitializedKeyRef.current === initKey) return;

    const firstPage = project.pages[0];
    const defaultPageNames = getDefaultPageNamesForPurpose(urlPurposeInfo);
    const needsNewProject =
      project.purposeId !== urlPurposeInfo.id ||
      firstPage?.width !== urlPurposeInfo.canvasWidth ||
      firstPage?.height !== urlPurposeInfo.canvasHeight ||
      project.pages.length < defaultPageNames.length;

    if (needsNewProject) {
      createProject(urlPurposeInfo.defaultProjectName, {
        purposeId: urlPurposeInfo.id,
        purposeLabel: urlPurposeInfo.label,
        purposeGroup: urlPurposeInfo.group,
        purposeSizeLabel: urlPurposeInfo.sizeLabel,
        pageWidth: urlPurposeInfo.canvasWidth,
        pageHeight: urlPurposeInfo.canvasHeight,
        pageNames: defaultPageNames,
      });
    } else {
      setProjectPurpose({
        purposeId: urlPurposeInfo.id,
        purposeLabel: urlPurposeInfo.label,
        purposeGroup: urlPurposeInfo.group,
        purposeSizeLabel: urlPurposeInfo.sizeLabel,
      });
      if (!project.name || project.name === '제목 없는 디자인') {
        setProjectName(urlPurposeInfo.defaultProjectName);
      }
    }

    projectInitializedKeyRef.current = initKey;
  }, [createProject, isNewDesign, project.name, project.pages, project.purposeId, projectId, setProjectName, setProjectPurpose, urlPurposeInfo]);

  // 사이드 패널 열림 여부
  const isSidePanelOpen = activeTab !== null;

  // 요소 추가 핸들러
  const handleAddElement = useCallback((shapeType: ShapeType) => {
    const elements = useCanvasStore.getState().getElements();
    const newEl = createShapeElement({ shapeType, zIndex: elements.length });
    addElement(newEl);
  }, [addElement]);

  const handleAddText = useCallback((preset: 'heading' | 'subheading' | 'body') => {
    const elements = useCanvasStore.getState().getElements();
    const sizeMap = { heading: 64, subheading: 40, body: 24 };
    const contentMap = { heading: '제목을 입력하세요', subheading: '부제목을 입력하세요', body: '본문 텍스트' };
    const newEl = createTextElement({
      zIndex: elements.length,
      linked: false,
      content: contentMap[preset],
      fontSize: sizeMap[preset],
      fontWeight: preset === 'body' ? 'normal' : 'bold',
      color: '#333333',
      strokeWidth: 0,
    });
    addElement(newEl);
  }, [addElement]);

  const handleApplyTemplate = useCallback((templateId: string) => {
    if (!purposeInfo) return;

    const elements = useCanvasStore.getState().getElements();
    const baseZ = elements.length;
    const add = (...items: CanvasElement[]) => {
      items.forEach((item, index) => addElement({ ...item, zIndex: baseZ + index }));
    };

    if (purposeInfo.id === 'prompt-output') {
      add(
        createShapeElement({ x: 0, y: 0, width: 100, height: 100, fill: '#050505', zIndex: baseZ, layerRole: 'background' }),
        createTextElement({
          x: 8,
          y: templateId === 'next-line' ? 27 : 36,
          width: 84,
          height: 18,
          content: '가사를 입력하세요',
          linked: false,
          fontSize: 72,
          fontWeight: 'bold',
          textAlign: 'center',
          color: '#ffffff',
          strokeWidth: 0,
          zIndex: baseZ + 1,
          layerRole: 'prompt-only',
        }),
        ...(templateId === 'next-line'
          ? [
              createTextElement({
                x: 10,
                y: 58,
                width: 80,
                height: 10,
                content: '다음 가사',
                linked: false,
                fontSize: 36,
                fontWeight: 'normal',
                textAlign: 'center',
                color: '#a3a3a3',
                strokeWidth: 0,
                zIndex: baseZ + 2,
                layerRole: 'prompt-only',
              }),
            ]
          : []),
      );
      return;
    }

    if (purposeInfo.id === 'worship-output') {
      add(
        createShapeElement({ x: 0, y: 0, width: 100, height: 100, fill: '#101828', zIndex: baseZ, layerRole: 'background' }),
        createShapeElement({ x: 7, y: 67, width: 86, height: 18, fill: '#000000', fillOpacity: 0.66, cornerRadius: 18, zIndex: baseZ + 1, layerRole: 'lower-third' }),
        createTextElement({
          x: 10,
          y: 70,
          width: 80,
          height: 10,
          content: templateId === 'full-lyrics' ? '예배 가사를 입력하세요' : '하단 자막을 입력하세요',
          linked: false,
          fontSize: 46,
          fontWeight: 'bold',
          textAlign: 'center',
          color: '#ffffff',
          strokeWidth: 0,
          zIndex: baseZ + 2,
          layerRole: 'lyrics',
        }),
      );
      return;
    }

    if (purposeInfo.id === 'sermon-title') {
      add(
        createShapeElement({ x: 0, y: 0, width: 100, height: 100, fill: '#111827', zIndex: baseZ, layerRole: 'background' }),
        createTextElement({ x: 12, y: 30, width: 76, height: 12, content: '설교 제목을 입력하세요', linked: false, fontSize: 60, textAlign: 'center', color: '#ffffff', strokeWidth: 0, zIndex: baseZ + 1 }),
        createTextElement({ x: 18, y: 48, width: 64, height: 6, content: '본문 1:1-3 · 설교자', linked: false, fontSize: 28, fontWeight: 'normal', textAlign: 'center', color: '#d1d5db', strokeWidth: 0, zIndex: baseZ + 2 }),
      );
      return;
    }

    if (purposeInfo.id === 'business-card') {
      add(
        createShapeElement({ x: 0, y: 0, width: 100, height: 100, fill: '#ffffff', zIndex: baseZ, layerRole: 'background' }),
        createShapeElement({ x: 0, y: 0, width: 100, height: 16, fill: '#1e1b4b', zIndex: baseZ + 1 }),
        createShapeElement({ x: 7, y: 75, width: 86, height: 1.2, fill: '#7c3aed', cornerRadius: 4, zIndex: baseZ + 2 }),
        createTextElement({
          x: 10,
          y: 28,
          width: 38,
          height: 12,
          content: '홍길동',
          linked: false,
          fontSize: 28,
          fontWeight: 'bold',
          textAlign: 'left',
          color: '#111827',
          strokeWidth: 0,
          zIndex: baseZ + 3,
        }),
        createTextElement({
          x: 10,
          y: 44,
          width: 40,
          height: 8,
          content: '담임목사 · UnoWorship Church',
          linked: false,
          fontSize: 11,
          fontWeight: 'normal',
          textAlign: 'left',
          color: '#4b5563',
          strokeWidth: 0,
          zIndex: baseZ + 4,
        }),
        createTextElement({
          x: 56,
          y: 33,
          width: 34,
          height: 19,
          content: '010-0000-0000\nchurch@example.com\nunoworship.kr',
          linked: false,
          fontSize: 9,
          fontWeight: 'normal',
          textAlign: 'right',
          color: '#374151',
          strokeWidth: 0,
          lineHeight: 1.5,
          zIndex: baseZ + 5,
        }),
      );
      return;
    }

    add(
      createShapeElement({ x: 0, y: 0, width: 100, height: 100, fill: purposeInfo.group === '인쇄/홍보' ? '#ffffff' : '#f8fafc', zIndex: baseZ, layerRole: 'background' }),
      createShapeElement({ x: 8, y: 12, width: 10, height: 2, fill: '#7c3aed', cornerRadius: 8, zIndex: baseZ + 1 }),
      createTextElement({
        x: 9,
        y: 26,
        width: 72,
        height: 14,
        content: purposeInfo.label,
        linked: false,
        fontSize: purposeInfo.group === '인쇄/홍보' ? 48 : 64,
        fontWeight: 'bold',
        textAlign: 'left',
        color: '#111827',
        strokeWidth: 0,
        zIndex: baseZ + 2,
      }),
      createTextElement({
        x: 10,
        y: 45,
        width: 62,
        height: 7,
        content: '내용을 입력하세요',
        linked: false,
        fontSize: 28,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#4b5563',
        strokeWidth: 0,
        zIndex: baseZ + 3,
      }),
    );
  }, [addElement, purposeInfo]);

  const buildProjectForSave = useCallback(() => (
    purposeInfo
      ? {
          ...project,
          purposeId: purposeInfo.id,
          purposeLabel: purposeInfo.label,
          purposeGroup: purposeInfo.group,
          purposeSizeLabel: purposeInfo.sizeLabel,
        }
      : project
  ), [project, purposeInfo]);

  const handleSave = useCallback(() => {
    const saved = saveCanvasDesign(buildProjectForSave());
    setProject(saved.project);
    setSaveStatus('saved');
    window.setTimeout(() => setSaveStatus('idle'), 1600);
    return saved.project;
  }, [buildProjectForSave, setProject]);

  const handleExportPng = useCallback(async () => {
    try {
      const savedProject = handleSave();
      await downloadCanvasProjectAsPng(savedProject, 300, activePageId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'PNG 내보내기에 실패했습니다.');
    }
  }, [activePageId, handleSave]);

  const handleExportPdf = useCallback(async () => {
    try {
      const savedProject = handleSave();
      await openCanvasProjectPdfPrintWindow(savedProject, 300);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'PDF 출력 창을 열지 못했습니다.');
    }
  }, [handleSave]);

  const handleViewModeChange = useCallback((mode: CanvasViewMode) => {
    setCanvasViewMode(mode);
    setZoom(100);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* ── 상단바 ── */}
      <TopBar
        fileName={project.name}
        purposeLabel={purposeInfo?.label}
        purposeSizeLabel={purposeInfo?.sizeLabel}
        onFileNameChange={setProjectName}
        onUndo={() => {/* TODO: undoManager */}}
        onRedo={() => {/* TODO: undoManager */}}
        onSave={handleSave}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        canUndo={false}
        canRedo={false}
        saveStatus={saveStatus}
      />

      {/* ── 메인 영역 (사이드바 + 워크스페이스 + 속성) ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── 좌측: 아이콘 스트립 ── */}
        <SidebarIcons activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ── 좌측: 확장 패널 (슬라이드) ── */}
        <div
          className="flex-shrink-0 bg-white border-r border-gray-200 overflow-hidden transition-all duration-200 ease-out"
          style={{ width: isSidePanelOpen ? SIDE_PANEL_WIDTH : 0 }}
        >
          <div className="w-[280px] h-full overflow-y-auto">
            <SidePanelContent
              tab={activeTab}
              purpose={purposeInfo}
              onAddElement={handleAddElement}
              onAddText={handleAddText}
              onApplyTemplate={handleApplyTemplate}
            />
          </div>
        </div>

        {/* ── 중앙: 캔버스 워크스페이스 ── */}
        <CanvasWorkspace
          zoom={zoom}
          viewMode={canvasViewMode}
          outputPixelWidth={outputPixelSize?.width}
          printGuideVisibility={printGuideVisibility}
        />

        {/* ── 우측: 속성 패널 (요소 선택 시 슬라이드) ── */}
        {purposeInfo?.unit === 'mm' && (
          <PrintPrepPanel
            project={project}
            purpose={purposeInfo}
            activePageId={activePageId}
            guideVisibility={printGuideVisibility}
            onSelectPage={setActivePage}
            onToggleGuide={(key) => {
              setPrintGuideVisibility((current) => ({
                ...current,
                [key]: !current[key],
              }));
            }}
          />
        )}
      </div>

      {/* ── 하단바 ── */}
      <BottomBar
        pages={project.pages.map((p) => ({ id: p.id, name: p.name }))}
        activePageId={activePageId}
        onSelectPage={setActivePage}
        onAddPage={() => addPage()}
        viewMode={canvasViewMode}
        onViewModeChange={handleViewModeChange}
        actualSizeLabel={actualSizeLabel}
        zoom={zoom}
        onZoomChange={setZoom}
      />
    </div>
  );
}

function PrintPrepPanel({
  project,
  purpose,
  activePageId,
  guideVisibility,
  onSelectPage,
  onToggleGuide,
}: {
  project: CanvasProject;
  purpose: CanvasPurpose;
  activePageId: string;
  guideVisibility: PrintGuideVisibility;
  onSelectPage: (pageId: string) => void;
  onToggleGuide: (key: keyof PrintGuideVisibility) => void;
}) {
  const isBusinessCard = purpose.id === 'business-card';
  const guide = purpose.printGuide;
  const activePage = project.pages.find((page) => page.id === activePageId);
  const hasFrontBack = !isBusinessCard || project.pages.length >= 2;
  const imageQuality = getPrintImageQuality(project, purpose);

  const checks = [
    {
      label: isBusinessCard ? '앞면/뒷면 페이지 준비' : '작업 페이지 준비',
      ok: hasFrontBack,
      detail: isBusinessCard ? `${project.pages.length}/2면` : activePage?.name ?? '현재 페이지',
    },
    {
      label: '도련 포함 작업판',
      ok: Boolean(guide),
      detail: guide ? `${guide.workWidthMm} x ${guide.workHeightMm}mm` : purpose.sizeLabel,
    },
    {
      label: '300dpi 출력판',
      ok: purpose.unit === 'mm',
      detail: activePage ? `${mmToPx(activePage.width, PRINT_TARGET_DPI)} x ${mmToPx(activePage.height, PRINT_TARGET_DPI)}px` : '계산 대기',
    },
    {
      label: '재단선/안전영역 확인',
      ok: Boolean(guide && guideVisibility.trim && guideVisibility.safe),
      detail: guide ? `${guide.trimWidthMm} x ${guide.trimHeightMm}mm` : '프리셋 준비 중',
    },
    {
      label: '가이드선은 최종 출력 제외',
      ok: true,
      detail: 'PNG/PDF에는 디자인 요소만 출력',
    },
    {
      label: '이미지 품질 300dpi',
      ok: imageQuality.ok,
      detail: imageQuality.detail,
    },
  ];

  return (
    <aside className="w-[280px] shrink-0 border-l border-gray-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-600">
            PRINT CHECK
          </p>
          <h2 className="mt-1 text-sm font-bold text-gray-950">{purpose.label}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            한 면씩 크게 편집하고, 조판은 내보내기 단계에서 처리합니다.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-800">
                {isBusinessCard ? '면 전환' : '페이지'}
              </h3>
              <span className="text-[10px] font-semibold text-gray-400">
                {project.pages.length}p
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {project.pages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => onSelectPage(page.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    page.id === activePageId
                      ? 'border-violet-300 bg-violet-50 text-violet-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200'
                  }`}
                >
                  <span className="block text-[10px] font-semibold text-current/60">
                    {isBusinessCard ? `면 ${index + 1}` : `페이지 ${index + 1}`}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-bold">
                    {page.name || `페이지 ${index + 1}`}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {guide && (
            <section>
              <h3 className="mb-2 text-xs font-bold text-gray-800">가이드 표시</h3>
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <GuideToggle
                  label="작업선"
                  color="bg-orange-500"
                  checked={guideVisibility.work}
                  onClick={() => onToggleGuide('work')}
                />
                <GuideToggle
                  label="재단선/칼선"
                  color="bg-rose-600"
                  checked={guideVisibility.trim}
                  onClick={() => onToggleGuide('trim')}
                />
                <GuideToggle
                  label="안전영역"
                  color="bg-green-600"
                  checked={guideVisibility.safe}
                  onClick={() => onToggleGuide('safe')}
                />
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-bold text-gray-800">인쇄 체크</h3>
            <div className="space-y-2">
              {checks.map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${item.ok ? 'bg-green-500' : 'bg-amber-400'}`} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-gray-800">{item.label}</p>
                      <p className="mt-0.5 truncate text-[10px] font-medium text-gray-500">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {purpose.sourceCutline && (
            <section className="rounded-xl border border-sky-100 bg-sky-50 p-3">
              <p className="text-[11px] font-bold text-sky-800">업체 기준 파일</p>
              <p className="mt-1 break-all text-[10px] font-medium leading-relaxed text-sky-700">
                {purpose.sourceCutline.vendorLabel} · {purpose.sourceCutline.fileName}
              </p>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}

function getPrintImageQuality(project: CanvasProject, purpose: CanvasPurpose) {
  if (purpose.unit !== 'mm') {
    return { ok: true, detail: '화면용 디자인' };
  }

  let imageCount = 0;
  let checkedCount = 0;
  let missingMetaCount = 0;
  let minEffectiveDpi = Number.POSITIVE_INFINITY;

  for (const page of project.pages) {
    for (const element of page.elements) {
      if (element.type !== 'image') continue;
      imageCount += 1;

      const meta = element.imageMeta;
      if (!meta?.naturalWidthPx || !meta.naturalHeightPx) {
        missingMetaCount += 1;
        continue;
      }

      const placedWidthMm = (element.width / 100) * page.width;
      const placedHeightMm = (element.height / 100) * page.height;
      if (placedWidthMm <= 0 || placedHeightMm <= 0) {
        missingMetaCount += 1;
        continue;
      }

      const effectiveDpiX = meta.naturalWidthPx / (placedWidthMm / MM_PER_INCH);
      const effectiveDpiY = meta.naturalHeightPx / (placedHeightMm / MM_PER_INCH);
      const effectiveDpi = Math.floor(Math.min(effectiveDpiX, effectiveDpiY));
      minEffectiveDpi = Math.min(minEffectiveDpi, effectiveDpi);
      checkedCount += 1;
    }
  }

  if (imageCount === 0) {
    return { ok: true, detail: '이미지 없음' };
  }

  if (checkedCount === 0) {
    return {
      ok: false,
      detail: `기존 이미지 ${missingMetaCount}개는 재업로드 후 검사 가능`,
    };
  }

  const suffix = missingMetaCount > 0 ? ` · 기존 이미지 ${missingMetaCount}개 검사 불가` : '';
  if (minEffectiveDpi >= PRINT_TARGET_DPI) {
    return {
      ok: true,
      detail: `최저 ${minEffectiveDpi}dpi${suffix}`,
    };
  }

  if (minEffectiveDpi >= 200) {
    return {
      ok: false,
      detail: `최저 ${minEffectiveDpi}dpi · 축소/교체 권장${suffix}`,
    };
  }

  return {
    ok: false,
    detail: `최저 ${minEffectiveDpi}dpi · 인쇄 품질 위험${suffix}`,
  };
}

function mmToPx(mm: number, dpi: number) {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

function GuideToggle({
  label,
  color,
  checked,
  onClick,
}: {
  label: string;
  color: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left"
    >
      <span className="flex items-center gap-2 text-[11px] font-bold text-gray-700">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${checked ? 'bg-violet-600' : 'bg-gray-300'}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

/* ── 사이드 패널 콘텐츠 (탭별 분기) ── */
function SidePanelContent({ tab, purpose, onAddElement, onAddText, onApplyTemplate }: {
  tab: SidebarTab | null;
  purpose: CanvasPurpose | null;
  onAddElement: (type: ShapeType) => void;
  onAddText: (preset: 'heading' | 'subheading' | 'body') => void;
  onApplyTemplate: (templateId: string) => void;
}) {
  if (!tab) return null;

  const headers: Record<SidebarTab, string> = {
    template: '템플릿',
    element: '요소',
    text: '텍스트',
    photo: '사진',
    upload: '업로드',
    layer: '레이어',
  };

  return (
    <div className="flex flex-col h-full">
      {/* 패널 헤더 */}
      <div className="flex items-center h-11 px-4 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-800">{headers[tab]}</h2>
      </div>

      {/* 패널 콘텐츠 — 추후 각 패널 컴포넌트로 교체 */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'element' && <ElementAddPlaceholder onAdd={onAddElement} />}
        {tab === 'text' && <TextAddPlaceholder onAdd={onAddText} />}
        {tab === 'photo' && <PhotoPanel />}
        {tab === 'template' && <TemplatePurposePanel purpose={purpose} onApplyTemplate={onApplyTemplate} />}
        {tab === 'upload' && <UploadPlaceholder />}
        {tab === 'layer' && (
          <p className="text-sm text-gray-400 text-center mt-10">
            요소를 추가하면 레이어가 표시됩니다
          </p>
        )}
      </div>
    </div>
  );
}

/* ── 플레이스홀더 컴포넌트들 (추후 교체) ── */

function TemplatePurposePanel({
  purpose,
  onApplyTemplate,
}: {
  purpose: CanvasPurpose | null;
  onApplyTemplate: (templateId: string) => void;
}) {
  if (!purpose) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <p className="text-sm font-semibold text-gray-700">디자인 목적을 먼저 선택하세요</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          새 디자인에서 용도를 고르면 관련 템플릿이 여기에 표시됩니다.
        </p>
        <Link
          href="/media/canvas/new"
          className="mt-3 inline-flex h-8 items-center rounded-md bg-[#7c3aed] px-3 text-xs font-semibold text-white hover:bg-[#6d28d9]"
        >
          새 디자인 선택
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
        <p className="text-[11px] font-semibold text-violet-700">{purpose.group}</p>
        <h3 className="mt-1 text-sm font-bold text-gray-900">{purpose.label}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
          {purpose.templateLead}
        </p>
        <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-[10px] font-medium text-gray-500">
          {purpose.sizeLabel} · {purpose.outputHint}
        </p>
        {purpose.sourceCutline && (
          <div className="mt-2 rounded-md border border-sky-100 bg-sky-50 px-2 py-2 text-[10px] leading-relaxed text-sky-800">
            <p className="font-bold">
              {purpose.sourceCutline.vendorLabel} 칼선 기준: {purpose.sourceCutline.fileName}
            </p>
            {purpose.sourceCutline.note && (
              <p className="mt-1">{purpose.sourceCutline.note}</p>
            )}
          </div>
        )}
        {purpose.printGuide && (
          <div className="mt-2 space-y-1 rounded-md border border-white/70 bg-white px-2 py-2 text-[10px] font-semibold text-gray-600">
            <p>
              작업판: {purpose.printGuide.workWidthMm} x {purpose.printGuide.workHeightMm}mm
            </p>
            <p>
              재단선/칼선: {purpose.printGuide.trimWidthMm} x {purpose.printGuide.trimHeightMm}mm
            </p>
            <p>
              도련: 사방 {purpose.printGuide.bleedMm}mm · 안전영역: 재단선 안쪽 {purpose.printGuide.safeInsetMm}mm
            </p>
            {purpose.id === 'business-card' && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800">
                <p>와우프레스 접수용: 최종 제출 파일에서는 안내선 테두리를 선없음/색없음 처리해야 합니다.</p>
                <p className="mt-1">양면 작업은 앞면을 왼쪽, 뒷면을 오른쪽에 배열하는 구조를 기준으로 준비합니다.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">시작 템플릿</p>
        {purpose.templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onApplyTemplate(template.id)}
            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-[#7c3aed] hover:bg-[#7c3aed]/5"
          >
            <p className="text-[13px] font-bold text-gray-800">{template.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{template.description}</p>
            <p className="mt-2 text-[11px] font-semibold text-[#7c3aed]">템플릿 적용</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ElementAddPlaceholder({ onAdd }: { onAdd: (type: ShapeType) => void }) {
  const shapes: { label: string; icon: string; type: ShapeType }[] = [
    { label: '사각형', icon: '□', type: 'rect' },
    { label: '둥근 사각형', icon: '▢', type: 'roundRect' },
    { label: '원', icon: '○', type: 'ellipse' },
    { label: '라인', icon: '—', type: 'line' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">도형</p>
      <div className="grid grid-cols-4 gap-2">
        {shapes.map((s) => (
          <button
            key={s.label}
            onClick={() => onAdd(s.type)}
            className="flex flex-col items-center justify-center h-16 rounded-lg border border-gray-200
                       hover:border-[#7c3aed] hover:bg-[#7c3aed]/5 transition-colors group"
            title={s.label}
          >
            <span className="text-xl text-gray-400 group-hover:text-[#7c3aed]">{s.icon}</span>
            <span className="text-[9px] text-gray-400 mt-1 group-hover:text-[#7c3aed]">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TextAddPlaceholder({ onAdd }: { onAdd: (preset: 'heading' | 'subheading' | 'body') => void }) {
  const presets: { key: 'heading' | 'subheading' | 'body'; label: string; size: string; weight: string }[] = [
    { key: 'heading', label: '제목 추가', size: 'text-2xl', weight: 'font-bold' },
    { key: 'subheading', label: '부제목 추가', size: 'text-lg', weight: 'font-semibold' },
    { key: 'body', label: '본문 텍스트 추가', size: 'text-sm', weight: 'font-normal' },
  ];

  return (
    <div className="space-y-2">
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => onAdd(p.key)}
          className="w-full text-left px-4 py-3 rounded-lg border border-gray-200
                     hover:border-[#7c3aed] hover:bg-[#7c3aed]/5 transition-colors group"
        >
          <span className={`${p.size} ${p.weight} text-gray-700 group-hover:text-[#7c3aed]`}>
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function UploadPlaceholder() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-gray-300
                      hover:border-[#7c3aed] transition-colors cursor-pointer">
        <span className="text-2xl text-gray-300 mb-1">⬆</span>
        <p className="text-xs text-gray-400">이미지를 드래그하거나 클릭하여 업로드</p>
        <p className="text-[10px] text-gray-300 mt-1">PNG, JPG, SVG (최대 10MB)</p>
      </div>
    </div>
  );
}
