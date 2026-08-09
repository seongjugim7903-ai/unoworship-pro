'use client';

// 담당자 코드 입력 — 교회에 참여한 뒤 따로 거치는 자리.
//
// 교회 참여 코드와 담당자 코드를 한 칸에서 받으면, 잘못 넣었을 때 무엇을 받아야
// 하는지 알 수 없다. 자리를 나눠 두면 안내가 분명해진다.
//
// 교회 참여는 최초 한 번, 담당자 코드도 그 팀에 대해 한 번이다.
// 이미 담당인 사람에게는 다시 묻지 않는다.

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Status = 'checking' | 'ready' | 'saving' | 'done';

export default function LeaderPanel() {
  const [status, setStatus] = useState<Status>('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [team, setTeam] = useState('');
  const [mine, setMine] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await (await fetch('/api/membership/me')).json();
        /* 로그인·교회 참여가 먼저다 — 그 화면으로 보낸다 */
        if (!me?.loggedIn || !me?.churchRole) { window.location.replace('/onboarding'); return; }
        setMine(Object.entries(me.teams ?? {})
          .filter(([, role]) => role === 'leader')
          .map(([name]) => name));
      } catch { /* 확인 실패는 무시 — 코드에서 다시 걸린다 */ }
      setStatus('ready');
    })();
  }, []);

  const busy = status === 'saving' || status === 'checking';

  const submit = async () => {
    if (busy) return;
    setStatus('saving');
    setError('');
    try {
      const response = await fetch('/api/membership/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await response.json() as { ok?: boolean; message?: string; team?: string | null };
      if (!response.ok || !json.ok) {
        setError(json.message ?? '담당자 코드를 처리하지 못했습니다.');
        setStatus('ready');
        return;
      }
      setTeam(json.team ?? '');
      setStatus('done');
    } catch {
      setError('처리 중 오류가 발생했습니다.');
      setStatus('ready');
    }
  };

  if (status === 'done') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>담당자가 되었습니다</h2>
          <p className="field-hint">{team} 자료를 수정·삭제할 수 있습니다.</p>
          <Link className="text-button" href="/">홈으로</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>담당자 코드</h2>
        <p className="field-hint">
          교회 관리자에게 1:1로 받은 <b>담당자 코드</b>를 넣어 주세요. 한 번만 쓸 수 있습니다.
          교회 참여 코드와는 다른 코드입니다.
        </p>

        {mine.length > 0 && (
          <p className="info-message">지금 맡고 계신 담당 — {mine.join(' · ')}</p>
        )}

        <label>
          담당자 코드
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="예: K7M2QX"
            autoCapitalize="characters"
            disabled={busy}
          />
        </label>

        {error && <p className="error-message">{error}</p>}

        <button type="button" className="primary-button" onClick={submit} disabled={busy || !code.trim()}>
          {status === 'saving' ? '확인하는 중...' : '담당자로 등록'}
        </button>
        <p className="field-hint" style={{ marginTop: 12 }}>
          <Link className="text-button" href="/">홈으로 돌아가기</Link>
        </p>
      </section>
    </main>
  );
}
