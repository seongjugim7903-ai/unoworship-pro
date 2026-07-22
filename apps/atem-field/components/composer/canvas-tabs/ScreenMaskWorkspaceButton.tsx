'use client';

import { ScanLine } from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  createLayerOutputWorkspaceItem,
  createLayerOutputWorkspaceSection,
  isLayerOutputWorkspaceItem,
  LAYER_OUTPUT_WORKSPACE_ITEM_ID,
  LAYER_OUTPUT_WORKSPACE_SECTION_ID,
} from '@/lib/layerOutputWorkspace';
import { createSafeAreaScreenMaskElements, isSafeAreaScreenMaskElement } from '@/lib/screenMasks';

export default function ScreenMaskWorkspaceButton() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    addItem,
    addSection,
    addElement,
    removeElement,
    setActiveItem,
    setActiveSection,
    setSelectedElement,
  } = useStore();

  const currentSetlist = setlists.find((setlist) => setlist.id === currentSetlistId);
  const workspaceItem = currentSetlist?.items.find(isLayerOutputWorkspaceItem);
  const workspaceSection = workspaceItem?.sections.find(
    (section) => section.id === LAYER_OUTPUT_WORKSPACE_SECTION_ID
  );
  const isActive =
    activeItemId === LAYER_OUTPUT_WORKSPACE_ITEM_ID &&
    activeSectionId === LAYER_OUTPUT_WORKSPACE_SECTION_ID;

  const addScreenMask = () => {
    if (!currentSetlistId) return;

    const workspaceItemId = workspaceItem?.id ?? LAYER_OUTPUT_WORKSPACE_ITEM_ID;
    const workspaceSectionId = workspaceSection?.id ?? LAYER_OUTPUT_WORKSPACE_SECTION_ID;

    if (!workspaceItem) {
      addItem(currentSetlistId, createLayerOutputWorkspaceItem());
    } else if (!workspaceSection) {
      addSection(currentSetlistId, workspaceItem.id, createLayerOutputWorkspaceSection());
    }

    const existingElements = workspaceSection?.elements ?? [];
    const oldMaskIds = existingElements.filter(isSafeAreaScreenMaskElement).map((el) => el.id);
    const remainingElementCount = existingElements.length - oldMaskIds.length;

    for (const id of oldMaskIds) {
      removeElement(currentSetlistId, workspaceItemId, workspaceSectionId, id);
    }

    const maskBars = createSafeAreaScreenMaskElements(remainingElementCount);
    for (const el of maskBars) {
      addElement(currentSetlistId, workspaceItemId, workspaceSectionId, el);
    }

    setActiveItem(workspaceItemId);
    setActiveSection(workspaceSectionId);
    setSelectedElement(null);
  };

  return (
    <button
      type="button"
      onClick={addScreenMask}
      disabled={!currentSetlistId}
      title="스크린 마스크 추가 후 전역 레이어 에디터 열기"
      className={`flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
        isActive
          ? 'border-amber-500 bg-amber-500/15 text-amber-200'
          : 'border-[#333] bg-[#1a1a1a] text-gray-400 hover:border-amber-500/60 hover:bg-[#252525] hover:text-amber-100'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <ScanLine size={14} />
      <span>마스크</span>
    </button>
  );
}
