'use client';

// 내 정보 — 사진, 이름, 연락처.
//
// 사진은 카카오에서 온다. 우리가 따로 받지 않는다 — 이미 카카오에 있는 것을 또 올리라고
// 하면 그 자리에서 그만둔다. 카카오를 안 쓰는 계정(이메일 로그인)은 이름 첫 글자를 쓴다.
//
// 이름은 '교회에서 부르는 이름'이다. 카톡 닉네임이 🌸행복🌸, ㅁㅁ, 아빠 같은 것이 흔해서
// 관리자 화면에서 누가 누구인지 알 수 없다. 그래서 참여할 때 한 번 받고, 여기서 고친다.
//
// 연락처는 담당자가 팀원에게 연락할 때 쓴다. 안 적어도 된다 — 빈 칸으로 두면 안 보인다.

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/authn/supabaseBrowser';

type Status = 'checking' | 'ready' | 'saving';

export default function ProfilePanel() {
  const [status, setStatus] = useState<Status>('checking');
  const [avatar, setAvatar] = useState('');
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      /* 사진과 로그인 수단은 로그인 정보에서, 이름과 연락처는 우리 쪽 기록에서 온다 */
      const supabase = createClient();
      const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      setAvatar(String(meta.avatar_url ?? meta.picture ?? ''));
      setLogin(data?.user?.app_metadata?.provider === 'kakao' ? '카카오' : (data?.user?.email ?? ''));

      try {
        const me = await (await fetch('/api/membership/me')).json();
        setName(String(me?.name ?? ''));
        setPhone(String(me?.phone ?? ''));
        setTeams((me?.teams ?? {}) as Record<string, string>);
      } catch { /* 못 읽으면 빈 칸에서 시작한다 — 저장하면 그때 채워진다 */ }
      setStatus('ready');
    })();
  }, []);

  const save = async () => {
    if (status === 'saving') return;
    setStatus('saving');
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/membership/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const json = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !json.ok) {
        setError(json.message ?? '저장하지 못했습니다.');
        return;
      }
      setMessage(json.message ?? '저장했습니다.');
    } catch {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setStatus('ready');
    }
  };

  if (status === 'checking') {
    return <main className="site-shell"><section className="panel"><p className="field-hint">확인하는 중...</p></section></main>;
  }

  const mine = Object.entries(teams);

  return (
    <main className="site-shell">
      <section className="panel">
        <div className="profile-head">
          {avatar ? (
            /* 카카오 사진은 크기가 제각각이라 next/image 최적화 대신 원본을 축소해 쓴다 */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="profile-avatar" src={avatar} alt="" width={64} height={64} />
          ) : (
            <span className="profile-avatar is-letter">{(name.trim()[0] ?? '?')}</span>
          )}
          <div>
            <strong className="profile-name">{name.trim() || '이름 없음'}</strong>
            {login && <span className="field-hint">{login} 로그인</span>}
          </div>
        </div>

        {mine.length > 0 && (
          <p className="info-message">
            {mine.map(([team, role]) => `${team}${role === 'leader' ? ' 담당자' : ''}`).join(' · ')}
          </p>
        )}

        <label>
          이름
          <span className="field-hint">교회에서 부르는 이름으로 적어 주세요. 담당자와 관리자 화면에 이 이름으로 보입니다.</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 김성주"
            disabled={status === 'saving'}
          />
        </label>

        <label>
          연락처
          <span className="field-hint">담당자가 연락할 때 씁니다. 안 적으셔도 됩니다.</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="예: 010-1234-5678"
            inputMode="tel"
            disabled={status === 'saving'}
          />
        </label>

        {error && <p className="error-message">{error}</p>}
        {message && <p className="info-message">{message}</p>}

        <button
          type="button"
          className="primary-button"
          onClick={() => void save()}
          disabled={status === 'saving' || !name.trim()}
        >
          {status === 'saving' ? '저장하는 중...' : '저장'}
        </button>

        <p className="field-hint" style={{ marginTop: 14 }}>
          사진은 카카오 프로필을 그대로 씁니다. 바꾸시려면 카카오톡에서 프로필 사진을 바꾸신 뒤
          여기서 로그아웃하고 다시 로그인하시면 됩니다.
        </p>
      </section>
    </main>
  );
}
