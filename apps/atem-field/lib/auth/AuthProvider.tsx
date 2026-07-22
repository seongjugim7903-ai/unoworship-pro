'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient, onAuthStateChange } from '@/lib/supabase/browser';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { AuthContextState, UserProfile, UserRole } from './types';
import { ROLE_LEVEL } from './types';

// ─── 기본값 ───
const DEFAULT_PROFILE: UserProfile = {
  role: 'member',
  profile_completed: false,
};

const DEFAULT_STATE: AuthContextState = {
  user: null,
  profile: DEFAULT_PROFILE,
  role: 'member',
  isAuthenticated: false,
  isProfileCompleted: false,
  isLoading: true,
  hasAccess: () => false,
};

const AuthContext = createContext<AuthContextState>(DEFAULT_STATE);

function isFieldBroadcastNoLoginPath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/media/broadcast' ||
    window.location.pathname.startsWith('/media/broadcast/');
}

// ─── user_metadata → UserProfile 변환 ───
function extractProfile(user: User | null): UserProfile {
  if (!user) return DEFAULT_PROFILE;
  const m = user.user_metadata ?? {};
  return {
    full_name: m.full_name,
    phone: m.phone,
    role: (m.role as UserRole) ?? 'member',
    profile_completed: !!m.profile_completed,
  };
}

// ─── Provider ───
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  const setAuthMode = useMediaStore((s) => s.setAuthMode);
  const loadChurchFromDB = useMediaStore((s) => s.loadChurchFromDB);

  // Supabase role → MOCK member 매핑.
  //   mediaStore 의 currentMemberId 를 세팅해 canControlBroadcast() 등
  //   권한 체크 함수가 올바르게 동작하도록 한다.
  //
  //   ⚠️ 주의:
  //     - role=null 일 때 logout 호출 금지 (Supabase signOut → authStateChange → 무한 루프)
  //     - 토큰 refresh 등으로 onAuthStateChange 가 여러 번 발화해도 currentMemberId 가
  //       이미 동일한 값이면 아무것도 하지 않음 (re-render 로 WebRTC 재협상 방지)
  const syncMediaSession = (role: UserRole | null | undefined) => {
    const store = useMediaStore.getState();

    if (!role) {
      // 로그아웃 시 member id 만 조용히 정리 (signOut 재호출하지 않음)
      if (store.currentMemberId !== null) {
        useMediaStore.setState({ currentMemberId: null });
      }
      return;
    }

    const desiredId =
      role === 'admin' || role === 'superadmin' ? 'mem-1' :
      role === 'crew' ? 'mem-3' : 'mem-4';

    // 이미 올바른 멤버로 세팅되어 있으면 스킵 (re-render 방지)
    if (store.currentMemberId === desiredId) return;

    store.loginAsMember(desiredId);
  };

  useEffect(() => {
    let mounted = true;

    // [ATEM FIELD MODE]
    // Windows PC 에서 /media/broadcast 녹화/라이브 관제 페이지를 로그인 없이
    // 열어야 하는 현장 테스트 모드. 이 경로에서는 Supabase auth.getUser() 를
    // 호출하지 않고 즉시 관리자 컨텍스트를 부여한다.
    if (isFieldBroadcastNoLoginPath()) {
      setUser(null);
      setProfile({
        full_name: '현장 방송실',
        role: 'admin',
        profile_completed: true,
      });
      setIsLoading(false);
      setAuthMode('operator');
      syncMediaSession('admin');
      return () => {
        mounted = false;
      };
    }

    const supabase = createClient();

    // Supabase 미설정(오프라인/현장 단독 설치) — 게스트 모드로 즉시 부팅
    if (!supabase) {
      setUser(null);
      setProfile(DEFAULT_PROFILE);
      setIsLoading(false);
      setAuthMode('guest');
      syncMediaSession(null);
      return () => {
        mounted = false;
      };
    }

    // 초기 로드
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!mounted) return;
      setUser(u);
      const p = extractProfile(u);
      setProfile(p);
      setIsLoading(false);

      // Zustand authMode + currentMemberId 동기화
      if (!u) {
        setAuthMode('guest');
        syncMediaSession(null);
      } else if (p.role === 'admin' || p.role === 'superadmin') {
        setAuthMode('operator');
        syncMediaSession(p.role);
      } else {
        setAuthMode('member');
        syncMediaSession(p.role);
      }

      // 인증된 사용자면 DB에서 교회 정보 로드
      if (u) {
        loadChurchFromDB();
      }
    });

    // 상태 변화 구독
    const unsubscribe = onAuthStateChange((event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      const p = extractProfile(u);
      setProfile(p);
      setIsLoading(false);

      if (!u) {
        setAuthMode('guest');
        syncMediaSession(null);
      } else if (p.role === 'admin' || p.role === 'superadmin') {
        setAuthMode('operator');
        syncMediaSession(p.role);
      } else {
        setAuthMode('member');
        syncMediaSession(p.role);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAuthMode]);

  const role: UserRole = profile.role ?? 'member';

  const hasAccess = (requiredRole: UserRole): boolean => {
    return ROLE_LEVEL[role] >= ROLE_LEVEL[requiredRole];
  };

  const value: AuthContextState = {
    user,
    profile,
    role,
    isAuthenticated: !!user,
    isProfileCompleted: !!profile.profile_completed,
    isLoading,
    hasAccess,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───
export function useAuthContext(): AuthContextState {
  return useContext(AuthContext);
}
