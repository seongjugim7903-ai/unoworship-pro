/**
 * canvasStore.ts
 * 캔버스 에디터 전용 Zustand 스토어
 *
 * UnoLive store와 완전 독립 — Setlist/Section 계층 없음
 * pages[].elements[] 플랫 구조로 직접 접근
 *
 * 향후 웹 SaaS 전환 시 localStorage → API 교체 지점이 persist 설정에 집중됨
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CanvasElement } from '@/lib/canvasTypes';

// ─────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────
export interface CanvasPage {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;   // px (기본 1920)
  height: number;  // px (기본 1080)
}

export interface CanvasProject {
  id: string;
  name: string;
  /** 최초 생성 시 선택한 디자인 목적. 저장/라이브러리/출력 패널 기준값. */
  purposeId?: string;
  purposeLabel?: string;
  purposeGroup?: string;
  purposeSizeLabel?: string;
  pages: CanvasPage[];
  createdAt: number;
  updatedAt: number;
}

type CreateProjectMetadata = Partial<CanvasProject> & {
  pageWidth?: number;
  pageHeight?: number;
  pageName?: string;
  pageNames?: string[];
};

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────
function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultPage(name = '페이지 1', width = 1920, height = 1080): CanvasPage {
  return {
    id: generateId('page'),
    name,
    elements: [],
    width,
    height,
  };
}

