'use client';

// 초대 링크로 들어오는 자리 — /join/<코드>
//
// 팀원에게 코드를 받아 적게 하지 않는다. 카톡방 링크처럼 눌러서 들어오면 된다.
// 코드는 주소에 들어 있고, 로그인만 하면 그 팀까지 자동으로 배정된다.
//
//   로그인 안 됨      → 카카오 로그인 (돌아올 곳은 이 링크)
//   이름이 없음        → 이름만 한 번 묻는다
//   이름이 있음        → 바로 참여시키고 홈으로
//
// 담당자 코드도 같은 링크로 동작한다 — 서버가 코드를 보고 담당자인지 팀원인지 정한다.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/authn/supabaseBrowser';

type Status = 'checking' | 'need-login' | 'need-name' | 'joining' | 'done' | 'error';

export default function InvitePanel({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>('checking');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ team: string | null; teamRole: string | null } | null>(null);

  const join = useCallback(async (fullName: string) => {
    setStatus('joining');
    try {
      const response = await fetch('/api/membership/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: fullName }),
      });
      const json = await response.json() as { ok?: boolean; message?: string; team?: string | null; teamRole?: string | null };
      if (!response.ok || !json.ok) {
        /* 이미 들어와 있는 경우도 여기로 온다 — 실패가 아니라 '이미 됨'이다 */
        setError(json.message ?? '참여하지 못했습니다.');
        setStatus('error');
        return;
      }
      /* 담당자는 할 일이 남아 있다(앱 설치·팀원 초대). 안내 화면을 거치지 않고 바로 보낸다 */
      if (json.teamRole === 'leader') { window.location.replace('/my'); return; }
      setResult({ team: json.team ?? null, teamRole: json.teamRole ?? null });
      setStatus('done');
    } catch {
      setError('참여 처리 중 오류가 발생했습니다.');
      setStatus('error');
    }
  }, [code]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        setError('로그인 환경이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
        setStatus('error');
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setStatus('need-login'); return; }

      /* 이름은 관리자 화면에서 사람을 알아보는 유일한 단서다. 없으면 한 번 묻는다 */
      let known = '';
      try {
        const me = await (await fetch('/api/membership/me')).json();
        known = (me?.name ?? '').trim();
      } catch { /* 확인 실패는 이름 없는 것으로 본다 */ }

      if (known) { void join(known); return; }
      setName((data.user.user_metadata?.name ?? '') as string);
      setStatus('need-name');
    })();
  }, [join]);

  const kakao = async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/join/${encodeURIComponent(code)}` },
    });
    if (oauthError) setError(`카카오 로그인을 시작하지 못했습니다. ${oauthError.message}`);
  };

  if (status === 'checking' || status === 'joining') {
    return <main className="site-shell"><section className="panel"><p className="field-hint">참여하는 중...</p></section></main>;
  }

  if (status === 'need-login') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>초대받으셨습니다</h2>
          <p className="field-hint">
            카카오로 로그인하시면 바로 팀에 들어갑니다. 코드를 따로 적으실 필요는 없습니다.
          </p>
          {error && <p className="error-message">{error}</p>}
          <button type="button" className="kakao-button" onClick={kakao}>카카오로 로그인</button>
          {/* 카톡을 안 쓰는 분과 테스트 계정을 위한 통로 — 돌아올 곳은 이 링크다 */}
          <p className="field-hint" style={{ marginTop: 14 }}>
            카카오를 쓰지 않으시면{' '}
            <Link className="text-button" href={`/login?redirectTo=/join/${encodeURIComponent(code)}`}>
              이메일로 로그인
            </Link>
          </p>
        </section>
      </main>
    );
  }

  if (status === 'need-name') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>이름을 알려 주세요</h2>
          <p className="field-hint">
            교회에서 부르는 이름으로 적어 주세요. 담당자와 관리자 화면에 이 이름으로 보입니다.
          </p>
          <label>
            이름
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 김성주" />
          </label>
          {error && <p className="error-message">{error}</p>}
          <button
            type="button"
            className="primary-button"
            disabled={!name.trim()}
            onClick={() => join(name.trim())}
          >
            참여하기
          </button>
        </section>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>참여하지 못했습니다</h2>
          <p className="field-hint">{error}</p>
          <Link className="text-button" href="/">홈으로</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>참여가 끝났습니다</h2>
        <p className="field-hint">
          {result?.team
            ? `${result.team} ${result.teamRole === 'leader' ? '담당자로' : '팀원으로'} 들어왔습니다.`
            : '교회에 참여했습니다.'}
        </p>
        {result?.teamRole === 'leader' ? (
          <>
            <p className="field-hint">
              이제 <b>팀원을 부르실 차례</b>입니다. 초대 링크를 복사해 팀 단톡방에 붙여넣으세요.
            </p>
            <Link className="primary-button" href="/my">팀원 초대 링크 받기</Link>
          </>
        ) : (
          <Link className="primary-button" href="/">시작하기</Link>
        )}
      </section>
    </main>
  );
}
