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
export function downloadJSONFile(filename: string, content: string): void {
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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
