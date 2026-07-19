// 찬양대 요청을 나중에 Composer가 가져갈 수 있는 UnoWorship 프로그램 payload로 정규화한다.

export interface ChoirProgramPayloadInput {
  serviceType?: string;
  serviceDate?: string;
  songTitle?: string;
  composer?: string;
  arranger?: string;
  lyrics?: string;
  note?: string;
  requestId?: string;
  imagePaths?: string[];
  source?: string;
}

type JsonRecord = Record<string, unknown>;

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

export function parseLyricSections(lyrics: string) {
  return lyrics
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function makePromptElements(sectionId: string, text: string): JsonRecord[] {
  return [
    {
      id: `${sectionId}__prompt_bg`,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      layerRole: 'background',
      fixedLayer: false,
      visibleOn: ['prompt'],
      type: 'shape',
      shapeType: 'rect',
      fill: '#000000',
      fillOpacity: 1,
      stroke: 'transparent',
      strokeWidth: 0,
      cornerRadius: 0,
    },
    {
      id: `${sectionId}__prompt_text`,
      x: 5,
      y: 34,
      width: 90,
      height: 28,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      layerRole: 'lyrics',
      fixedLayer: false,
      visibleOn: ['prompt'],
      linked: true,
      content: text,
      type: 'text',
      fontFamily: 'Nanum Square Neo',
      fontSize: 92,
      fontWeight: 900,
      fontStyle: 'normal',
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.32,
      letterSpacing: 1.2,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 5,
      autoWidth: false,
      autoHeight: false,
      autoFit: true,
      fieldRole: 'body',
    },
  ];
}

export function buildChoirProgramPayload(input: ChoirProgramPayloadInput) {
  const title = input.songTitle?.trim() || '제목 없는 찬양대 자막';
  const serviceType = input.serviceType?.trim() || '주일낮예배';
  const serviceDate = input.serviceDate?.trim() || new Date().toISOString().slice(0, 10);
  const lyrics = input.lyrics?.trim() || '';
  const sections = parseLyricSections(lyrics);
  const dateKey = formatDateKey(serviceDate);
  const programId = `choir-${dateKey}-${sanitizeSegment(title)}`;
  const now = Date.now();

  return {
    id: programId,
    type: 'worship',
    worshipId: `choir-${dateKey}`,
    worshipName: formatWorshipName(serviceDate, serviceType),
    formData: {
      generator: 'unoworship-pro-choir-supabase-v1',
      source: input.source ?? 'unoworship-pro',
      requestId: input.requestId ?? null,
      preserveElements: true,
      worshipType: serviceType,
      templateName: 'basic-001',
      promptTemplateName: 'pmt-black-white',
      composer: input.composer?.trim() ?? '',
      arranger: input.arranger?.trim() ?? '',
      note: input.note?.trim() ?? '',
      storageBucket: 'choir-generated-images',
      imagePaths: input.imagePaths ?? [],
    },
    item: {
      id: programId,
      title,
      promptLayout: 'black-white',
      sections: sections.map((text, index) => {
        const sectionId = `${programId}-sec${index + 1}`;
        return {
          id: sectionId,
          label: String(index + 1),
          text,
          colorMark: '#ffffff',
          generatedImagePath: input.imagePaths?.[index] ?? null,
          elements: makePromptElements(sectionId, text),
        };
      }),
    },
    createdAt: now,
    updatedAt: now,
  };
}
