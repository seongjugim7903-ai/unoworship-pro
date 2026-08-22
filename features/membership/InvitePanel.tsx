'use client';

// 초대 링크로 들어오는 자리 — /join/<코드>
//
// 팀원에게 코드를 받아 적게 하지 않는다. 카톡방 링크처럼 눌러서 들어오면 된다.
// 코드는 주소에 들어 있고, 로그인만 하면 그 팀까지 자동으로 배정된다.
//
//   설치 안 됨(휴대폰)  → 설치 안내만 보인다. 끝나기 전에는 넘어가지 않는다
//   로그인 안 됨        → 카카오 로그인 (돌아올 곳은 이 링크)
//   이름이 없음         → 이름만 한 번 묻는다
//   이름이 있음         → 바로 참여시키고 홈으로
//
// 설치를 먼저 세우는 이유 — 예배 중에 여는 화면이라 홈 화면에 있어야 한다.
// 로그인부터 시키면 다들 브라우저에 머무르고, 매번 주소를 찾아 들어오게 된다.
// 데스크톱은 막지 않는다(lib/pwaInstall 의 isHandheld 참조).
//
// 담당자 코드도 같은 링크로 동작한다 — 서버가 코드를 보고 담당자인지 팀원인지 정한다.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/authn/supabaseBrowser';
import { detectEnvironment, isHandheld, watchInstalled } from '../../lib/pwaInstall';
import InstallGate from './InstallGate';
import { forgetInvite, rememberInvite } from './pendingInvite';

type Status = 'checking' | 'gate' | 'need-login' | 'need-name' | 'joining' | 'done' | 'error';

interface Preview {
  team: string | null;
  leaderName: string;
  churchName: string;
}

