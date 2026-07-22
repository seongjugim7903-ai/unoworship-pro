/**
 * 고정 프로그램 라이브러리 조회 API
 *
 * data/fixed-programs/*.json 을 모달을 열 때마다 다시 읽는다.
 * sourceTitle 만 있는 파일은 data/programs의 최신 저장본을 사용하고,
 * blocks 만 있는 파일은 기본 텍스트 디자인으로 즉석 SetlistItem을 만든다.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { CHOIR_DESIGN } from '@/lib/generators/designs/choirDesign';
import type { SavedProgram } from '@/lib/generators/programTypes';
import type { Section, SetlistItem } from '@/lib/types';

const FIXED_DIR = path.join(process.cwd(), 'data', 'fixed-programs');
const PROGRAM_DIR = path.join(process.cwd(), 'data', 'programs');

interface FixedProgramFile {
  id: string;
  title: string;
  category?: 'fixed' | 'responsive-reading' | string;
  aliases?: string[];
  sourceTitle?: string;
  blocks?: string[];
  item?: SetlistItem;
  programType?: SavedProgram['type'];
  createdAt?: number;
  updatedAt?: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeItemFromBlocks(definition: FixedProgramFile): SetlistItem {
  const itemId = definition.id;
  const elements = CHOIR_DESIGN.defaultSection.elements;
  const sections: Section[] = (definition.blocks ?? []).map((text, index) => ({
    id: `${itemId}-section-${index + 1}`,
    label: `${index + 1}`,
    text,
    colorMark: '#ffffff',
    elements: elements.map((element, elementIndex) => ({
      ...clone(element),
      id: `${itemId}-section-${index + 1}-element-${elementIndex + 1}`,
    })),
  }));

  return {
    id: itemId,
    title: definition.title,
    sections,
    promptLayout: 'black-white',
  };
}

async function readSavedPrograms(): Promise<SavedProgram[]> {
  try {
    const files = await fs.readdir(PROGRAM_DIR);
    const programs: SavedProgram[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await fs.readFile(path.join(PROGRAM_DIR, file), 'utf8')) as SavedProgram;
        if (raw?.item?.title && Array.isArray(raw.item.sections)) programs.push(raw);
      } catch {
        // 손상된 저장 파일 하나 때문에 고정 자료 전체를 막지 않는다.
      }
    }
    return programs;
  } catch {
    return [];
  }
}

function latestSource(programs: SavedProgram[], title: string): SavedProgram | undefined {
  return programs
    .filter((program) => program.item.title.trim() === title.trim())
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
}

function toSavedProgram(
  definition: FixedProgramFile,
  source: SavedProgram | undefined,
  updatedAt: number,
): SavedProgram {
  const item = source?.item ? clone(source.item) : definition.item ? clone(definition.item) : makeItemFromBlocks(definition);
  item.title = definition.title || item.title;
  item.id = definition.id;
  if (definition.category === 'fixed' && item.sections.length > 0) {
    item.promptLayout = 'black-white';
  }

  return {
    id: definition.id,
    type: source?.type ?? definition.programType ?? 'worship',
    worshipId: 'fixed-programs',
    worshipName: '고정 프로그램 라이브러리',
    formData: {
      generator: 'fixed-program-library-v1',
      fixedLibrary: true,
      category: definition.category ?? 'fixed',
      aliases: definition.aliases ?? [],
      sourceTitle: definition.sourceTitle ?? '',
      sourceProgramId: source?.id ?? '',
      preserveElements: true,
    },
    item,
    createdAt: definition.createdAt ?? source?.createdAt ?? updatedAt,
    updatedAt: definition.updatedAt ?? source?.updatedAt ?? updatedAt,
  };
}

/** 폴더에 SavedProgram 원본을 그대로 넣은 경우도 라이브러리 정의로 정규화한다. */
function normalizeDefinition(raw: unknown, fileName: string): FixedProgramFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const rawItem = value.item;
  if (rawItem && typeof rawItem === 'object') {
    const item = rawItem as SetlistItem;
    if (typeof item.title === 'string' && Array.isArray(item.sections)) {
      const formData = value.formData && typeof value.formData === 'object'
        ? value.formData as Record<string, unknown>
        : {};
      const id = typeof value.id === 'string' && value.id ? value.id : item.id || fileName.replace(/\.json$/, '');
      return {
        id,
        title: item.title,
        category: typeof formData.category === 'string' ? formData.category : 'fixed',
        aliases: Array.isArray(formData.aliases) ? formData.aliases.filter((alias): alias is string => typeof alias === 'string') : [],
        item,
        programType: value.type as SavedProgram['type'] | undefined,
        createdAt: typeof value.createdAt === 'number' ? value.createdAt : undefined,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
      };
    }
  }

  if (typeof value.id !== 'string' || typeof value.title !== 'string') return null;
  return value as unknown as FixedProgramFile;
}

async function readFixedPrograms(): Promise<SavedProgram[]> {
  await fs.mkdir(FIXED_DIR, { recursive: true });
  const [files, savedPrograms] = await Promise.all([
    fs.readdir(FIXED_DIR),
    readSavedPrograms(),
  ]);
  const records: SavedProgram[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(FIXED_DIR, file);
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
      const definition = normalizeDefinition(raw, file);
      if (!definition) continue;
      const stat = await fs.stat(filePath);
      const source = definition.sourceTitle ? latestSource(savedPrograms, definition.sourceTitle) : undefined;
      records.push(toSavedProgram(definition, source, stat.mtimeMs));
    } catch {
      // 손상된 고정 자료 파일은 건너뛰고 나머지는 계속 표시한다.
    }
  }

  // 기존에 저장된 교독문도 고정 폴더로 복사하지 않아도 바로 검색할 수 있게 한다.
  for (const program of savedPrograms) {
    const category = String(program.formData?.category ?? '');
    if (category !== 'responsive-reading' && !program.item.title.includes('교독문')) continue;
    if (records.some((record) => record.id === program.id)) continue;
    records.push({
      ...clone(program),
      worshipId: 'fixed-programs',
      worshipName: '고정 프로그램 라이브러리',
      formData: {
        ...program.formData,
        generator: 'fixed-program-library-v1',
        fixedLibrary: true,
        category: 'responsive-reading',
        sourceProgramId: program.id,
        preserveElements: true,
      },
    });
  }

  return records.sort((a, b) => a.item.title.localeCompare(b.item.title, 'ko'));
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const category = request.nextUrl.searchParams.get('category')?.trim();
    let programs = await readFixedPrograms();

    if (category) {
      programs = programs.filter((program) => program.formData?.category === category);
    }
    if (query) {
      programs = programs.filter((program) => {
        const aliases = Array.isArray(program.formData?.aliases) ? program.formData.aliases.join(' ') : '';
        return `${program.item.title} ${aliases} ${program.item.id}`.toLowerCase().includes(query);
      });
    }

    return NextResponse.json({ programs });
  } catch (error) {
    return NextResponse.json(
      { error: '고정 프로그램 라이브러리를 읽지 못했습니다.', detail: String(error) },
      { status: 500 },
    );
  }
}
