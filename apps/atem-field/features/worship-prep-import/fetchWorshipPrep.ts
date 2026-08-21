// unoworship-pro(클라우드)에 저장된 준비찬양 셋을 가져온다. 서버 전용.
//
// 조립은 하지 않는다 — JSON 만 중계한다. 설교대지 가져오기와 같은 규칙이다
// (features/sermon-compose-import/fetchSermonCompose 참조).

import type { CloudPrepSong, WorshipPrepSet } from './types';

const DEFAULT_CLOUD_API_BASE = 'https://unoworship-pro-eight.vercel.app/api';

function cloudApiBase(): string {
  return (process.env.UNOWORSHIP_CLOUD_API_BASE || DEFAULT_CLOUD_API_BASE).replace(/\/+$/, '');
}

/** (날짜·예배·팀)이 한 셋이다. 저쪽 저장도 이 단위로 통째 교체한다 */
function setKey(song: CloudPrepSong): string {
  return `${song.service_date ?? ''}|${song.service_type}|${song.team}`;
}

export async function listWorshipPrepSets(limit: number): Promise<WorshipPrepSet[]> {
  const res = await fetch(`${cloudApiBase()}/worship-prep?limit=${limit}`, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    songs?: CloudPrepSong[];
  };
  if (!res.ok || body.ok === false) {
    throw new Error(body.message ?? `클라우드 요청 실패 (${res.status})`);
  }

  const groups = new Map<string, WorshipPrepSet>();
  for (const song of body.songs ?? []) {
    if (!song.title?.trim()) continue;
    const key = setKey(song);
    let group = groups.get(key);
    if (!group) {
      group = {
        serviceDate: song.service_date ?? '',
        serviceType: song.service_type,
        team: song.team,
        songs: [],
      };
      groups.set(key, group);
    }
    group.songs.push(song);
  }

  for (const group of groups.values()) {
    group.songs.sort((a, b) => a.song_order - b.song_order);
  }

  /* 목록이 이미 service_date 내림차순이라 Map 삽입 순서가 최신순이다 */
  return [...groups.values()];
}
