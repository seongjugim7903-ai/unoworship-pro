'use client';

// 준비찬양 셋 → 컴포저 프로그램. 곡 하나가 프로그램 하나다.
//
// 무엇을 만들고 무엇을 안 만드는가
//   회중에게 송출하는 것은 PPT 변환본(slide-images) 이다. 입력웹에 올린 악보는
//   반주자 아이패드용이라 여기서 쓰지 않는다 — 악보를 띄우면 회중이 오선을 본다.
//   그래서 곡명으로 변환본을 찾아 복제하고, 못 찾으면 만들지 않고 알려만 준다
//   (호출부가 브라우저 PPT 검색을 열어 준다).
//
// 설교대지와 같은 워십으로 묶는다
//   worshipId 를 "(예배일자)-worship" 으로 두어 설교대지 프로그램과 한 그룹이 된다.
//   따로 묶으면 예배 당일 자동 불러오기가 둘 중 하나만 집는다.

import type { SavedProgram } from '@/lib/generators/programTypes';
import { cloneSlideItem, fetchSlideImagePrograms } from '@/lib/generators/worshipServiceGenerator';
import { formatDateISO } from '@/lib/generators/worshipUploader';
import type { CloudPrepSong, WorshipPrepSet } from './types';

/** 이 생성기가 만든 프로그램 표시 — 다시 생성할 때 이전 회차를 골라 지우는 기준 */
export const WORSHIP_PREP_GENERATOR = 'worship-prep-import-v1';

export interface PrepBuildResult {
  worshipId: string;
  worshipName: string;
  programs: SavedProgram[];
  /** PPT 변환본을 못 찾아 만들지 못한 곡 — 호출부가 브라우저 검색을 연다 */
  skipped: string[];
}

function toDateKey(serviceDate: string): string {
  const digits = serviceDate.replace(/\D/g, '');
  return digits.length === 8 ? digits : '';
}

function slugify(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/[^0-9A-Za-z가-힣]/g, '') || 'song';
}

/**
 * 곡명으로 PPT 변환본 찾기.
 * 예배 자막 협조·설교대지 임포트의 findSlideProgram 과 같은 규칙이다.
 */
export function findSlideProgram(programs: SavedProgram[], name: string): SavedProgram | undefined {
  const query = name.trim().toLowerCase();
  if (!query) return undefined;
  return programs.find((program) =>
    program.item.title.toLowerCase().includes(query)
    || program.worshipName.toLowerCase().includes(query)
    || String(program.formData?.sourceLabel ?? '').toLowerCase().includes(query)
    || String(program.formData?.assetFolder ?? '').toLowerCase().includes(query),
  );
}

/** 반주자용 값이라 송출 프로그램에는 안 들어가지만, 되짚을 수 있게 formData 에 남긴다 */
function playNote(song: CloudPrepSong): Record<string, unknown> {
  return {
    prepSongId: song.id,
    team: song.team,
    songKey: song.song_key || undefined,
    sungKey: song.sung_key || undefined,
    tempoBpm: song.tempo_bpm ?? undefined,
    timeSignature: song.time_signature || undefined,
    arrangement: song.arrangement,
    arrangementCustom: song.arrangement_custom || undefined,
  };
}

/** 셋이 속할 워십 — 설교대지와 같은 그룹이 되도록 (예배일자)-worship 이다 */
export function prepWorshipIdentity(set: WorshipPrepSet): { worshipId: string; worshipName: string } {
  const dateKey = toDateKey(set.serviceDate);
  if (!dateKey) {
    throw new Error('준비찬양에 예배 일자가 없어 프로그램을 만들 수 없습니다.');
  }
  return {
    worshipId: `${dateKey}-worship`,
    worshipName: `${formatDateISO(dateKey).replaceAll('-', '.')} ${set.serviceType}`,
  };
}

/**
 * 곡 하나 → 프로그램 하나. 변환본을 못 찾으면 null.
 *
 * 나중에 변환본이 생겼을 때(브라우저에서 받아 자동감지로 들어옴) 그 곡만 다시
 * 만들 수 있어야 해서 한 곡짜리로 나눠 두었다.
 */
export function buildPrepProgram(
  set: WorshipPrepSet,
  song: CloudPrepSong,
  slidePrograms: SavedProgram[],
): SavedProgram | null {
  const { worshipId, worshipName } = prepWorshipIdentity(set);
  const name = song.title.trim();
  const source = findSlideProgram(slidePrograms, name);
  if (!source) return null;

  /* id 는 순번이 아니라 곡명으로 만든다 — 셋을 다시 만들어도 같은 곡은 같은 파일이라
     서버도 세트리스트도 그대로 갱신된다(설교대지 임포트에서 같은 이유로 겪었다). */
  const id = `${worshipId}-${slugify(name)}`;
  const now = Date.now();
  return {
    id,
    type: 'slide-images',
    worshipId,
    worshipName,
    formData: {
      ...source.formData,
      generator: WORSHIP_PREP_GENERATOR,
      preserveElements: true,
      worshipType: set.serviceType,
      prepPlay: playNote(song),
    },
    item: cloneSlideItem(source, id, name),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 준비찬양 셋을 컴포저 프로그램으로 조립한다.
 * 저장은 하지 않는다 — 호출부가 POST /api/programs 로 올린다.
 */
export async function buildWorshipPrepPrograms(set: WorshipPrepSet): Promise<PrepBuildResult> {
  const { worshipId, worshipName } = prepWorshipIdentity(set);
  const slidePrograms = await fetchSlideImagePrograms();

  const programs: SavedProgram[] = [];
  const skipped: string[] = [];
  for (const song of set.songs) {
    const program = buildPrepProgram(set, song, slidePrograms);
    if (program) programs.push(program);
    else skipped.push(song.title.trim());
  }

  return { worshipId, worshipName, programs, skipped };
}
