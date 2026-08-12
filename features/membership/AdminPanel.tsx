'use client';

// 교회 관리자 화면 — 팀 만들기, 참여 코드, 목회자 지정.
//
// 팀 목록은 교회마다 다르다. 그래서 화면에 박아 두지 않고 관리자가 직접 만든다 —
// 울주교회는 주일1부·2부·수요예배·금요기도회와 헵시바지만 다른 교회는 다르다.
//
// 코드는 카톡으로 전달된다. 그래서 화면의 일이 '만들기'보다 '복사하기'에 가깝다 —
// 누르면 바로 복사되게 두고, 담당자 코드는 1회용이라는 것을 옆에 적어 둔다.

import { Fragment, useCallback, useEffect, useState } from 'react';

import { TEAM_CATEGORIES as CATEGORIES } from './teams';

interface Team {
  id: string;
  category: string;
  name: string;
}

interface Code {
  id: string;
  code: string;
  kind: 'church_join' | 'team_join' | 'team_leader';
  team: string | null;
  used_count: number;
}

interface Member {
  userId: string;
  name: string;
  role: string;
  isPreacher: boolean;
  teams: Array<{ team: string; role: string }>;
}

type Phase = 'checking' | 'ready' | 'denied';

export default function AdminPanel() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [teams, setTeams] = useState<Team[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newTeam, setNewTeam] = useState({ category: CATEGORIES[0] as string, name: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [codeRes, teamRes, memberRes] = await Promise.all([
      fetch('/api/membership/codes'),
      fetch('/api/teams'),
      fetch('/api/membership/members'),
    ]);
    const codeJson = await codeRes.json() as { ok?: boolean; codes?: Code[]; message?: string };
    if (!codeRes.ok || !codeJson.ok) {
      setPhase('denied');
      setMessage(codeJson.message ?? '관리자 정보를 불러오지 못했습니다.');
      return;
    }
    const teamJson = await teamRes.json() as { ok?: boolean; teams?: Team[] };
    const memberJson = await memberRes.json() as { ok?: boolean; members?: Member[] };
    setCodes(codeJson.codes ?? []);
    setTeams(teamJson.teams ?? []);
    setMembers(memberJson.members ?? []);
    setPhase('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, request: () => Promise<Response>, done: string) => {
    setBusy(key);
    setMessage('');
    try {
      const response = await request();
      const json = await response.json() as { ok?: boolean; message?: string; code?: string };
      if (!response.ok || !json.ok) {
        setMessage(json.message ?? '처리하지 못했습니다.');
        return;
      }
      setMessage(json.code ? `${done} — ${json.code}` : done);
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
  const codeOf = (kind: Code['kind'], team: string) =>
    codes.find((item) => item.kind === kind && item.team === team);

  return (
    <main className="site-shell">
      <section className="panel">
        <h2>교회 참여 코드</h2>
        <p className="field-hint">
          <b>관리자용입니다.</b> 팀원과 담당자는 아래 <b>팀 코드</b>를 받으면 됩니다 —
          팀 코드에 교회가 이미 담겨 있어서 코드를 두 번 넣을 일이 없습니다.
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
            disabled={busy === 'church'}
            onClick={() => run('church', () => fetch('/api/membership/codes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'church_join' }),
            }), '교회 참여 코드를 새로 만들었습니다. 이전 코드는 무효입니다')}
          >
            새로 만들기
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>팀</h2>
        <p className="field-hint">
          우리 교회에서 쓰는 이름으로 만드세요. 팀마다 코드가 둘입니다 —
          <b>팀원 코드</b>는 여러 번 쓰니 단톡방에 뿌리셔도 되고, <b>담당자 코드</b>는 한 번만
          쓸 수 있으니 담당자에게만 1:1로 보내세요.
          설교대지는 팀이 없습니다 — 각자 자기 것을 쓰므로 아래 <b>목회자</b>로 지정합니다.
        </p>

        <div className="song-inline">
          <label>
            카테고리
            <select
              value={newTeam.category}
              onChange={(event) => setNewTeam((prev) => ({ ...prev, category: event.target.value }))}
            >
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            팀 이름
            <input
              value={newTeam.name}
              onChange={(event) => setNewTeam((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="예: 주일1부, 헵시바"
            />
          </label>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={busy === 'team' || !newTeam.name.trim()}
          onClick={() => run('team', () => fetch('/api/teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTeam),
          }), `${newTeam.name} 팀을 만들었습니다`).then(() => setNewTeam((prev) => ({ ...prev, name: '' })))}
        >
          팀 만들기
        </button>

        {teams.length === 0 ? (
          <p className="field-hint" style={{ marginTop: 14 }}>아직 만든 팀이 없습니다.</p>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>팀</th><th>분류</th><th>구분</th><th>코드</th><th>동작</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const join = codeOf('team_join', team.name);
                    const leader = codeOf('team_leader', team.name);
                    const leaderUsed = leader ? leader.used_count > 0 : false;
                    return (
                      <Fragment key={team.id}>
                        <tr>
                          <th rowSpan={2} scope="rowgroup">{team.name}</th>
                          <td rowSpan={2}>{team.category}</td>
                          <td>
                            팀원
                            <em className="cell-note">여러 번 · 단톡방 가능</em>
                          </td>
                          <td><strong className="code-value">{join?.code ?? '없음'}</strong></td>
                          <td className="cell-actions">
                            {join && <button type="button" className="text-button" onClick={() => copy(join.code)}>복사</button>}
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy === `join:${team.name}`}
                              onClick={() => run(`join:${team.name}`, () => fetch('/api/membership/codes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ kind: 'team_join', team: team.name }),
                              }), `${team.name} 팀원 코드`)}
                            >
                              {join ? '새 코드' : '코드 만들기'}
                            </button>
                          </td>
                          <td rowSpan={2}>
                            <button
                              type="button"
                              className="text-button danger"
                              disabled={busy === `archive:${team.id}`}
                              onClick={() => run(`archive:${team.id}`,
                                () => fetch(`/api/teams?id=${team.id}`, { method: 'DELETE' }),
                                `${team.name} 팀을 접었습니다`)}
                            >
                              팀 접기
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            담당자
                            <em className="cell-note">
                              {leaderUsed ? '사용됨 — 담당자 정해짐' : '한 번만 · 1:1 전달'}
                            </em>
                          </td>
                          <td><strong className="code-value">{leader?.code ?? '없음'}</strong></td>
                          <td className="cell-actions">
                            {leader && !leaderUsed && (
                              <button type="button" className="text-button" onClick={() => copy(leader.code)}>복사</button>
                            )}
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy === `code:${team.name}`}
                              onClick={() => run(`code:${team.name}`, () => fetch('/api/membership/codes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ kind: 'team_leader', team: team.name }),
                              }), `${team.name} 담당자 코드`)}
                            >
                              {leader ? '새 코드' : '코드 만들기'}
                            </button>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="field-hint">
          담당자를 바꾸려면 <b>담당자 코드 다시</b>로 새 코드를 뽑아 새 담당자에게 보내면 됩니다.
          팀을 정리해도 그 팀 자료는 남습니다.
        </p>
      </section>

      <section className="panel">
        <h2>참여자</h2>
        <p className="field-hint">
          <b>목회자</b>로 켜면 설교대지를 쓸 수 있습니다. 담임목사님과 부교역자를 켜 주세요 —
          각자 자기 설교대지를 쓰고 남의 것은 고치지 못합니다.
          <br />
          <b>관리자</b>는 한 명만 두지 마세요. 그분이 그만두거나 계정을 잃으면 아무도 코드를
          발급하거나 팀을 만들 수 없습니다.
        </p>
        {members.length === 0 ? (
          <p className="field-hint">아직 참여자가 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr><th>이름</th><th>소속 팀</th><th>관리자</th><th>목회자</th></tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId}>
                    <th scope="row">{member.name}</th>
                    <td>
                      {member.teams.length === 0
                        ? '—'
                        : member.teams.map((team) => `${team.team}${team.role === 'leader' ? '(담당)' : ''}`).join(' · ')}
                    </td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy === `role:${member.userId}`}
                        onClick={() => run(`role:${member.userId}`, () => fetch('/api/membership/members', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' }),
                        }), member.role === 'admin' ? `${member.name} 관리자에서 내렸습니다` : `${member.name}을(를) 관리자로 세웠습니다`)}
                      >
                        {member.role === 'admin' ? '✓ 켜짐' : '켜기'}
                      </button>
                    </td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy === `preacher:${member.userId}`}
                        onClick={() => run(`preacher:${member.userId}`, () => fetch('/api/membership/members', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: member.userId, isPreacher: !member.isPreacher }),
                        }), member.isPreacher ? `${member.name} 목회자 표시를 껐습니다` : `${member.name}을(를) 목회자로 지정했습니다`)}
                      >
                        {member.isPreacher ? '✓ 켜짐' : '켜기'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {message && <section className="panel"><p className="info-message">{message}</p></section>}
    </main>
  );
}
