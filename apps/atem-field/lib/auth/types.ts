import type { User } from '@supabase/supabase-js';

/**
 * UnoMedia 사용자 등급
 *
 * member       — 회원 (기본, 읽기 위주)
 * crew         — 대원 (미디어부 활동 멤버)
 * admin        — 관리자 (설정 변경 가능)
 * superadmin   — 슈퍼관리자 (전체 권한)
 */
export type UserRole = 'member' | 'crew' | 'admin' | 'superadmin';

/** 등급별 권한 레벨 (숫자가 높을수록 상위) */
export const ROLE_LEVEL: Record<UserRole, number> = {
  member: 0,
  crew: 1,
  admin: 2,
  superadmin: 3,
};

/** 등급 라벨 */
export const ROLE_LABEL: Record<UserRole, string> = {
  member: '회원',
  crew: '대원',
  admin: '관리자',
  superadmin: '슈퍼관리자',
};

/** 사용자 프로필 (user_metadata에 저장) */
export interface UserProfile {
  full_name?: string;
  phone?: string;
  role?: UserRole;
  profile_completed?: boolean;
}

/** 전역 인증 상태 */
export interface AuthContextState {
  user: User | null;
  profile: UserProfile;
  role: UserRole;
  isAuthenticated: boolean;
  isProfileCompleted: boolean;
  isLoading: boolean;
  /** 현재 사용자의 역할이 요구 역할 이상인지 확인 */
  hasAccess: (requiredRole: UserRole) => boolean;
}
