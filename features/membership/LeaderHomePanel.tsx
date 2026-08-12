'use client';

// 팀 홈 — 담당자가 초대 링크를 눌러 들어오면 도착하는 곳.
//
// 담당자가 여기서 할 일은 순서가 있다.
//   1. 앱 설치      예배 중에 쓸 화면이라 홈 화면에 있어야 한다
//   2. 팀원 초대     주소를 정하고 링크를 복사해 단톡방에 붙여넣는다
//   3. 팀 자료로     준비찬양·찬양대 화면으로 들어간다
//
// 그래서 화면도 그 순서로 둔다. 초대 링크는 1회용이 아니라서 나중에 다시 와도 복사할 수 있다.
//
// 주소는 담당자가 직접 정한다 — 카페 이름을 정하듯이. /join/J95XAF 는 단톡방에 붙었을 때
// 무엇인지 알 수 없지만 /join/ulju-sunday1 은 누가 봐도 우리 팀이다.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { detectEnvironment, installSteps, type InstallEnvironment } from '../../lib/pwaInstall';
import { isValidInviteSlug, normalizeInviteCode } from './inviteCode';

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

        {myTeams.map((team) => (
          <TeamInvite
            key={team.name}
            team={team}
            code={codes.find((item) => item.kind === 'team_join' && item.team === team.name)?.code ?? null}
            onDone={load}
            onMessage={setMessage}
          />
        ))}

        <p className="field-hint">
          링크가 엉뚱한 곳으로 퍼졌으면 <b>주소를 바꾸면</b> 됩니다.
          이전 주소는 즉시 무효가 되고, 이미 들어온 팀원은 그대로입니다.
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

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'taken'; reason: string };

interface TeamInviteProps {
  team: Team;
  code: string | null;
  onDone: () => Promise<void>;
  onMessage: (text: string) => void;
}

/** 팀 하나의 초대 주소 — 정하고, 중복을 확인하고, 링크를 복사한다 */
function TeamInvite({ team, code, onDone, onMessage }: TeamInviteProps) {
  const [editing, setEditing] = useState(!code);
  const [draft, setDraft] = useState('');
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  /* 늦게 도착한 응답이 새 입력의 판정을 덮어쓰지 않도록 마지막 요청만 인정한다 */
  const latest = useRef(0);

  const slug = normalizeInviteCode(draft);
  const link = code ? `${window.location.origin}/join/${code}` : null;

  useEffect(() => {
    if (!editing) return;
    if (!slug) { setCheck({ kind: 'idle' }); return; }
    if (!isValidInviteSlug(slug)) {
      setCheck({ kind: 'taken', reason: '영문 소문자와 숫자, 하이픈(-)만 3~30자로 정해 주세요.' });
      return;
    }
    setCheck({ kind: 'checking' });
    /* 한 글자마다 묻지 않는다 — 타이핑이 멈추면 그때 한 번 확인한다 */
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const query = `check=${encodeURIComponent(slug)}&team=${encodeURIComponent(team.name)}`;
        const json = await (await fetch(`/api/membership/codes?${query}`)).json();
        if (ticket !== latest.current) return;
        setCheck(json?.available
          ? { kind: 'free' }
          : { kind: 'taken', reason: json?.reason ?? '쓸 수 없는 주소입니다.' });
      } catch {
        if (ticket === latest.current) setCheck({ kind: 'taken', reason: '확인하지 못했습니다.' });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, editing, team.name]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onMessage('초대 링크를 복사했습니다. 팀 단톡방에 붙여넣으세요.');
    } catch {
      onMessage('복사하지 못했습니다. 링크를 길게 눌러 직접 복사해 주세요.');
    }
  };

  const save = async () => {
    setBusy(true);
    onMessage('');
    try {
      const response = await fetch('/api/membership/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'team_join', team: team.name, code: slug }),
      });
      const json = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !json.ok) {
        setCheck({ kind: 'taken', reason: json.message ?? '초대 주소를 만들지 못했습니다.' });
        return;
      }
      onMessage(`${team.name} 초대 주소를 /join/${slug} 으로 정했습니다.`);
      setEditing(false);
      setDraft('');
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="invite-block">
      <div className="invite-head">
        <strong>{team.name}</strong>
        {team.category && <span className="field-hint">{team.category}</span>}
      </div>

      {link && !editing && (
        <>
          <p className="invite-link-box">{link}</p>
          <button type="button" className="primary-button" onClick={() => copy(link)}>
            초대 링크 복사
          </button>
          <button type="button" className="text-button" onClick={() => setEditing(true)}>
            주소 바꾸기
          </button>
        </>
      )}

      {editing && (
        <>
          <p className="invite-link-box">
            {window.location.origin}/join/<b>{slug || '...'}</b>
          </p>
          <label>
            초대 주소 정하기
            <span className="field-hint">영문 소문자·숫자·하이픈. 나중에 바꿀 수 있습니다.</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="예: ulju-sunday1"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          {check.kind === 'taken'
            ? <p className="error-message">{check.reason}</p>
            : (
              <p className="info-message">
                {check.kind === 'checking' && '확인하는 중...'}
                {check.kind === 'free' && '쓸 수 있는 주소입니다.'}
                {check.kind === 'idle' && '팀을 알아볼 수 있는 영문 이름으로 정하세요.'}
              </p>
            )}
          <button
            type="button"
            className="primary-button"
            disabled={busy || check.kind !== 'free'}
            onClick={save}
          >
            {code ? '이 주소로 바꾸기' : '이 주소로 만들기'}
          </button>
          {code && (
            <button type="button" className="text-button" onClick={() => { setEditing(false); setDraft(''); }}>
              취소
            </button>
          )}
        </>
      )}
    </div>
  );
}
