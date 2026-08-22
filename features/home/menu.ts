// 어떤 화면이 있고, 그것을 볼 자격이 무엇인지 — 한 곳에만 적어 둔다.
//
// 홈(TeamHomePanel)과 화면 전환기(app/WorkspaceTabs.tsx)가 같은 목록을 봐야 한다.
// 두 곳에 나눠 적으면 기능을 하나 늘릴 때 한쪽만 고쳐 놓고 잊는다.
//
// can 의 어느 값을 보는지까지 여기 적는다 — 권한이 없는 기능은 버튼조차 안 보인다.
// 초대받은 팀 말고는 들어갈 자리가 없어야 한다는 뜻이다(features/membership 참조).

export type FeatureId = 'choir' | 'sermon' | 'worship' | 'broadcast' | 'prep';

/* 팀 페이지는 홈 하나와 그 아래 서브페이지들이다. 게시판·내 정보도 새 창이 아니라
   같은 구조 안의 한 자리다 — 머리(팀 이름·내 이름·삼선)는 어느 자리에서도 그대로 있다. */
export type View = 'home' | 'board' | 'profile' | FeatureId;

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

/* 이름은 '무엇을 하러 가는가'로 적는다 — 화면 이름이 아니라 하는 일이다.
   찬양대(헵시바)는 두 가지를 한다. 가사로 자막 이미지를 만드는 일과, 반주자를 위해
   악보를 올리는 일이다. 둘 다 '찬양 올리기'로 적으면 어느 쪽인지 알 수 없어 나눠 적는다. */
export const MENU: MenuItem[] = [
  { id: 'worship', label: '찬양 올리기', desc: '곡 · 악보 올리기 (반주자가 봅니다)', can: 'worship' },
  { id: 'choir', label: '자막 만들기', desc: '가사 넣고 자막 이미지 만들기', can: 'choir' },
  { id: 'sermon', label: '설교대지 올리기', desc: '설교 대지 · 주보 정리', can: 'sermon' },
  { id: 'broadcast', label: '방송실', desc: '모든 팀 자료 · 예배 운영', can: 'broadcast' },
  { id: 'prep', label: '예배준비', desc: '새신자 · 준비 항목 챙기기', can: 'prep' },
];

/** 서브페이지 이름표 — 홈의 큰 버튼과 달리 '지금 어디인지'를 말한다 */
export const VIEW_TITLE: Record<Exclude<View, 'home'>, string> = {
  choir: '자막 만들기',
  sermon: '설교대지',
  worship: '찬양 올리기',
  broadcast: '방송실',
  prep: '예배준비',
  board: '게시판',
  profile: '내 정보',
};

export const NO_ACCESS: Can = {
  sermon: false, worship: false, choir: false, broadcast: false, prep: false, board: false,
};

export const ALL_ACCESS: Can = {
  sermon: true, worship: true, choir: true, broadcast: true, prep: true, board: true,
};

/** 지금 로그인한 사람 — 화면 여러 곳이 같은 것을 묻는다. 한 번만 부르고 나눠 쓴다. */
export interface Me {
  name: string;
  churchRole: string | null;
  /** 팀 이름 → leader | member */
  teams: Record<string, string>;
  /** 팀 이름 → 준비찬양 | 찬양대 … */
  teamCategories: Record<string, string>;
  can: Can;
}

const UNKNOWN: Me = { name: '', churchRole: null, teams: {}, teamCategories: {}, can: NO_ACCESS };

/**
 * /api/membership/me 한 번 부르기.
 *
 * 저장 환경이 없는 배포나 조회 실패에서는 막지 않는다 — 화면이 통째로 비면
 * 손쓸 방법이 없다. 무엇을 할 수 있는지는 어차피 서버가 다시 본다.
 */
export async function loadMe(): Promise<Me> {
  try {
    const me = await (await fetch('/api/membership/me')).json();
    if (me?.unavailable) return { ...UNKNOWN, can: ALL_ACCESS };
    return {
      name: String(me?.name ?? '').trim(),
      churchRole: me?.churchRole ?? null,
      teams: (me?.teams ?? {}) as Record<string, string>,
      teamCategories: (me?.teamCategories ?? {}) as Record<string, string>,
      can: { ...NO_ACCESS, ...(me?.can ?? {}) },
    };
  } catch {
    return { ...UNKNOWN, can: ALL_ACCESS };
  }
}
