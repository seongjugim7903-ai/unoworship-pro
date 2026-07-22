import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  AppState,
  Setlist,
  SetlistItem,
  Section,
  SubtitleStyle,
  AtemSettings,
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_ATEM_SETTINGS,
} from './types';
import {
  CanvasElement,
  GradientConfig,
  createTextElement,
  DEFAULT_GRADIENT,
  DEFAULT_RENDER_TARGETS,
  getDefaultLayerRoleForElement,
} from './canvasTypes';
import { isLayerOutputWorkspaceSection } from './layerOutputWorkspace';

export const DEMO_SETLIST: Setlist = {
  id: 'demo-setlist',
  name: '주일낮예배',
  date: new Date().toISOString().split('T')[0],
  createdAt: Date.now(),
  items: [
    {
      id: 'item-1',
      title: '주 하나님 지으신 모든 세계',
      sections: [
        { id: 'sec-1-1', label: '절 1', text: '주 하나님 지으신 모든 세계\n내 마음속에 그리어볼 때', colorMark: '#ffffff', elements: [] },
        { id: 'sec-1-2', label: '절 2', text: '숲속에서 들리는 새소리와\n높은 산이 울려퍼질 때', colorMark: '#ffffff', elements: [] },
        { id: 'sec-1-chorus', label: '후렴', text: '내 영혼이 나의 하나님께\n크도다 주님의 높고 위대하심', colorMark: '#facc15', elements: [] },
      ],
    },
    {
      id: 'item-2',
      title: '감사와 찬양',
      sections: [
        { id: 'sec-2-1', label: '절 1', text: '감사함으로 그 앞에 나아가\n노래하며 즐거워하세', colorMark: '#ffffff', elements: [] },
        { id: 'sec-2-chorus', label: '후렴', text: '우리 함께 감사드리세\n주님은 선하신 분', colorMark: '#facc15', elements: [] },
      ],
    },
  ],
};

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

// ── IndexedDB 스토리지 어댑터 ──────────────────────────────────────────────
// localStorage 는 5MB 제한이라 이미지 Base64 포함 시 QuotaExceededError 발생.
// IndexedDB 는 수백 MB 까지 저장 가능하므로 persist 스토리지로 사용.
const IDB_NAME = 'unoLive-db';
const IDB_STORE = 'persist';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await openIDB();
      const value = await new Promise<string | null>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(name);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });

      // ── localStorage → IndexedDB 자동 마이그레이션 ──
      // IndexedDB 에 데이터가 없으면 기존 localStorage 에서 마이그레이션
      if (!value && typeof localStorage !== 'undefined') {
        const legacy = localStorage.getItem(name);
        if (legacy) {
          console.log('[store] localStorage → IndexedDB 마이그레이션 중...');
          await idbStorage.setItem(name, legacy);
          // 마이그레이션 완료 후 localStorage 정리 (quota 확보)
          localStorage.removeItem(name);
          console.log('[store] 마이그레이션 완료');
          return legacy;
        }
      }

      return value;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const db = await openIDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, name);
    } catch {
      // IndexedDB 실패 시 무시 (데이터 유실 가능하지만 런타임 에러 방지)
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await openIDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(name);
    } catch { /* ignore */ }
  },
};

interface StoreState extends AppState {
  setlists: Setlist[];

  // Setlist actions
  addSetlist: (setlist: Setlist) => void;
  removeSetlist: (id: string) => void;
  updateSetlist: (id: string, updates: Partial<Setlist>) => void;
  setCurrentSetlist: (id: string | null) => void;

  // Item actions
  addItem: (setlistId: string, item: SetlistItem) => void;
  removeItem: (setlistId: string, itemId: string) => void;
  clearItems: (setlistId: string) => void;
  updateItem: (setlistId: string, itemId: string, updates: Partial<SetlistItem>) => void;
  setActiveItem: (itemId: string | null) => void;
  reorderItems: (setlistId: string, items: SetlistItem[]) => void;

  // Section actions
  setActiveSection: (sectionId: string | null) => void;
  addSection: (setlistId: string, itemId: string, section: Section) => void;
  removeSection: (setlistId: string, itemId: string, sectionId: string) => void;
  duplicateSection: (setlistId: string, itemId: string, sectionId: string) => void;
  updateSection: (setlistId: string, itemId: string, sectionId: string, updates: Partial<Section>) => void;

