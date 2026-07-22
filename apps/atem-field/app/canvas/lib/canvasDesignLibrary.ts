import type { CanvasProject } from './canvasStore';
import { getCanvasPurpose } from './canvasPurpose';

const STORAGE_KEY = 'unoCanvas-design-library-v1';

export type SavedCanvasDesign = {
  id: string;
  name: string;
  purposeId?: string;
  purposeLabel?: string;
  purposeGroup?: string;
  purposeSizeLabel?: string;
  project: CanvasProject;
  createdAt: number;
  updatedAt: number;
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeProject(project: CanvasProject): CanvasProject {
  const purpose = getCanvasPurpose(project.purposeId);
  return {
    ...project,
    purposeId: purpose?.id ?? project.purposeId,
    purposeLabel: purpose?.label ?? project.purposeLabel,
    purposeGroup: purpose?.group ?? project.purposeGroup,
    purposeSizeLabel: purpose?.sizeLabel ?? project.purposeSizeLabel,
    updatedAt: Date.now(),
  };
}

function readLibrary(): SavedCanvasDesign[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedCanvasDesign =>
      Boolean(item && typeof item.id === 'string' && item.project)
    );
  } catch {
    return [];
  }
}

function writeLibrary(items: SavedCanvasDesign[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listSavedCanvasDesigns(): SavedCanvasDesign[] {
  return readLibrary().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSavedCanvasDesign(id: string): SavedCanvasDesign | null {
  return readLibrary().find((item) => item.id === id) ?? null;
}

export function saveCanvasDesign(project: CanvasProject): SavedCanvasDesign {
  const items = readLibrary();
  const existing = items.find((item) => item.id === project.id);
  const normalizedProject = normalizeProject(project);
  const saved: SavedCanvasDesign = {
    id: normalizedProject.id,
    name: normalizedProject.name,
    purposeId: normalizedProject.purposeId,
    purposeLabel: normalizedProject.purposeLabel,
    purposeGroup: normalizedProject.purposeGroup,
    purposeSizeLabel: normalizedProject.purposeSizeLabel,
    project: normalizedProject,
    createdAt: existing?.createdAt ?? normalizedProject.createdAt,
    updatedAt: normalizedProject.updatedAt,
  };

  const nextItems = [saved, ...items.filter((item) => item.id !== saved.id)];
  writeLibrary(nextItems);
  return saved;
}
