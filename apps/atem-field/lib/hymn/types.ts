/**
 * lib/hymn/types.ts
 * 찬송가 인덱스 타입 — 번호 + 제목만.
 * 가사는 저작권 이슈로 포함하지 않음 (한국찬송가공회).
 */

export type HymnVersionId = 'new' | 'old';

export interface HymnVersionInfo {
  id:         HymnVersionId;
  name:       string;       // '21세기 찬송가 (새찬송가)'
  totalCount: number;       // 645 / 558
}

export interface HymnEntry {
  num:   number;
  title: string;
}

export interface HymnIndex {
  version:     HymnVersionInfo;
  attribution: string;       // '찬송가 목록 출처: 위키백과 (CC BY-SA 4.0)'
  license:     string;
  source:      string;
  note:        string;
  hymns:       HymnEntry[];
}
