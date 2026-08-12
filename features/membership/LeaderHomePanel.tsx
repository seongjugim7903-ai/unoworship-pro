'use client';

// 담당자 화면 — 맡은 팀에 팀원을 부르는 자리.
//
// 팀원을 부르는 것은 담당자의 일이다. 관리자가 모든 팀의 팀원 링크까지 나눠 주면
// 사람이 바뀔 때마다 관리자를 거쳐야 한다.
//
// 담당자로 처음 들어오면 이 화면으로 안내한다. 그때 링크를 못 챙겼어도
// 여기서 다시 복사할 수 있다 — 1회용이 아니다.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Code {
  id: string;
  code: string;
  kind: string;
  team: string | null;
}

type Phase = 'checking' | 'ready' | 'none';

export default function LeaderHomePanel() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [teams, setTeams] = useState<string[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const me = await (await fetch('/api/membership/me')).json();
      const mine = Object.entries((me?.teams ?? {}) as Record<string, string>)
        .filter(([, role]) => role === 'leader')
        .map(([name]) => name);
      if (mine.length === 0) { setPhase('none'); return; }
      setTeams(mine);

      const codeJson = await (await fetch('/api/membership/codes')).json();
      setCodes(codeJson?.codes ?? []);
      setPhase('ready');
    } catch {
      setPhase('none');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linkOf = (team: string) => {
    const found = codes.find((item) => item.kind === 'team_join' && item.team === team);
    return found ? `${window.location.origin}/join/${found.code}` : null;
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('초대 링크를 복사했습니다. 팀 단톡방에 붙여넣으세요.');
    } catch {
      setMessage('복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.');
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

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>팀원 초대</h2>
        <p className="field-hint">
          링크를 복사해 팀 단톡방에 붙여넣으세요. 받은 사람은 링크를 누르고 카카오로
          로그인하면 끝입니다 — 코드를 적을 일이 없습니다.
        </p>

        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>팀</th><th>초대 링크</th><th>동작</th></tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const link = linkOf(team);
                return (
                  <tr key={team}>
                    <th scope="row">{team}</th>
                    <td>{link ? <span className="invite-link">{link}</span> : '아직 없음'}</td>
                    <td className="cell-actions">
                      {link && <button type="button" className="text-button" onClick={() => copy(link)}>링크 복사</button>}
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy === team}
                        onClick={() => make(team)}
                      >
                        {link ? '새 링크' : '링크 만들기'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="field-hint">
          <b>새 링크</b>를 만들면 이전 링크는 즉시 무효가 됩니다. 링크가 엉뚱한 곳으로
          퍼졌을 때 쓰세요. 이미 들어온 팀원은 그대로입니다.
        </p>
      </section>

      {message && <section className="panel"><p className="info-message">{message}</p></section>}
    </main>
  );
}
