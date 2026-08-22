// 어떤 화면이 있고, 그것을 볼 자격이 무엇인지 — 한 곳에만 적어 둔다.
//
// 홈(TeamHomePanel)과 화면 전환기(app/WorkspaceTabs.tsx)가 같은 목록을 봐야 한다.
// 두 곳에 나눠 적으면 기능을 하나 늘릴 때 한쪽만 고쳐 놓고 잊는다.
//
// can 의 어느 값을 보는지까지 여기 적는다 — 권한이 없는 기능은 버튼조차 안 보인다.
// 초대받은 팀 말고는 들어갈 자리가 없어야 한다는 뜻이다(features/membership 참조).

export type FeatureId = 'choir' | 'sermon' | 'worship' | 'broadcast' | 'prep';

export interface Can {
  sermon: boolean;
  worship: boolean;
  choir: boolean;
  broadcast: boolean;
  prep: boolean;
  board: boolean;
}

export interface MenuItem {
  id: FeatureId;
  /** 홈의 큰 버튼에 쓰는 말 — 여는 것이 아니라 하는 일로 적는다 */
  label: string;
  desc: string;
  can: keyof Can;
}

export const MENU: MenuItem[] = [
  { id: 'choir', label: '자막 올리기', desc: '찬양대 가사 · 자막 이미지 만들기', can: 'choir' },
  { id: 'sermon', label: '설교대지', desc: '설교 대지 · 주보 정리', can: 'sermon' },
  { id: 'worship', label: '준비찬양', desc: '팀별 찬양 준비 · 악보', can: 'worship' },
  { id: 'broadcast', label: '방송실', desc: '모든 팀 자료 · 예배 운영', can: 'broadcast' },
  { id: 'prep', label: '예배준비', desc: '새신자 · 준비 항목 챙기기', can: 'prep' },
];

/** 화면 위쪽에 다는 이름 — 홈의 큰 버튼과 달리 '어디에 있는지'를 말한다 */
export const FEATURE_TITLE: Record<FeatureId, string> = {
  choir: '헵시바 선교단',
  sermon: '설교대지',
  worship: '준비찬양',
  broadcast: '방송실',
  prep: '예배준비',
};

export const NO_ACCESS: Can = {
  sermon: false, worship: false, choir: false, broadcast: false, prep: false, board: false,
};

export const ALL_ACCESS: Can = {
  sermon: true, worship: true, choir: true, broadcast: true, prep: true, board: true,
};
