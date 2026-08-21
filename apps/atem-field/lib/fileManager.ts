import { Setlist } from './types';

/**
 * 워십을 JSON 문자열로 직렬화
 */
export function exportSetlistToJSON(setlist: Setlist): string {
  return JSON.stringify(setlist, null, 2);
}

/**
 * JSON 문자열을 Setlist로 역직렬화
 * 최소 유효성 검사 포함 (id, name, items 필드 존재 여부)
 */
export function importSetlistFromJSON(json: string): Setlist | null {
  try {
    const data = JSON.parse(json);
    if (!data.id || !data.name || !Array.isArray(data.items)) return null;
    return data as Setlist;
  } catch {
    return null;
  }
}

/**
 * JSON 문자열을 파일로 브라우저 다운로드
 */
/** 파일 저장 위치 선택 대화상자 지원 여부 (Chrome/Edge 계열) */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

/** 기존 방식 — 브라우저 기본 다운로드 폴더로 내려받기 */
function downloadViaAnchor(name: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * JSON 파일 저장.
 *   저장 위치 선택 대화상자를 지원하면 폴더를 직접 골라 저장하고,
 *   미지원 브라우저이거나 실패하면 기존처럼 다운로드 폴더로 내려받는다.
 *   (사용자가 대화상자를 취소하면 아무것도 저장하지 않는다)
 */
export function downloadJSONFile(filename: string, content: string): void {
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;

  if (typeof picker !== 'function') {
    downloadViaAnchor(name, content);
    return;
  }

  void (async () => {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: 'UnoLive 프로그램(JSON)', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      // 사용자가 취소하면 저장하지 않는다. 그 외 오류만 기존 다운로드로 대체.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      downloadViaAnchor(name, content);
    }
  })();
}

/**
 * File 객체를 문자열로 읽어 반환 (Promise)
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  });
}

/**
 * 새 Setlist 객체 생성 (빈 상태)
 */
export function createNewSetlist(name: string): Setlist {
  return {
    id: `setlist-${Date.now()}`,
    name,
    date: new Date().toISOString().split('T')[0],
    items: [],
    createdAt: Date.now(),
  };
}
