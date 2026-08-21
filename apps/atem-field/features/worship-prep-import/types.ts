// unoworship-pro 준비찬양 화면이 저장한 데이터의 형태.
// 저쪽 app/api/worship-prep/route.ts 의 SELECT_COLUMNS 와 같은 모양이어야 한다.

/** 악보 한 장 — 반주자 아이패드용이다. 송출에는 쓰지 않는다 */
export interface CloudSheetPage {
  path: string;
  contentType: string;
  w?: number;
  h?: number;
  crop?: { l: number; t: number; r: number; b: number };
}

export interface CloudPrepSong {
  id: string;
  created_at: string;
  service_date: string | null;
  service_type: string;
  team: string;
  song_order: number;
  title: string;
  /** 악보에 적힌 조 */
  song_key: string;
  /** 실제로 부르는 조 */
  sung_key: string;
  tempo_bpm: number | null;
  time_signature: string;
  arrangement: string;
  arrangement_custom: string;
  sheet_path: string | null;
  sheet_pages?: CloudSheetPage[];
}

/** 한 예배·한 팀의 준비찬양 셋 — 컴포저 목록에 이 단위로 뜬다 */
export interface WorshipPrepSet {
  serviceDate: string;
  serviceType: string;
  team: string;
  songs: CloudPrepSong[];
}