  // Canvas element CRUD (activeSection 기준 단축 액션)
  selectedElementId: string | null;
  selectedElementIds: string[];
  setSelectedElement: (elementId: string | null) => void;
  toggleSelectedElement: (elementId: string) => void;
  setSelectedElements: (elementIds: string[]) => void;
  addElement: (setlistId: string, itemId: string, sectionId: string, element: CanvasElement) => void;
  updateElement: (setlistId: string, itemId: string, sectionId: string, elementId: string, updates: Partial<CanvasElement>) => void;
  removeElement: (setlistId: string, itemId: string, sectionId: string, elementId: string) => void;
  reorderElements: (setlistId: string, itemId: string, sectionId: string, elements: CanvasElement[]) => void;

  // Output control
  setBlackout: (active: boolean) => void;
  setOutputConnected: (connected: boolean) => void;
  setGlobalStyle: (style: Partial<SubtitleStyle>) => void;

  // ATEM 연동 설정
  setAtemSettings: (settings: Partial<AtemSettings>) => void;

  // 모션 모드
  isMotionMode: boolean;
  setMotionMode: (active: boolean) => void;

  // 지우개 모드
  isEraserMode: boolean;
  setEraserMode: (active: boolean) => void;
  eraserBrushSize: number;   // 0.01–1.0 (마스크 짧은변 대비 비율, 최대 ~300px)
  setEraserBrushSize: (size: number) => void;
  eraserHardness: number;    // 0–100
  setEraserHardness: (hardness: number) => void;

  // 선택 도구 모드 (포토샵 사각 선택)
  isSelectionMode: boolean;
  setSelectionMode: (active: boolean) => void;
  /** 선택 도구로 크롭된 이미지 data URL (Ctrl+V로 붙여넣기) */
  selectionClipboard: string | null;
  setSelectionClipboard: (dataUrl: string | null) => void;

  // [FEATURE: YT_STANDBY] 유튜브 송출 스탠바이
  //   PageDown/PageUp 또는 섹션 카드 더블클릭으로 YouTube 링크가 있는 섹션에
  //   도착했을 때 즉시 송출하지 않고 "활성화된 대기 상태" 로 잡아둠.
  //   Enter/Space 키 또는 에디터 내 YouTube 클릭 시 커밋(송출).
  youtubeStandby: { itemId: string; sectionId: string } | null;
  setYouTubeStandby: (value: { itemId: string; sectionId: string } | null) => void;

  // 현재 송출 중인 섹션 (실시간 에디터 동기화 기준점)
  //   SetlistPanel 의 지역 outputRef 를 대체 — 모든 송출 경로(OperatorPanel,
  //   SetlistPanel, YouTube 스탠바이 커밋) 가 공통으로 업데이트하여
  //   realtime sync 가 어떤 경로로 송출됐든 일관되게 동작하도록 함.
  broadcastSection: { itemId: string; sectionId: string } | null;
  setBroadcastSection: (value: { itemId: string; sectionId: string } | null) => void;
  // [FEATURE: BROADCAST_GRID] 송출 그리드(홈키 전체화면)가 열려 있는가.
  //   열려 있으면 프로그램 이동 시 "첫 섹션 자동 선택"을 억제해 그리드 뷰가 튀지 않게 한다.
  broadcastGridOpen: boolean;
  setBroadcastGridOpen: (open: boolean) => void;

  // [FEATURE: REF_PANEL] 송출번호 참조 패널에 표시할 프로그램(프로그램 우클릭으로 지정, null=미표시)
  referenceItemId: string | null;
  setReferenceItemId: (id: string | null) => void;

  // persist hydration 완료 플래그
  _hydrated: boolean;
  _setHydrated: (v: boolean) => void;

  // [FEATURE: SECTION_TRANSITION] 섹션 송출 시 적용되는 전환 효과
  //   대상: /output (강대상) + /prompt (중층) + /media/broadcast 대시보드 미러
  //   (Dashboard Scene 전환과는 독립 — 서로 간섭 없음)
  sectionTransition: SectionTransitionConfig;
  setSectionTransition: (patch: Partial<SectionTransitionConfig>) => void;
}

// ── [FEATURE: SECTION_TRANSITION] 전환 타입 / 설정 ──
export type SectionTransitionType = 'cut' | 'fade' | 'slide' | 'dip-to-black';

