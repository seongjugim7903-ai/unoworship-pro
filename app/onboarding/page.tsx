'use client';

// 참여 화면 — 로그인 직후 한 번만 거친다.
//
// 카카오에서는 닉네임만 받는다(이메일 동의항목은 비즈앱을 요구해서 끄기로 했다).
// 그런데 카톡 닉네임은 🌸행복🌸, ㅁㅁ, 아빠 같은 것이 흔해서 관리자가 누가 누구인지
// 알 수 없다. 그래서 '교회에서 부르는 이름'을 여기서 한 번 받는다.
//
// 코드는 두 종류이고 사용자는 구분할 필요가 없다 — 서버가 코드를 보고 판단한다.
//   교회 참여 코드 → 팀을 골라 팀원이 된다
//   팀장 코드      → 그 코드에 적힌 팀의 팀장이 된다 (팀 선택칸은 숨긴다)

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/authn/supabaseBrowser';

/* 화면의 팀 목록 — 아직 문자열이다. 교회마다 달라지면 데이터로 뺀다
   (docs/features/auth-church-scope/context-notes.md) */
const TEAMS = ['주일1부', '주일2부', '수요예배', '금요기도회'];

type Status = 'checking' | 'need-login' | 'ready' | 'saving' | 'done';

export default function OnboardingPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [team, setTeam] = useState(TEAMS[0]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ churchRole: string; team: string | null; teamRole: string | null } | null>(null);

  /* 로그인하지 않았으면 여기 있을 이유가 없다 */
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        setError('로그인 환경이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
        setStatus('ready');
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        /* 로그인 화면으로 튕기지 않는다 — 여기가 하나뿐인 입구라 여기서 바로 누르게 한다 */
        setStatus('need-login');
        return;
      }
      /* 카톡 닉네임을 첫 값으로 깔아 준다 — 그대로 쓰든 고치든 사용자가 정한다 */
      const nickname = (data.user.user_metadata?.name ?? data.user.user_metadata?.full_name ?? '') as string;
      setName(nickname);
      setStatus('ready');
    })();
  }, []);

  const busy = status === 'saving' || status === 'checking';

  const handleKakao = async () => {
    const supabase = createClient();
    if (!supabase) {
      setError('로그인 환경이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    if (oauthError) setError(`카카오 로그인을 시작하지 못했습니다. ${oauthError.message}`);
  };

  const handleJoin = async () => {
    if (busy) return;
    setStatus('saving');
    setError('');
    try {
      const response = await fetch('/api/membership/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, team }),
      });
      const json = await response.json() as {
        ok?: boolean; message?: string;
        churchRole?: string; team?: string | null; teamRole?: string | null;
      };
      if (!response.ok || !json.ok) {
        setError(json.message ?? '참여하지 못했습니다.');
        setStatus('ready');
        return;
      }
      setResult({
        churchRole: json.churchRole ?? 'member',
        team: json.team ?? null,
        teamRole: json.teamRole ?? null,
      });
      setStatus('done');
    } catch {
      setError('참여 처리 중 오류가 발생했습니다.');
      setStatus('ready');
    }
  };

  if (status === 'need-login') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>로그인이 필요합니다</h2>
          <p className="field-hint">
            설교대지·준비찬양·헵시바는 교회 자료를 넣고 고치는 화면이라 로그인 뒤에 쓸 수 있습니다.
            카카오로 로그인하시면 이어서 참여 코드를 넣게 됩니다.
          </p>
          {error && <p className="error-message">{error}</p>}
          <button type="button" className="kakao-button" onClick={handleKakao}>카카오로 로그인</button>
          <p className="field-hint" style={{ marginTop: 14 }}>
            카카오를 쓰지 않으시면 <Link className="text-button" href="/login">이메일로 로그인</Link>
          </p>
        </section>
      </main>
    );
  }

  if (status === 'done' && result) {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>참여가 끝났습니다</h2>
          <p className="field-hint">
            {result.churchRole === 'admin'
              ? '이 교회의 첫 사용자라 관리자가 되었습니다. 팀장 코드를 만들어 각 팀장에게 전달해 주세요.'
              : result.teamRole === 'leader'
                ? `${result.team} 팀장으로 참여했습니다. 곡과 악보를 수정·삭제할 수 있습니다.`
                : `${result.team ?? '교회'} 팀원으로 참여했습니다. 곡과 악보는 보기만 됩니다.`}
          </p>
          <Link className="text-button" href="/">홈으로</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>교회 참여</h2>
        <p className="field-hint">
          교회에서 받은 참여 코드를 넣어 주세요. 팀장 코드를 받으셨다면 팀은 코드가 정합니다.
        </p>

        <label>
          이름
          <span className="field-hint">관리자 화면에 이 이름으로 보입니다. 교회에서 부르는 이름으로 적어 주세요.</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 김성주"
            disabled={busy}
          />
        </label>

        <label>
          참여 코드
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="예: K7M2QX"
            autoCapitalize="characters"
            disabled={busy}
          />
        </label>

        <label>
          찬양팀
          <span className="field-hint">팀장 코드를 쓰시면 이 선택은 무시되고 코드가 정한 팀으로 들어갑니다.</span>
          <select value={team} onChange={(event) => setTeam(event.target.value)} disabled={busy}>
            {TEAMS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        {error && <p className="error-message">{error}</p>}

        <button
          type="button"
          className="primary-button"
          onClick={handleJoin}
          disabled={busy || !name.trim() || !code.trim()}
        >
          {status === 'saving' ? '참여하는 중...' : '참여하기'}
        </button>
      </section>
    </main>
  );
}
