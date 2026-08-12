'use client';

// 로그인 상태 표시와 진입점.
//
// 홈은 로그인 없이 열린다(읽기는 막지 않기로 했다). 그래서 로그인으로 가는 입구가
// 화면에 없으면 아무도 로그인할 방법이 없다 — 이 배지가 그 자리다.
//
// 로그인한 사람에게는 이름을 보여 준다. 카톡 닉네임이 아니라 참여할 때 적은
// '교회에서 부르는 이름'이다(profiles.full_name).

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/authn/supabaseBrowser';

export default function AuthBadge() {
  const [name, setName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      /* 로그인 환경이 없는 배포에서는 배지를 아예 그리지 않는다 */
      setReady(false);
      return;
    }
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.user.id)
          .maybeSingle();
        const nickname = (data.user.user_metadata?.name ?? '') as string;
        setName(profile?.full_name || nickname || '참여자');
        /* 관리자에게만 코드 발급 화면을 보여 준다 */
        try {
          const me = await (await fetch('/api/membership/me')).json();
          setIsAdmin(me?.churchRole === 'admin');
          setIsLeader(Object.values((me?.teams ?? {}) as Record<string, string>).includes('leader'));
        } catch { /* 확인 실패는 무시 — 링크만 안 보일 뿐이다 */ }
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  if (!name) {
    return <a className="auth-badge auth-badge-in" href="/login">로그인</a>;
  }

  return (
    <span className="auth-badge">
      {isAdmin && <a className="auth-badge-admin" href="/admin">코드 관리</a>}
      {isLeader && <a className="auth-badge-admin" href="/my">팀원 초대</a>}
      {name}
      <button
        type="button"
        className="auth-badge-out"
        onClick={async () => {
          await createClient()?.auth.signOut();
          window.location.reload();
        }}
      >
        로그아웃
      </button>
    </span>
  );
}
