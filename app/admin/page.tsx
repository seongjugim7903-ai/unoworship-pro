'use client';

// 교회 관리자 화면 — 참여 코드 발급과 전달.
//
// 코드는 카톡으로 전달된다. 그래서 화면의 일이 '만들기'보다 '복사하기'에 가깝다 —
// 누르면 바로 복사되게 두고, 팀장 코드는 1회용이라는 것을 옆에 적어 둔다.
//
// 팀 목록은 아직 문자열이다(docs/features/auth-church-scope/context-notes.md).

import { useCallback, useEffect, useState } from 'react';

/* 권한은 기능 단위로 나눈다 — 설교대지는 목회자·비서, 준비찬양은 찬양 인도자,
   찬양대는 헵시바 담당이 맡는 것이 실제 모습이다.
   준비찬양 안의 주일1부·2부·수요·금요는 자료를 나누는 분류이지 권한 단위가 아니다. */
const TEAMS = ['설교대지', '준비찬양', '찬양대'];

interface Code {
  id: string;
  code: string;
  kind: 'church_join' | 'team_leader';
  team: string | null;
  max_uses: number | null;
  used_count: number;
}

type Phase = 'checking' | 'ready' | 'denied';

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [codes, setCodes] = useState<Code[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/membership/codes');
    const json = await response.json() as { ok?: boolean; codes?: Code[]; message?: string };
    if (!response.ok || !json.ok) {
      setPhase('denied');
      setMessage(json.message ?? '코드 목록을 불러오지 못했습니다.');
      return;
    }
    setCodes(json.codes ?? []);
    setPhase('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const issue = async (kind: 'team_leader' | 'church_join', team = '') => {
    setBusy(`${kind}:${team}`);
    setMessage('');
    try {
      const response = await fetch('/api/membership/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, team }),
      });
      const json = await response.json() as { ok?: boolean; code?: string; message?: string };
      if (!response.ok || !json.ok) {
        setMessage(json.message ?? '코드를 발급하지 못했습니다.');
        return;
      }
      setMessage(`${team || '교회'} 코드를 새로 만들었습니다. 이전 코드는 더 이상 쓸 수 없습니다.`);
      await load();
    } finally {
      setBusy('');
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`${code} 복사했습니다. 카톡으로 보내세요.`);
    } catch {
      setMessage('복사하지 못했습니다. 코드를 직접 적어 주세요.');
    }
  };

  if (phase === 'checking') {
    return <main className="site-shell"><section className="panel"><p className="field-hint">확인하는 중...</p></section></main>;
  }

  if (phase === 'denied') {
    return (
      <main className="site-shell">
        <section className="panel">
          <h2>관리자만 볼 수 있습니다</h2>
          <p className="field-hint">{message}</p>
        </section>
      </main>
    );
  }

  const churchCode = codes.find((item) => item.kind === 'church_join');
  const leaderOf = (team: string) => codes.find((item) => item.kind === 'team_leader' && item.team === team);

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>교회 참여 코드</h2>
        <p className="field-hint">
          모든 팀원이 이 코드 하나로 들어옵니다. 단톡방에 뿌리셔도 됩니다 —
          관리자 자리는 이미 차 있어서 뒤에 들어오는 사람은 모두 팀원이 됩니다.
        </p>
        <div className="code-row">
          <strong className="code-value">{churchCode?.code ?? '없음'}</strong>
          {churchCode && (
            <>
              <button type="button" className="text-button" onClick={() => copy(churchCode.code)}>복사</button>
              <span className="field-hint">{churchCode.used_count}명 사용</span>
            </>
          )}
          <button
            type="button"
            className="text-button danger"
            disabled={busy === 'church_join:'}
            onClick={() => issue('church_join')}
          >
            새로 만들기
          </button>
        </div>
        <p className="field-hint">
          새로 만들면 <b>이전 코드는 즉시 무효</b>가 됩니다. 이미 참여한 사람은 그대로입니다.
        </p>
      </section>

      <section className="panel">
        <h2>팀장 코드</h2>
        <p className="field-hint">
          팀마다 하나씩, <b>한 번만 쓸 수 있습니다.</b> 팀장에게 1:1로 보내세요 —
          단톡방에 돌아도 먼저 쓴 사람 뒤로는 아무도 팀장이 될 수 없습니다.
        </p>
        {TEAMS.map((team) => {
          const code = leaderOf(team);
          const used = code ? code.used_count > 0 : false;
          return (
            <div className="code-row" key={team}>
              <span className="code-team">{team}</span>
              <strong className="code-value">{code?.code ?? '미발급'}</strong>
              {code && !used && (
                <button type="button" className="text-button" onClick={() => copy(code.code)}>복사</button>
              )}
              {used && <span className="field-hint">이미 사용됨 — 팀장이 정해졌습니다</span>}
              <button
                type="button"
                className="text-button danger"
                disabled={busy === `team_leader:${team}`}
                onClick={() => issue('team_leader', team)}
              >
                {code ? '다시 만들기' : '만들기'}
              </button>
            </div>
          );
        })}
        <p className="field-hint">
          팀장을 바꾸려면 <b>다시 만들기</b>로 새 코드를 뽑아 새 팀장에게 보내면 됩니다.
        </p>
      </section>

      {message && <section className="panel"><p className="info-message">{message}</p></section>}
    </main>
  );
}
