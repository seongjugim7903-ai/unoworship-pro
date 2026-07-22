import type { Section, SetlistItem } from './types';

export const LAYER_OUTPUT_WORKSPACE_ROLE = 'layer-output-editor';
export const LAYER_OUTPUT_WORKSPACE_ITEM_ID = '__unolive_layer_output_workspace_item__';
export const LAYER_OUTPUT_WORKSPACE_SECTION_ID = '__unolive_layer_output_workspace_section__';

export function isLayerOutputWorkspaceItem(item: Pick<SetlistItem, 'workspaceRole' | 'id'>): boolean {
  return item.workspaceRole === LAYER_OUTPUT_WORKSPACE_ROLE || item.id === LAYER_OUTPUT_WORKSPACE_ITEM_ID;
}

export function isLayerOutputWorkspaceSection(section: Pick<Section, 'workspaceRole' | 'id'>): boolean {
  return section.workspaceRole === LAYER_OUTPUT_WORKSPACE_ROLE || section.id === LAYER_OUTPUT_WORKSPACE_SECTION_ID;
}

export function createLayerOutputWorkspaceItem(): SetlistItem {
  return {
    id: LAYER_OUTPUT_WORKSPACE_ITEM_ID,
    title: '전역 레이어 · 분리출력',
    workspaceRole: LAYER_OUTPUT_WORKSPACE_ROLE,
    sections: [createLayerOutputWorkspaceSection()],
  };
}

export function createLayerOutputWorkspaceSection(): Section {
  return {
    id: LAYER_OUTPUT_WORKSPACE_SECTION_ID,
    label: '전역 레이어 · 분리출력',
    text: '',
    colorMark: '#38bdf8',
    elements: [],
    workspaceRole: LAYER_OUTPUT_WORKSPACE_ROLE,
  };
}
