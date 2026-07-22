'use client';

import { Layers } from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  createLayerOutputWorkspaceItem,
  createLayerOutputWorkspaceSection,
  isLayerOutputWorkspaceItem,
  LAYER_OUTPUT_WORKSPACE_ITEM_ID,
  LAYER_OUTPUT_WORKSPACE_SECTION_ID,
} from '@/lib/layerOutputWorkspace';

export default function LayerOutputWorkspaceButton() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    addItem,
    addSection,
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

  const openWorkspace = () => {
    if (!currentSetlistId) return;

    if (!workspaceItem) {
      addItem(currentSetlistId, createLayerOutputWorkspaceItem());
    } else if (!workspaceSection) {
      addSection(currentSetlistId, workspaceItem.id, createLayerOutputWorkspaceSection());
    }

    setSelectedElement(null);
    setActiveItem(workspaceItem?.id ?? LAYER_OUTPUT_WORKSPACE_ITEM_ID);
    setActiveSection(workspaceSection?.id ?? LAYER_OUTPUT_WORKSPACE_SECTION_ID);
  };

  return (
    <button
      type="button"
      onClick={openWorkspace}
      disabled={!currentSetlistId}
      title="전역 레이어 · 분리출력 전용 에디터"
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
        isActive
          ? 'border-sky-500 bg-sky-500/20 text-sky-200'
          : 'border-[#333] bg-[#1a1a1a] text-gray-400 hover:border-[#444] hover:bg-[#252525] hover:text-gray-200'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <Layers size={15} />
    </button>
  );
}
