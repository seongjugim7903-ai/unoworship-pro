// 자막 템플릿의 콘텐츠 축 카테고리와 카테고리별 필드(역할) 스키마 정의

export type TemplateCategory =
  | 'bible'
  | 'responsive'
  | 'hymn'
  | 'praise'
  | 'sermon'
  | 'worshipTitle'
  | 'notice'
  | 'lowerthird'
  | 'apostlesCreed'
  | 'preacher'
  | 'titleScripture'
  | 'wordTitle'
  | 'pointTitle'
  | 'hephzibah'
  | 'meditation'
  | 'scripture'
  | 'wordText';

export interface FieldDef {
  /** TextElement.fieldRole 에 저장되는 역할 키 */
  key: string;
  label: string;
  /** 1차 필수 슬롯 여부 */
  required?: boolean;
  /** 고급 슬롯(기본 UI에서는 접어둠) */
  advanced?: boolean;
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  bible: '성경문구',
  responsive: '교독문',
  hymn: '찬송가',
  praise: '찬양',
  sermon: '설교',
  worshipTitle: '예배 타이틀',
  notice: '공지',
  lowerthird: '하단자막',
  apostlesCreed: '사도신경',
  preacher: '설교자',
  titleScripture: '제목/본문',
  wordTitle: '말씀타이틀',
  pointTitle: '대지타이틀',
  hephzibah: '헵시바 선교단',
  meditation: '본문묵상',
  scripture: '성경본문',
  wordText: '말씀본문',
};

/** 카테고리별 사용 가능한 콘텐츠 필드. `required`=1차 필수, `advanced`=고급 슬롯. */
export const CATEGORY_FIELDS: Record<TemplateCategory, FieldDef[]> = {
  bible: [
    { key: 'body', label: '본문', required: true },
    { key: 'reference', label: '장절표기', required: true },
    { key: 'book', label: '책', advanced: true },
    { key: 'chapter', label: '장', advanced: true },
    { key: 'verse', label: '절', advanced: true },
    { key: 'verseRange', label: '절범위', advanced: true },
    { key: 'translation', label: '번역', advanced: true },
    { key: 'copyright', label: '저작권', advanced: true },
  ],
  responsive: [
    { key: 'body', label: '본문', required: true },
    { key: 'reference', label: '번호/출처', required: true },
    { key: 'leader', label: '인도자', advanced: true },
    { key: 'congregation', label: '회중', advanced: true },
  ],
  hymn: [
    { key: 'body', label: '가사', required: true },
    { key: 'title', label: '제목', required: true },
    { key: 'number', label: '장', required: true },
    { key: 'verseLabel', label: '절/후렴표기', advanced: true },
    { key: 'amen', label: '아멘(마지막 절 전용 · 작게·이탤릭 권장)', advanced: true },
    { key: 'author', label: '작사·작곡', advanced: true },
    { key: 'copyright', label: '저작권', advanced: true },
  ],
  praise: [
    { key: 'body', label: '가사', required: true },
    { key: 'title', label: '제목', required: true },
    { key: 'part', label: '파트', advanced: true },
    { key: 'ccli', label: 'CCLI·저작권', advanced: true },
  ],
  sermon: [
    { key: 'title', label: '제목', required: true },
    { key: 'subtitle', label: '부제', advanced: true },
    { key: 'speaker', label: '설교자', advanced: true },
    { key: 'point', label: '대지', advanced: true },
    { key: 'scriptureRef', label: '본문참조', advanced: true },
  ],
  worshipTitle: [
    { key: 'title', label: '예배명', required: true },
    { key: 'church', label: '교회명', advanced: true },
    { key: 'date', label: '날짜', advanced: true },
    { key: 'sermonTitle', label: '설교제목', advanced: true },
    { key: 'scriptureRef', label: '본문', advanced: true },
  ],
  notice: [
    { key: 'title', label: '제목', required: true },
    { key: 'body', label: '내용', required: true },
  ],
  lowerthird: [
    { key: 'name', label: '이름', required: true },
    { key: 'role', label: '직함/역할', advanced: true },
  ],
  apostlesCreed: [
    { key: 'body', label: '본문', required: true },
    { key: 'title', label: '제목', advanced: true },
  ],
  preacher: [
    { key: 'name', label: '설교자', required: true },
    { key: 'role', label: '직함', advanced: true },
    { key: 'church', label: '소속/교회', advanced: true },
  ],
  titleScripture: [
    { key: 'title', label: '제목', required: true },
    { key: 'scriptureRef', label: '본문', required: true },
    { key: 'reference', label: '장절표기', advanced: true },
  ],
  wordTitle: [
    { key: 'title', label: '말씀제목', required: true },
    { key: 'reference', label: '장절표기', advanced: true },
    { key: 'scriptureRef', label: '본문', advanced: true },
    { key: 'speaker', label: '설교자', advanced: true },
  ],
  pointTitle: [
    { key: 'point', label: '대지', required: true },
    { key: 'pointNumber', label: '대지번호', advanced: true },
  ],
  hephzibah: [
    { key: 'title', label: '단체명', required: true },
    { key: 'body', label: '내용', advanced: true },
    { key: 'member', label: '단원', advanced: true },
  ],
  meditation: [
    { key: 'reference', label: '장절표기', required: true },
    { key: 'verse', label: '절', advanced: true },
    { key: 'body', label: '본문', required: true },
  ],
  scripture: [
    { key: 'reference', label: '장절표기', required: true },
    { key: 'body', label: '본문', required: true },
    { key: 'nextLine', label: '다음섹션 첫 줄', advanced: true },
  ],
  wordText: [
    { key: 'reference', label: '장절표기', required: true },
    { key: 'body', label: '본문', required: true },
  ],
};

export function fieldKeys(category: TemplateCategory): string[] {
  return CATEGORY_FIELDS[category].map((f) => f.key);
}

export function isValidFieldRole(category: TemplateCategory, key: string): boolean {
  return fieldKeys(category).includes(key);
}