export interface SectionTransitionConfig {
  type: SectionTransitionType;
  /** 밀리초. cut 이면 0 강제 */
  duration: number;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      // Initial state
      setlists: [],
      currentSetlistId: null,
      activeItemId: null,
      activeSectionId: null,
      isBlackout: false,
      isOutputConnected: false,
      globalStyle: DEFAULT_SUBTITLE_STYLE,
      selectedElementId: null,
      selectedElementIds: [],
      atemSettings: DEFAULT_ATEM_SETTINGS,
      isMotionMode: false,
      isEraserMode: false,
      eraserBrushSize: 0.08,
      eraserHardness: 30,
      isSelectionMode: false,
      selectionClipboard: null,

      // [FEATURE: YT_STANDBY]
      youtubeStandby: null,
      broadcastSection: null,
      broadcastGridOpen: false,
      referenceItemId: null,

      // Setlist actions
      addSetlist: (setlist) =>
        set((state) => ({ setlists: [...state.setlists, setlist] })),

      removeSetlist: (id) =>
        set((state) => ({
          setlists: state.setlists.filter((s) => s.id !== id),
          currentSetlistId: state.currentSetlistId === id ? null : state.currentSetlistId,
        })),

      updateSetlist: (id, updates) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      setCurrentSetlist: (id) => set({ currentSetlistId: id, activeItemId: null, activeSectionId: null }),

