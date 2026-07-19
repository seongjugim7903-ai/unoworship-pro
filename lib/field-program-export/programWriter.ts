import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PROGRAMS_DIR = '/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field/data/programs';

type JsonRecord = Record<string, unknown>;

interface FieldProgramPayload {
  serviceType?: string;
  serviceDate?: string;
  songTitle?: string;
  composer?: string;
  arranger?: string;
  lyrics?: string;
  note?: string;
}

interface ExistingProgramMatch {
  fileName: string;
  filePath: string;
  data: JsonRecord;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function sanitizeSegment(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 80) || 'choir';
}

function formatDateKey(value: string) {
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.replaceAll('-', '');
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function formatWorshipName(value: string, serviceType: string) {
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date.replaceAll('-', '.')} ${serviceType}`;
  return `${new Date().toISOString().slice(0, 10).replaceAll('-', '.')} ${serviceType}`;
}

function makeHephzibahProgramId(title: string, dateKey: string) {
  return `헵시바-${sanitizeSegment(title)}-${dateKey}`;
}

function getNestedRecord(source: JsonRecord, key: string): JsonRecord | undefined {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function cloneRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

async function findExistingProgramByTitle(programsDir: string, title: string): Promise<ExistingProgramMatch | null> {
  const target = normalizeText(title);
  if (!target) return null;

  const files = await readdir(programsDir);
  for (const fileName of files) {
    if (!fileName.endsWith('.json')) continue;
    const filePath = path.join(programsDir, fileName);

    try {
      const data = JSON.parse(await readFile(filePath, 'utf8')) as JsonRecord;
      const item = getNestedRecord(data, 'item');
      const itemTitle = item?.title;
      const topTitle = data.title;
      const id = data.id;
      const haystacks = [itemTitle, topTitle, id, fileName].map(normalizeText);
      if (haystacks.some((value) => value === target || value.includes(target))) {
        return { fileName, filePath, data };
      }
    } catch {
      // 개별 JSON 손상은 전체 저장을 막지 않는다.
    }
  }

  return null;
}

function makeBasicMainElements(sectionId: string, text: string) {
  return [
    {
      id: `${sectionId}__bg`,
      x: -1.3875128688682286,
      y: 72.29085403714505,
      width: 102.77502573773646,
      height: 22.830226632694114,
      rotation: 0,
      opacity: 0.72,
      zIndex: 0,
      locked: false,
      visible: true,
      layerRole: 'props',
      fixedLayer: false,
      visibleOn: ['output', 'broadcast'],
      shapeType: 'roundRect',
      type: 'shape',
      fill: '#000000',
      fillOpacity: 1,
      stroke: 'transparent',
      strokeWidth: 0,
      cornerRadius: 0,
      useGradient: true,
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#41471f' },
          { offset: 1, color: '#0f3f57' },
        ],
      },
    },
    {
      id: `${sectionId}__text`,
      x: 4.972242432870645,
      y: 74.05596735349211,
      width: 90.05551513425871,
      height: 19.3,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      layerRole: 'lyrics',
      fixedLayer: false,
      visibleOn: ['output', 'broadcast'],
      linked: true,
      content: text,
      type: 'text',
      fontFamily: 'Nanum Square Neo',
      fontSize: 65,
      fontWeight: 800,
      fontStyle: 'normal',
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.6,
      letterSpacing: 3.5,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 4,
      useGradient: false,
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#3b82f6' },
          { offset: 1, color: '#8b5cf6' },
        ],
      },
      autoWidth: false,
      autoHeight: true,
      autoFit: true,
      fieldRole: 'body',
    },
  ];
}

function parseLyricSections(lyrics: string) {
  return lyrics
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function buildSections(programId: string, lyrics: string) {
  return parseLyricSections(lyrics).map((text, index) => {
    const sectionId = `${programId}-sec${index + 1}`;
    return {
      id: sectionId,
      label: String(index + 1),
      text,
      colorMark: '#ffffff',
      elements: makeBasicMainElements(sectionId, text),
    };
  });
}

export async function writeFieldProgram(payload: FieldProgramPayload) {
  const title = payload.songTitle?.trim() || '제목 없는 찬양대 자막';
  const serviceType = payload.serviceType?.trim() || '주일낮예배';
  const serviceDate = payload.serviceDate?.trim() || new Date().toISOString().slice(0, 10);
  const lyrics = payload.lyrics?.trim() || '';

  if (!lyrics) {
    throw new Error('가사가 없어 현장 프로그램 파일을 만들 수 없습니다.');
  }

  const programsDir = process.env.UNOWORSHIP_FIELD_PROGRAMS_DIR || DEFAULT_PROGRAMS_DIR;
  const existing = await findExistingProgramByTitle(programsDir, title);
  const dateKey = formatDateKey(serviceDate);
  const now = Date.now();
  const existingData = existing?.data ?? {};
  const existingItem = getNestedRecord(existingData, 'item') ?? {};
  const existingFormData = getNestedRecord(existingData, 'formData') ?? {};
  const id = String(existingData.id ?? existingItem.id ?? makeHephzibahProgramId(title, dateKey));
  const fileName = existing?.fileName ?? `${id}.json`;
  const filePath = existing?.filePath ?? path.join(programsDir, fileName);
  const sections = buildSections(id, lyrics);

  const nextProgram: JsonRecord = {
    ...existingData,
    id,
    type: existingData.type ?? 'worship',
    worshipId: existingData.worshipId ?? `choir-${dateKey}`,
    worshipName: existingData.worshipName ?? formatWorshipName(serviceDate, serviceType),
    formData: {
      ...cloneRecord(existingFormData),
      generator: existingFormData.generator ?? 'unoworship-pro-choir-v1',
      preserveElements: true,
      worshipType: serviceType,
      templateName: 'basic-001',
      promptTemplateName: 'pmt-black-white',
      source: 'unoworship-pro',
      composer: payload.composer?.trim() ?? '',
      arranger: payload.arranger?.trim() ?? '',
      note: payload.note?.trim() ?? '',
    },
    item: {
      ...cloneRecord(existingItem),
      id,
      title,
      sections,
      promptLayout: 'black-white',
    },
    createdAt: existingData.createdAt ?? now,
    updatedAt: now,
  };

  await writeFile(filePath, `${JSON.stringify(nextProgram, null, 2)}\n`, 'utf8');

  return {
    id,
    title,
    fileName,
    filePath,
    sectionCount: sections.length,
    updatedExisting: Boolean(existing),
  };
}