function createDefaultProject(name = '제목 없는 디자인', metadata: CreateProjectMetadata = {}): CanvasProject {
  const pageNames = metadata.pageNames?.length
    ? metadata.pageNames
    : [metadata.pageName ?? '페이지 1'];
  const pageWidth = metadata.pageWidth ?? 1920;
  const pageHeight = metadata.pageHeight ?? 1080;

  return {
    id: generateId('proj'),
    name,
    purposeId: metadata.purposeId,
    purposeLabel: metadata.purposeLabel,
    purposeGroup: metadata.purposeGroup,
    purposeSizeLabel: metadata.purposeSizeLabel,
    pages: pageNames.map((pageName) => createDefaultPage(pageName, pageWidth, pageHeight)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─────────────────────────────────────────
// Store 인터페이스
// ─────────────────────────────────────────
interface CanvasStoreState {
  // ── 프로젝트 ──
  project: CanvasProject;
  activePageId: string;

  // ── 선택 ──
  selectedElementIds: string[];

  // ── 프로젝트 액션 ──
  setProjectName: (name: string) => void;
  setProjectPurpose: (purpose: Pick<CanvasProject, 'purposeId' | 'purposeLabel' | 'purposeGroup' | 'purposeSizeLabel'>) => void;
  setProject: (project: CanvasProject) => void;
  createProject: (name?: string, metadata?: CreateProjectMetadata) => void;

  // ── 페이지 액션 ──
  addPage: (name?: string) => void;
  removePage: (pageId: string) => void;
  setActivePage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
  duplicatePage: (pageId: string) => void;

  // ── 선택 액션 ──
  setSelectedElement: (id: string | null) => void;
  toggleSelectedElement: (id: string) => void;
  setSelectedElements: (ids: string[]) => void;

  // ── 요소 CRUD ──
  addElement: (element: CanvasElement) => void;
  updateElement: (elementId: string, updates: Partial<CanvasElement>) => void;
  removeElement: (elementId: string) => void;
  reorderElements: (elements: CanvasElement[]) => void;

  // ── 헬퍼 ──
  /** 현재 활성 페이지 */
  getActivePage: () => CanvasPage | undefined;
  /** 현재 활성 페이지의 요소 배열 */
  getElements: () => CanvasElement[];
}

// ─────────────────────────────────────────
// Store 구현
// ─────────────────────────────────────────
const defaultProject = createDefaultProject();

export const useCanvasStore = create<CanvasStoreState>()(
  persist(
    (set, get) => ({
      // ── 초기 상태 ──
      project: defaultProject,
      activePageId: defaultProject.pages[0].id,
      selectedElementIds: [],

      // ── 프로젝트 액션 ──
      setProjectName: (name) =>
        set((s) => ({
          project: { ...s.project, name, updatedAt: Date.now() },
        })),

      setProjectPurpose: (purpose) =>
        set((s) => ({
          project: {
            ...s.project,
            ...purpose,
            updatedAt: Date.now(),
          },
        })),

      setProject: (project) =>
        set({
          project,
          activePageId: project.pages[0]?.id ?? '',
          selectedElementIds: [],
        }),

      createProject: (name, metadata) => {
        const project = createDefaultProject(name, metadata);
        set({
          project,
          activePageId: project.pages[0].id,
          selectedElementIds: [],
        });
      },

      // ── 페이지 액션 ──
      addPage: (name) => {
        const currentPage = get().getActivePage();
        const newPage = createDefaultPage(
          name,
          currentPage?.width ?? 1920,
          currentPage?.height ?? 1080,
        );
        set((s) => ({
          project: {
            ...s.project,
            pages: [...s.project.pages, newPage],
            updatedAt: Date.now(),
          },
          activePageId: newPage.id,
          selectedElementIds: [],
        }));
      },

      removePage: (pageId) =>
        set((s) => {
          if (s.project.pages.length <= 1) return s; // 최소 1페이지
          const pages = s.project.pages.filter((p) => p.id !== pageId);
          const activePageId = s.activePageId === pageId ? pages[0].id : s.activePageId;
          return {
            project: { ...s.project, pages, updatedAt: Date.now() },
            activePageId,
            selectedElementIds: [],
          };
        }),

      setActivePage: (pageId) =>
        set({ activePageId: pageId, selectedElementIds: [] }),

      renamePage: (pageId, name) =>
        set((s) => ({
          project: {
            ...s.project,
            pages: s.project.pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
            updatedAt: Date.now(),
          },
        })),

      duplicatePage: (pageId) => {
        const state = get();
        const src = state.project.pages.find((p) => p.id === pageId);
        if (!src) return;
        const newPage: CanvasPage = {
          ...src,
          id: generateId('page'),
          name: `${src.name} 사본`,
          elements: src.elements.map((el) => ({
            ...el,
            id: generateId('el'),
          })),
        };
        const idx = state.project.pages.findIndex((p) => p.id === pageId);
        const pages = [...state.project.pages];
        pages.splice(idx + 1, 0, newPage);
        set({
          project: { ...state.project, pages, updatedAt: Date.now() },
          activePageId: newPage.id,
          selectedElementIds: [],
        });
      },

      // ── 선택 액션 ──
      setSelectedElement: (id) =>
        set({ selectedElementIds: id ? [id] : [] }),

      toggleSelectedElement: (id) =>
        set((s) => {
          const ids = s.selectedElementIds;
          return {
            selectedElementIds: ids.includes(id)
              ? ids.filter((i) => i !== id)
              : [...ids, id],
          };
        }),

      setSelectedElements: (ids) =>
        set({ selectedElementIds: ids }),

      // ── 요소 CRUD (활성 페이지 기준) ──
      addElement: (element) =>
        set((s) => ({
          project: {
            ...s.project,
            pages: s.project.pages.map((p) =>
              p.id === s.activePageId
                ? { ...p, elements: [...p.elements, element] }
                : p
            ),
            updatedAt: Date.now(),
          },
          selectedElementIds: [element.id],
        })),

      updateElement: (elementId, updates) =>
        set((s) => ({
          project: {
            ...s.project,
            pages: s.project.pages.map((p) =>
              p.id === s.activePageId
                ? {
                    ...p,
                    elements: p.elements.map((el) =>
                      el.id === elementId ? { ...el, ...updates } as CanvasElement : el
                    ),
                  }
                : p
            ),
            updatedAt: Date.now(),
          },
        })),

      removeElement: (elementId) =>
        set((s) => ({
          project: {
            ...s.project,
            pages: s.project.pages.map((p) =>
              p.id === s.activePageId
                ? { ...p, elements: p.elements.filter((el) => el.id !== elementId) }
                : p
            ),
            updatedAt: Date.now(),
          },
          selectedElementIds: s.selectedElementIds.filter((id) => id !== elementId),
        })),

      reorderElements: (elements) =>
        set((s) => ({
          project: {
            ...s.project,
            pages: s.project.pages.map((p) =>
              p.id === s.activePageId ? { ...p, elements } : p
            ),
            updatedAt: Date.now(),
          },
        })),

      // ── 헬퍼 ──
      getActivePage: () => {
        const s = get();
        return s.project.pages.find((p) => p.id === s.activePageId);
      },

      getElements: () => {
        const s = get();
        return s.project.pages.find((p) => p.id === s.activePageId)?.elements ?? [];
      },
    }),
    {
      name: 'unoCanvas-store',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        }
      ),
      partialize: (state) => ({
        project: state.project,
        activePageId: state.activePageId,
      }),
    }
  )
);