      // Item actions
      addItem: (setlistId, item) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId ? { ...s, items: [...s.items, item] } : s
          ),
        })),

      removeItem: (setlistId, itemId) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId
              ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
              : s
          ),
          activeItemId: state.activeItemId === itemId ? null : state.activeItemId,
        })),

      // 컴포즈의 프로그램 목록만 비운다. data/programs의 저장 파일은 건드리지 않는다.
      clearItems: (setlistId) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId ? { ...s, items: [] } : s
          ),
          activeItemId: null,
          activeSectionId: null,
          selectedElementId: null,
          selectedElementIds: [],
        })),

      updateItem: (setlistId, itemId, updates) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId
              ? { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)) }
              : s
          ),
        })),

      setActiveItem: (itemId) => set({ activeItemId: itemId, activeSectionId: null }),

      reorderItems: (setlistId, items) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId ? { ...s, items } : s
          ),
        })),

      // Section actions
      setActiveSection: (sectionId) => set({ activeSectionId: sectionId }),

      addSection: (setlistId, itemId, section) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId
              ? {
                  ...s,
                  items: s.items.map((i) =>
                    i.id === itemId
                      ? { ...i, sections: [...i.sections, section] }
                      : i
                  ),
                }
              : s
          ),
        })),

      removeSection: (setlistId, itemId, sectionId) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId
              ? {
                  ...s,
                  items: s.items.map((i) =>
                    i.id === itemId
                      ? { ...i, sections: i.sections.filter((sec) => sec.id !== sectionId) }
                      : i
                  ),
                }
              : s
          ),
          activeSectionId: state.activeSectionId === sectionId ? null : state.activeSectionId,
        })),

      duplicateSection: (setlistId, itemId, sectionId) =>
        set((state) => {
          const newId = `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          return {
            setlists: state.setlists.map((s) =>
              s.id === setlistId
                ? {
                    ...s,
                    items: s.items.map((i) => {
                      if (i.id !== itemId) return i;
                      const idx = i.sections.findIndex((sec) => sec.id === sectionId);
                      if (idx < 0) return i;
                      const original = i.sections[idx];
                      const clone: Section = {
                        ...JSON.parse(JSON.stringify(original)),
                        id: newId,
                        label: original.label ? `${original.label} (복제)` : '(복제)',
                      };
                      // 요소 ID도 새로 부여
                      if (clone.elements) {
                        clone.elements = clone.elements.map((el: CanvasElement) => ({
                          ...el,
                          id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        }));
                      }
                      const newSections = [...i.sections];
                      newSections.splice(idx + 1, 0, clone);
                      return { ...i, sections: newSections };
                    }),
                  }
                : s
            ),
            activeSectionId: newId,
          };
        }),

      updateSection: (setlistId, itemId, sectionId, updates) =>
        set((state) => ({
          setlists: state.setlists.map((s) =>
            s.id === setlistId
              ? {
                  ...s,
                  items: s.items.map((i) =>
                    i.id === itemId
                      ? {
                          ...i,
                          sections: i.sections.map((sec) =>
                            sec.id === sectionId ? { ...sec, ...updates } : sec
                          ),
                        }
                      : i
                  ),
                }
              : s
          ),
        })),

      // Canvas element CRUD
      setSelectedElement: (elementId) => set({
        selectedElementId: elementId,
        selectedElementIds: elementId ? [elementId] : [],
      }),

      toggleSelectedElement: (elementId) => set((state) => {
        const ids = state.selectedElementIds;
        const next = ids.includes(elementId)
          ? ids.filter((id) => id !== elementId)
          : [...ids, elementId];
        return {
          selectedElementIds: next,
          selectedElementId: next.length > 0 ? next[next.length - 1] : null,
        };
      }),

      setSelectedElements: (elementIds) => set({
        selectedElementIds: elementIds,
        selectedElementId: elementIds.length > 0 ? elementIds[0] : null,
      }),

      addElement: (setlistId, itemId, sectionId, element) =>
        set((state) => ({
          setlists: state.setlists.map((sl) =>
            sl.id !== setlistId ? sl : {
              ...sl,
              items: sl.items.map((it) =>
                it.id !== itemId ? it : {
                  ...it,
                  sections: it.sections.map((sec) =>
                    sec.id !== sectionId ? sec : {
                      ...sec,
                      elements: [
                        ...(sec.elements ?? []),
                        isLayerOutputWorkspaceSection(sec)
                          ? {
                              ...element,
                              fixedLayer: true,
                              layerRole: element.layerRole ?? getDefaultLayerRoleForElement(element),
                            } as CanvasElement
                          : element,
                      ],
                    }
                  ),
                }
              ),
            }
          ),
        })),

      updateElement: (setlistId, itemId, sectionId, elementId, updates) =>
        set((state) => ({
          setlists: state.setlists.map((sl) =>
            sl.id !== setlistId ? sl : {
              ...sl,
              items: sl.items.map((it) =>
                it.id !== itemId ? it : {
                  ...it,
                  sections: it.sections.map((sec) =>
                    sec.id !== sectionId ? sec : {
                      ...sec,
                      elements: (sec.elements ?? []).map((el) =>
                        el.id !== elementId ? el : { ...el, ...updates } as CanvasElement
                      ),
                    }
                  ),
                }
              ),
            }
          ),
        })),

      removeElement: (setlistId, itemId, sectionId, elementId) =>
        set((state) => ({
          setlists: state.setlists.map((sl) =>
            sl.id !== setlistId ? sl : {
              ...sl,
              items: sl.items.map((it) =>
                it.id !== itemId ? it : {
                  ...it,
                  sections: it.sections.map((sec) =>
                    sec.id !== sectionId ? sec : {
                      ...sec,
                      elements: (sec.elements ?? []).filter((el) => el.id !== elementId),
                    }
                  ),
                }
              ),
            }
          ),
          selectedElementId:
            state.selectedElementId === elementId ? null : state.selectedElementId,
          selectedElementIds:
            state.selectedElementIds.filter((id) => id !== elementId),
        })),

      reorderElements: (setlistId, itemId, sectionId, elements) =>
        set((state) => ({
          setlists: state.setlists.map((sl) =>
            sl.id !== setlistId ? sl : {
              ...sl,
              items: sl.items.map((it) =>
                it.id !== itemId ? it : {
                  ...it,
                  sections: it.sections.map((sec) =>
                    sec.id !== sectionId ? sec : { ...sec, elements }
                  ),
                }
              ),
            }
          ),
        })),

      // Output control
      setBlackout: (active) => set({ isBlackout: active }),
      setOutputConnected: (connected) => set({ isOutputConnected: connected }),
      setGlobalStyle: (style) =>
        set((state) => ({ globalStyle: { ...state.globalStyle, ...style } })),

      // ATEM 연동 설정
      setAtemSettings: (settings) =>
        set((state) => ({ atemSettings: { ...state.atemSettings, ...settings } })),

      // 모션 모드
      setMotionMode: (active) => set({ isMotionMode: active }),

      // 지우개 모드
      setEraserMode: (active) => set({ isEraserMode: active, isSelectionMode: false }),
      setEraserBrushSize: (size) => set({ eraserBrushSize: size }),
      setEraserHardness: (hardness) => set({ eraserHardness: hardness }),

      // 선택 도구 모드
      setSelectionMode: (active) => set({ isSelectionMode: active, isEraserMode: false }),
      setSelectionClipboard: (dataUrl) => set({ selectionClipboard: dataUrl }),

      // [FEATURE: YT_STANDBY]
      setYouTubeStandby: (value) => set({ youtubeStandby: value }),
      setBroadcastSection: (value) => set({ broadcastSection: value }),
      setBroadcastGridOpen: (open) => set({ broadcastGridOpen: open }),
      setReferenceItemId: (id) => set({ referenceItemId: id }),

      // hydration 완료 플래그 — persist 미들웨어가 IndexedDB에서 데이터를 복원한 뒤 true
      _hydrated: false,
      _setHydrated: (v: boolean) => set({ _hydrated: v }),

      // [FEATURE: SECTION_TRANSITION] 섹션 송출 시 전환 효과 설정
      sectionTransition: { type: 'cut', duration: 500 },
      setSectionTransition: (patch) =>
        set((state) => {
          const next: SectionTransitionConfig = {
            ...state.sectionTransition,
            ...patch,
            duration: (patch.type ?? state.sectionTransition.type) === 'cut'
              ? 0
              : (patch.duration ?? state.sectionTransition.duration),
          };
          return { sectionTransition: next };
        }),
    }),
    {
      name: 'unoLive-store',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? idbStorage : noopStorage
      ),

      onRehydrateStorage: () => () => {
        // IndexedDB 에서 데이터 복원 완료 후 호출
        useStore.getState()._setHydrated(true);
      },

      partialize: (state) => ({
        setlists: state.setlists,
        globalStyle: state.globalStyle,
        currentSetlistId: state.currentSetlistId,
        atemSettings: state.atemSettings,
        sectionTransition: state.sectionTransition,
        // [FEATURE: LIVE_STATE_PERSIST] 리로드 후 선택 위치·블랙아웃 복원
        // (broadcastSection은 저장하지 않음 — 복원값이 하이드레이션 시 "새 송출"로 오인되어
        //  카메라 자동 전환 등 부수효과를 일으킨 사고 이력. LIVE 표시는 다음 송출부터 갱신)
        activeItemId: state.activeItemId,
        activeSectionId: state.activeSectionId,
        isBlackout: state.isBlackout,
      }),

      // 저장된 데이터에 새 필드가 없을 때 DEFAULT 값으로 채워줌
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<typeof current>;

        // elements 내 각 요소에 gradient 필드 보장
        const fixElements = (elements: CanvasElement[]): CanvasElement[] =>
          (elements ?? []).map((el) => {
            const base = {
              ...el,
              layerRole: el.layerRole ?? getDefaultLayerRoleForElement(el),
              fixedLayer: el.fixedLayer ?? false,
              visibleOn: el.visibleOn && el.visibleOn.length > 0
                ? el.visibleOn
                : [...DEFAULT_RENDER_TARGETS],
            };
            if (el.type === 'text') {
              const typed = el as typeof el & {
                useGradient?: boolean; gradient?: GradientConfig;
                autoWidth?: boolean; autoHeight?: boolean;
              };
              return {
                ...base,
                useGradient: typed.useGradient ?? false,
                gradient: typed.gradient ?? { ...DEFAULT_GRADIENT },
                autoWidth: typed.autoWidth ?? true,
                autoHeight: typed.autoHeight ?? true,
              } as CanvasElement;
            }
            if (el.type === 'shape') {
              const typed = el as typeof el & { useGradient?: boolean; gradient?: GradientConfig };
              return {
                ...base,
                useGradient: typed.useGradient ?? false,
                gradient: typed.gradient ?? { ...DEFAULT_GRADIENT },
              } as CanvasElement;
            }
            return base as CanvasElement;
          });

        const fixedSetlists = (p.setlists ?? []).map((sl) => ({
          ...sl,
          items: sl.items.map((it) => ({
            ...it,
            sections: it.sections.map((sec) => ({
              ...sec,
              elements: fixElements(sec.elements ?? []),
            })),
          })),
        }));

        return {
          ...current,
          ...p,
          setlists: fixedSetlists,
          globalStyle: {
            ...DEFAULT_SUBTITLE_STYLE,
            ...(p.globalStyle ?? {}),
          },
          atemSettings: {
            ...DEFAULT_ATEM_SETTINGS,
            ...(p.atemSettings ?? {}),
          },
        };
      },
    }
  )
);
