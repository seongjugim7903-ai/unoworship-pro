'use client';

// 팀 홈 — 담당자가 초대 링크를 눌러 들어오면 도착하는 곳.
//
// 담당자가 여기서 할 일은 순서가 있다.
//   1. 앱 설치      예배 중에 쓸 화면이라 홈 화면에 있어야 한다
//   2. 팀원 초대     링크를 복사해 단톡방에 붙여넣는다
//   3. 팀 자료로     준비찬양·찬양대 화면으로 들어간다
//
// 그래서 화면도 그 순서로 둔다. 초대 링크는 1회용이 아니라서 나중에 다시 와도 복사할 수 있다.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { detectEnvironment, installSteps, type InstallEnvironment } from '../../lib/pwaInstall';

interface Code {
  id: string;
  code: string;
  kind: string;
  team: string | null;
}

interface Team {
  category: string;
  name: string;
}

type Phase = 'checking' | 'ready' | 'none';

export default function LeaderHomePanel() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [environment, setEnvironment] = useState<InstallEnvironment>('standalone');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const me = await (await fetch('/api/membership/me')).json();
      const leading = Object.entries((me?.teams ?? {}) as Record<string, string>)
        .filter(([, role]) => role === 'leader')
        .map(([name]) => name);
      if (leading.length === 0) { setPhase('none'); return; }

      const teamJson = await (await fetch('/api/teams')).json();
      const all = (teamJson?.teams ?? []) as Team[];
      setMyTeams(leading.map((name) => all.find((t) => t.name === name) ?? { name, category: '' }));

      const codeJson = await (await fetch('/api/membership/codes')).json();
      setCodes(codeJson?.codes ?? []);
      setPhase('ready');
    } catch {
      setPhase('none');
    }
  }, []);

  useEffect(() => {
    setEnvironment(detectEnvironment());
    void load();
  }, [load]);

  const linkOf = (team: string) => {
    const found = codes.find((item) => item.kind === 'team_join' && item.team === team);
    return found ? `${window.location.origin}/join/${found.code}` : null;
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${what} 복사했습니다. 팀 단톡방에 붙여넣으세요.`);
    } catch {
      setMessage('복사하지 못했습니다. 링크를 길게 눌러 직접 복사해 주세요.');
    }
  };

  const make = async (team: string) => {
    setBusy(team);
    setMessage('');
    try {
      const response = await fetch('/api/membership/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'team_join', team }),
      });
      const json = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !json.ok) {
        setMessage(json.message ?? '초대 링크를 만들지 못했습니다.');
        return;
      }
      setMessage(`${team} 초대 링크를 새로 만들었습니다. 이전 링크는 더 이상 쓸 수 없습니다.`);
      await load();
    } finally {
      setBusy('');
    }
  };

  if (phase === 'checking') {
    return <main className="site-shell"><section className="panel"><p className="field-hint">확인하는 중...</p></section></main>;
  }

  if (phase === 'none') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>맡으신 팀이 없습니다</h2>
          <p className="field-hint">담당자로 지정되면 여기서 팀원을 부를 수 있습니다.</p>
          <Link className="text-button" href="/">홈으로</Link>
        </section>
      </main>
    );
  }

  const installed = environment === 'standalone';

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>{myTeams.map((team) => team.name).join(' · ')} 담당자</h2>
        <p className="field-hint">아래 순서대로 하시면 됩니다.</p>
      </section>

      <section className="panel">
        <h2>1. 앱 설치</h2>
        {installed ? (
          <p className="info-message">앱으로 열려 있습니다. 이 단계는 끝났습니다.</p>
        ) : (
          <>
            <p className="field-hint">
              예배 중에 쓰는 화면입니다. 홈 화면에 두면 주소를 칠 필요 없이 바로 열립니다.
              {environment.startsWith('kakao') && ' 카카오톡 안에서는 설치가 안 되니 먼저 브라우저로 옮겨 주세요.'}
            </p>
            <ol className="install-steps">
              {installSteps(environment, false).map((step, index) => (
                <li key={step}><b>{index + 1}</b>{step}</li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="panel">
        <h2>2. 팀원 초대</h2>
        <p className="field-hint">
          링크를 복사해 <b>팀 단톡방에 붙여넣으세요.</b> 받은 사람은 링크를 누르고
          카카오로 로그인하면 끝입니다 — 코드를 적을 일이 없습니다.
        </p>

        {myTeams.map((team) => {
          const link = linkOf(team.name);
          return (
            <div className="invite-block" key={team.name}>
              <div className="invite-head">
                <strong>{team.name}</strong>
                {team.category && <span className="field-hint">{team.category}</span>}
              </div>
              {link ? (
                <>
                  <p className="invite-link-box">{link}</p>
                  <button type="button" className="primary-button" onClick={() => copy(link, '초대 링크를')}>
                    초대 링크 복사
                  </button>
                </>
              ) : (
                <p className="field-hint">아직 링크가 없습니다. 아래에서 만들어 주세요.</p>
              )}
              <button
                type="button"
                className="text-button"
                disabled={busy === team.name}
                onClick={() => make(team.name)}
              >
                {link ? '새 링크로 바꾸기' : '초대 링크 만들기'}
              </button>
            </div>
          );
        })}

        <p className="field-hint">
          링크가 엉뚱한 곳으로 퍼졌으면 <b>새 링크로 바꾸기</b>를 누르세요.
          이전 링크는 즉시 무효가 되고, 이미 들어온 팀원은 그대로입니다.
        </p>
      </section>

      <section className="panel">
        <h2>3. 팀 자료</h2>
        <p className="field-hint">곡과 악보를 올리고 예배를 준비하는 곳입니다.</p>
        <Link className="primary-button" href="/">팀 자료로 가기</Link>
      </section>

      {message && <section className="panel"><p className="info-message">{message}</p></section>}
    </main>
  );
}