export default function InvitePanel({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>('checking');
  const [preview, setPreview] = useState<Preview | null>(null);
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
        /* 이미 들어와 있는 경우도 여기로 온다 — 실패가 아니라 '이미 됨'이다.
           어느 쪽이든 이 초대는 끝났으므로 넘겨주려고 적어 둔 코드를 지운다.
           안 지우면 참여 화면에 갈 때마다 이 링크로 되돌아온다 */
        forgetInvite();
        setError(json.message ?? '참여하지 못했습니다.');
        setStatus('error');
        return;
      }
      /* 들어왔으면 넘겨주려고 적어 둔 코드는 지운다 */
      forgetInvite();
      /* 담당자는 할 일이 남아 있다(팀원 초대). 안내 화면을 거치지 않고 바로 보낸다 */
      if (json.teamRole === 'leader') { window.location.replace('/my'); return; }
      setResult({ team: json.team ?? null, teamRole: json.teamRole ?? null });
      setStatus('done');
    } catch {
      setError('참여 처리 중 오류가 발생했습니다.');
      setStatus('error');
    }
  }, [code]);

  /* 1. 초대가 살아 있는지 확인하고, 설치가 안 됐으면 여기서 멈춘다 */
  useEffect(() => {
    (async () => {
      /* 설치하면 홈 화면 아이콘은 start_url 로 열려 이 주소를 잃는다. 미리 적어 둔다 */
      rememberInvite(code);

      let live: Preview | null = null;
      let dead = '';
      try {
        const response = await fetch(`/api/membership/invite?code=${encodeURIComponent(code)}`);
        const json = await response.json();
        if (json?.ok) {
          live = { team: json.team ?? null, leaderName: json.leaderName ?? '', churchName: json.churchName ?? '' };
        } else if (response.status === 404) {
          /* 초대 자체가 잘못됐다 — 없거나, 회수됐거나, 이미 쓴 코드다.
             서버가 잠깐 아픈 것(5xx)은 여기 넣지 않는다. 그때는 안내를 계속 보여 주고
             참여 단계에서 다시 판단하게 둔다 — 멀쩡한 초대를 막아 버리면 안 된다 */
          dead = json?.message ?? '';
        }
      } catch { /* 확인 실패는 통과시킨다 — 뒤의 참여 단계가 다시 판단한다 */ }

      setPreview(live);
      /* 없는 코드면 설치를 시키지 않는다 — 설치해 봐야 들어갈 곳이 없다 */
      if (dead) { forgetInvite(); setError(dead); setStatus('error'); return; }

      const needsInstall = detectEnvironment() !== 'standalone' && isHandheld();
      setStatus(needsInstall ? 'gate' : 'need-login');
    })();
  }, [code]);

  /* 설치가 끝나면 기다리지 않고 바로 로그인으로 보낸다 — 홈 화면 아이콘을 찾아
     다시 들어오게 하면 거기서 절반이 떨어져 나간다. 앱은 이미 깔렸으니 다음부터
     그 아이콘으로 열면 된다. */
  useEffect(() => {
    if (status !== 'gate') return;
    return watchInstalled(() => setStatus('need-login'));
  }, [status]);

  /* 2. 설치를 넘겼으면 로그인·이름·참여로 이어간다 */
  useEffect(() => {
    if (status !== 'need-login') return;
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        setError('로그인 환경이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
        setStatus('error');
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

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
    /* status 가 need-login 으로 바뀌는 순간 한 번만 돈다 */
  }, [status, join]);

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
    return <main className="gate"><div className="gate-card"><p className="gate-lead">참여하는 중...</p></div></main>;
  }

  if (status === 'gate') return <InstallGate code={code} />;

  if (status === 'need-login') {
    return (
      <main className="gate">
        <div className="gate-card">
          <img className="gate-mark" src="/icons/ulju-icon-192.png" alt="" width={56} height={56} />
          <h1 className="gate-title">로그인</h1>
          <p className="gate-lead">카카오로 로그인하시면 바로 팀에 들어갑니다.</p>
          {error && <p className="gate-message is-error">{error}</p>}
          <div className="gate-actions">
            <button type="button" className="kakao-button" onClick={kakao}>카카오로 로그인</button>
          </div>
          {/* 카톡을 안 쓰는 분과 테스트 계정을 위한 통로 — 돌아올 곳은 이 링크다 */}
          <p className="gate-fallback">
            카카오를 쓰지 않으시면{' '}
            <Link href={`/login?redirectTo=/join/${encodeURIComponent(code)}`}>이메일로 로그인</Link>
          </p>
        </div>
      </main>
    );
  }

  if (status === 'need-name') {
    return (
      <main className="gate">
        <div className="gate-card">
          <h1 className="gate-title">이름을 알려 주세요</h1>
          <p className="gate-lead">
            교회에서 부르는 이름으로 적어 주세요. 담당자와 관리자 화면에 이 이름으로 보입니다.
          </p>
          <label className="gate-field">
            <span>이름</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 김성주" />
          </label>
          {error && <p className="gate-message is-error">{error}</p>}
          <div className="gate-actions">
            <button
              type="button"
              className="gate-primary"
              disabled={!name.trim()}
              onClick={() => join(name.trim())}
            >
              참여하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="gate">
        <div className="gate-card">
          <h1 className="gate-title">참여하지 못했습니다</h1>
          <p className="gate-lead">{error}</p>
          <p className="gate-fallback"><Link href="/">홈으로</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className="gate">
      <div className="gate-card">
        <h1 className="gate-title">참여가 끝났습니다</h1>
        <p className="gate-lead">
          {result?.team
            ? `${result.team} ${result.teamRole === 'leader' ? '담당자로' : '팀원으로'} 들어왔습니다.`
            : '교회에 참여했습니다.'}
        </p>
        <div className="gate-actions">
          {/* 담당자는 팀 홈으로 — 거기서 앱 설치와 자기 일부터 한다. 팀원 초대는 그 아래 접혀 있다 */}
          <Link className="gate-primary" href={result?.teamRole === 'leader' ? '/my' : '/'}>
            시작하기
          </Link>
        </div>
      </div>
    </main>
  );
}
