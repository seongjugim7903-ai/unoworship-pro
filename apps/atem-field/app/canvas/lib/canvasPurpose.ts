export type CanvasPurposeId =
  | 'worship-output'
  | 'prompt-output'
  | 'sermon-title'
  | 'youtube-thumbnail'
  | 'sns-square'
  | 'bulletin-a4'
  | 'flyer-a5'
  | 'leaflet'
  | 'poster'
  | 'banner'
  | 'business-card'
  | 'shaped-business-card'
  | 'sticker'
  | 'pop-display'
  | 'board-sign'
  | 'envelope'
  | 'package'
  | 'fan'
  | 'id-card'
  | 'calendar'
  | 'paper-holder'
  | 'cup-carrier'
  | 'goods-print';

export type CanvasPurpose = {
  id: CanvasPurposeId;
  label: string;
  group: '예배 화면' | '온라인 콘텐츠' | '인쇄/홍보';
  sizeLabel: string;
  canvasWidth: number;
  canvasHeight: number;
  unit: 'px' | 'mm';
  defaultProjectName: string;
  templateLead: string;
  outputHint: string;
  sourceCutline?: {
    vendor: 'wowpress';
    vendorLabel: string;
    fileName: string;
    url: string;
    status: 'profile-ready' | 'source-only';
    note?: string;
  };
  printGuide?: {
    trimWidthMm: number;
    trimHeightMm: number;
    bleedMm: number;
    safeInsetMm: number;
    workWidthMm: number;
    workHeightMm: number;
  };
  templates: {
    id: string;
    title: string;
    description: string;
  }[];
};

const WOWPRESS_CUTLINE_BASE = 'https://wowpress.co.kr/wow2.0/cutline';

function wowpressCutline(fileName: string, note?: string, status: 'profile-ready' | 'source-only' = 'source-only'): CanvasPurpose['sourceCutline'] {
  return {
    vendor: 'wowpress',
    vendorLabel: '와우프레스',
    fileName,
    url: `${WOWPRESS_CUTLINE_BASE}/${fileName}`,
    status,
    note,
  };
}

export const CANVAS_PURPOSES: CanvasPurpose[] = [
  {
    id: 'worship-output',
    label: '예배 송출 화면',
    group: '예배 화면',
    sizeLabel: '1920 x 1080 px',
    canvasWidth: 1920,
    canvasHeight: 1080,
    unit: 'px',
    defaultProjectName: '예배 송출 화면 디자인',
    templateLead: '강대상/성도 화면용 16:9 디자인을 고릅니다.',
    outputHint: 'PNG, 투명 배경, Composer 송출용 저장을 우선 준비합니다.',
    templates: [
      { id: 'lower-third', title: '하단 자막 기본형', description: '영상 위에 가사와 본문을 얹기 좋은 하단 자막' },
      { id: 'full-lyrics', title: '전체 화면 가사형', description: '배경과 큰 가사를 함께 쓰는 예배 화면' },
    ],
  },
  {
    id: 'prompt-output',
    label: '프롬프트 화면',
    group: '예배 화면',
    sizeLabel: '1920 x 1080 px',
    canvasWidth: 1920,
    canvasHeight: 1080,
    unit: 'px',
    defaultProjectName: '프롬프트 화면 디자인',
    templateLead: '무대에서 보기 쉬운 큰 글자 중심 템플릿입니다.',
    outputHint: '검정 배경, 큰 흰색 글자, 컷 전환 기준으로 준비합니다.',
    templates: [
      { id: 'black-white', title: '검정 배경 + 흰색 가사', description: '찬양팀과 강단에서 가장 안정적으로 보는 형태' },
      { id: 'next-line', title: '현재/다음 줄 표시형', description: '현재 가사와 다음 가사를 함께 확인하는 형태' },
    ],
  },
  {
    id: 'sermon-title',
    label: '설교 타이틀',
    group: '예배 화면',
    sizeLabel: '1920 x 1080 px',
    canvasWidth: 1920,
    canvasHeight: 1080,
    unit: 'px',
    defaultProjectName: '설교 타이틀 디자인',
    templateLead: '설교 제목, 본문, 설교자 정보를 담는 화면입니다.',
    outputHint: '예배 순서 정보와 연결해 송출용 화면으로 저장합니다.',
    templates: [
      { id: 'clean-title', title: '본문 강조형', description: '설교 제목과 성경 본문을 차분하게 배치' },
      { id: 'photo-title', title: '이미지 배경형', description: '사진/영상 배경 위에 타이틀을 올리는 형태' },
    ],
  },
  {
    id: 'youtube-thumbnail',
    label: '유튜브 썸네일',
    group: '온라인 콘텐츠',
    sizeLabel: '1280 x 720 px',
    canvasWidth: 1280,
    canvasHeight: 720,
    unit: 'px',
    defaultProjectName: '유튜브 썸네일 디자인',
    templateLead: '설교/예배 영상 업로드용 썸네일입니다.',
    outputHint: 'JPG/PNG, 모바일 가독성, 큰 제목 대비를 체크합니다.',
    templates: [
      { id: 'sermon-thumb', title: '설교 썸네일', description: '설교 제목과 설교자 사진을 강조하는 형태' },
      { id: 'worship-thumb', title: '예배 다시보기', description: '예배명과 날짜가 잘 보이는 썸네일' },
    ],
  },
  {
    id: 'sns-square',
    label: 'SNS 정사각형',
    group: '온라인 콘텐츠',
    sizeLabel: '1080 x 1080 px',
    canvasWidth: 1080,
    canvasHeight: 1080,
    unit: 'px',
    defaultProjectName: 'SNS 이미지 디자인',
    templateLead: '교회 소식과 카드뉴스에 쓰는 정사각형 이미지입니다.',
    outputHint: '모바일 피드 가독성과 이미지 압축 품질을 확인합니다.',
    templates: [
      { id: 'notice-card', title: '교회 소식 카드', description: '행사명, 날짜, 장소를 빠르게 알리는 카드' },
      { id: 'quote-card', title: '말씀 카드', description: '짧은 말씀/문구를 이미지로 공유하는 형태' },
    ],
  },
  {
    id: 'bulletin-a4',
    label: '주보 A4',
    group: '인쇄/홍보',
    sizeLabel: 'A4 / PDF',
    canvasWidth: 210,
    canvasHeight: 297,
    unit: 'mm',
    defaultProjectName: '주보 A4 디자인',
    templateLead: '주보 표지와 인쇄용 PDF를 준비합니다.',
    outputHint: 'PDF, 여백, 안전선, 도련, 해상도 검사를 준비합니다.',
    templates: [
      { id: 'bulletin-cover', title: '주보 표지', description: '예배 정보와 대표 이미지를 담는 표지' },
      { id: 'bulletin-info', title: '안내면', description: '교회 소식과 예배 순서를 담는 안내면' },
    ],
  },
  {
    id: 'flyer-a5',
    label: '전단지',
    group: '인쇄/홍보',
    sizeLabel: '150 x 213 mm 작업 / 재단 147 x 210 mm',
    canvasWidth: 150,
    canvasHeight: 213,
    unit: 'mm',
    defaultProjectName: '전단지 디자인',
    templateLead: '행사 초대와 교회 홍보용 전단입니다. 와우프레스 합판전단 A5(국16절) 칼선 기준입니다.',
    outputHint: '주황=작업선, 분홍=재단선/칼선, 초록=안전영역입니다. 최종 출력에는 가이드선이 포함되지 않습니다.',
    sourceCutline: wowpressCutline('mix_flyer.zip', '와우프레스 합판전단 A5(국16절) 147x210mm 원본 칼선 기준입니다.', 'profile-ready'),
    printGuide: {
      trimWidthMm: 147,
      trimHeightMm: 210,
      bleedMm: 1.5,
      safeInsetMm: 3,
      workWidthMm: 150,
      workHeightMm: 213,
    },
    templates: [
      { id: 'event-flyer', title: '행사 초대장', description: '수련회, 집회, 세미나 안내에 적합한 형태' },
      { id: 'church-flyer', title: '교회 소개', description: '교회 위치와 예배 시간을 안내하는 형태' },
    ],
  },
  {
    id: 'leaflet',
    label: '리플릿',
    group: '인쇄/홍보',
    sizeLabel: 'A4 3단 대표 / PDF',
    canvasWidth: 210,
    canvasHeight: 297,
    unit: 'mm',
    defaultProjectName: '리플릿 디자인',
    templateLead: '교회 소개, 행사 안내, 교육 과정 소개용 접지 리플릿입니다.',
    outputHint: '접지선과 면 순서가 중요합니다. 와우프레스 대량/소량 리플릿 칼선 기준을 프리셋화합니다.',
    sourceCutline: wowpressCutline('large_r_v1.zip', '대량리플릿/소량리플릿은 접지 종류별 상세 프리셋이 필요합니다.'),
    templates: [
      { id: 'church-intro-leaflet', title: '교회 소개 3단', description: '교회 소개와 예배 안내를 접지면으로 나누는 형태' },
      { id: 'event-leaflet', title: '행사 안내 리플릿', description: '행사 일정과 프로그램을 면별로 정리하는 형태' },
    ],
  },
  {
    id: 'poster',
    label: '포스터',
    group: '인쇄/홍보',
    sizeLabel: 'A3 대표 / PDF',
    canvasWidth: 297,
    canvasHeight: 420,
    unit: 'mm',
    defaultProjectName: '포스터 디자인',
    templateLead: '교회 행사, 집회, 모집 공고용 포스터입니다.',
    outputHint: '대표 A3 작업판입니다. 대량/소량 포스터 칼선 기준을 분리해 확장합니다.',
    sourceCutline: wowpressCutline('large_poster.zip', '대량포스터/소량포스터는 상품별 출력 규격 확인이 필요합니다.'),
    templates: [
      { id: 'event-poster', title: '행사 포스터', description: '행사명, 날짜, 장소를 크게 배치하는 형태' },
      { id: 'recruit-poster', title: '모집 포스터', description: '대상과 신청 정보를 강조하는 형태' },
    ],
  },
  {
    id: 'banner',
    label: '현수막',
    group: '인쇄/홍보',
    sizeLabel: '가로형 대형 출력',
    canvasWidth: 900,
    canvasHeight: 300,
    unit: 'mm',
    defaultProjectName: '현수막 디자인',
    templateLead: '대형 출력용 문구와 이미지를 배치합니다. 와우프레스 일반/족자/대형 현수막 및 배너 칼선 기준으로 확장합니다.',
    outputHint: '큰 글자, 먼 거리 가독성, 출력 비율을 확인합니다. 대형 출력은 300dpi 대신 상품별 권장 해상도를 따릅니다.',
    sourceCutline: wowpressCutline('sign_b2.zip', '일반현수막 기본 파일입니다. 족자형/대형/배너류는 별도 프리셋으로 분리합니다.'),
    templates: [
      { id: 'event-banner', title: '행사 현수막', description: '행사명과 날짜가 멀리서 보이는 형태' },
      { id: 'welcome-banner', title: '환영 현수막', description: '환영 문구와 교회명을 강조하는 형태' },
    ],
  },
  {
    id: 'business-card',
    label: '명함',
    group: '인쇄/홍보',
    sizeLabel: '98 x 52 mm 작업 / 재단 96 x 50 mm',
    canvasWidth: 98,
    canvasHeight: 52,
    unit: 'mm',
    defaultProjectName: '명함 디자인',
    templateLead: '와우프레스 명함 기준입니다. 작업판은 사방 1mm 도련을 포함합니다.',
    outputHint: '주황=작업선, 분홍=재단선/칼선, 초록=안전영역입니다.',
    sourceCutline: wowpressCutline('namecard_v1.zip', '와우프레스 명함 원본 칼선 zip입니다.', 'profile-ready'),
    printGuide: {
      trimWidthMm: 96,
      trimHeightMm: 50,
      bleedMm: 1,
      safeInsetMm: 1.5,
      workWidthMm: 98,
      workHeightMm: 52,
    },
    templates: [
      { id: 'pastor-card', title: '교역자 명함', description: '이름, 직분, 연락처 중심의 명함' },
      { id: 'ministry-card', title: '부서 명함', description: '부서명과 대표 연락처를 담는 명함' },
    ],
  },
  {
    id: 'shaped-business-card',
    label: '모양 명함',
    group: '인쇄/홍보',
    sizeLabel: '명함 변형 / 칼선 선택',
    canvasWidth: 98,
    canvasHeight: 52,
    unit: 'mm',
    defaultProjectName: '모양 명함 디자인',
    templateLead: '라운드, 특수 형태 등 모양 명함을 준비하는 작업판입니다.',
    outputHint: '모양 칼선은 최종 접수 파일에서 별도 확인이 필요합니다.',
    sourceCutline: wowpressCutline('namecard_img_v3.zip', '모양명함 칼선 원본입니다. 형태별 세부 프리셋 생성이 필요합니다.'),
    templates: [
      { id: 'round-card', title: '라운드 명함', description: '부드러운 모서리와 로고 중심 명함' },
      { id: 'accent-card', title: '포인트 모양 명함', description: '한쪽 모서리에 시각 포인트를 주는 형태' },
    ],
  },
  {
    id: 'sticker',
    label: '스티커',
    group: '인쇄/홍보',
    sizeLabel: '100 x 100 mm 대표',
    canvasWidth: 100,
    canvasHeight: 100,
    unit: 'mm',
    defaultProjectName: '스티커 디자인',
    templateLead: '사각, 도무송, 원형, 자유형 스티커를 위한 디자인입니다.',
    outputHint: '스티커는 칼선 모양과 여백 검사가 중요합니다. 세부 형태별 프리셋으로 확장합니다.',
    sourceCutline: wowpressCutline('square_sticker.zip', '사각/도무송/판스티커/자석스티커 계열로 확장합니다.'),
    templates: [
      { id: 'logo-sticker', title: '로고 스티커', description: '교회 로고나 행사 로고를 담는 기본 스티커' },
      { id: 'label-sticker', title: '라벨 스티커', description: '소그룹, 부서, 물품 라벨에 쓰는 형태' },
    ],
  },
  {
    id: 'pop-display',
    label: 'POP/배너 진열물',
    group: '인쇄/홍보',
    sizeLabel: '스탠드/미니배너 대표',
    canvasWidth: 300,
    canvasHeight: 600,
    unit: 'mm',
    defaultProjectName: 'POP 배너 디자인',
    templateLead: '스탠드POP, PET배너, 미니배너 등 세워두는 홍보물입니다.',
    outputHint: '거치대 형태와 상하 여백을 확인해야 합니다. 상품별 칼선 프리셋이 필요합니다.',
    sourceCutline: wowpressCutline('standpop_v2024_nnv1.zip', '스탠드POP과 배너류는 거치 방식별로 분리합니다.'),
    templates: [
      { id: 'welcome-pop', title: '입구 안내 POP', description: '예배당 입구나 로비 안내용 세로형 디자인' },
      { id: 'event-pop', title: '행사 홍보 POP', description: '행사명과 QR 정보를 강조하는 형태' },
    ],
  },
  {
    id: 'board-sign',
    label: '보드/시트/입간판',
    group: '인쇄/홍보',
    sizeLabel: 'A2 대표 / 대형 출력',
    canvasWidth: 420,
    canvasHeight: 594,
    unit: 'mm',
    defaultProjectName: '보드 사인 디자인',
    templateLead: '보드, 시트지, 철제입간판 등 공간 안내 사인물입니다.',
    outputHint: '실측 크기와 설치 위치가 중요합니다. 업체별 재질/재단 옵션을 프리셋으로 분리합니다.',
    sourceCutline: wowpressCutline('board.zip', '보드/시트지/철제입간판 계열로 확장합니다.'),
    templates: [
      { id: 'direction-sign', title: '방향 안내 사인', description: '예배실, 교육관, 주차장 안내에 쓰는 형태' },
      { id: 'standing-sign', title: '입간판 디자인', description: '외부 방문자를 위한 안내형 입간판' },
    ],
  },
  {
    id: 'envelope',
    label: '봉투',
    group: '인쇄/홍보',
    sizeLabel: '규격 봉투 / 칼선 선택',
    canvasWidth: 220,
    canvasHeight: 105,
    unit: 'mm',
    defaultProjectName: '봉투 디자인',
    templateLead: '헌금봉투, 행정봉투, 안내문 발송 봉투 디자인입니다.',
    outputHint: '봉투는 접힘, 풀칠, 창 위치가 중요합니다. 칼라/마스타/소량 봉투별 프리셋이 필요합니다.',
    sourceCutline: wowpressCutline('color_env_v03.zip', '칼라봉투, 마스타봉투, 소량봉투로 확장합니다.'),
    templates: [
      { id: 'offering-envelope', title: '헌금봉투', description: '헌금 종류와 교회명을 배치하는 형태' },
      { id: 'office-envelope', title: '행정봉투', description: '교회 주소와 로고를 담는 기본 봉투' },
    ],
  },
  {
    id: 'package',
    label: '패키지',
    group: '인쇄/홍보',
    sizeLabel: '패키지 / 칼선 선택',
    canvasWidth: 300,
    canvasHeight: 300,
    unit: 'mm',
    defaultProjectName: '패키지 디자인',
    templateLead: '선물 박스, 행사 키트, 교회 굿즈 패키지 디자인입니다.',
    outputHint: '접힘선, 풀칠면, 전개도 방향을 반드시 확인해야 합니다.',
    sourceCutline: wowpressCutline('package_new.zip', '패키지 전개도는 형태별 분석 후 프리셋화해야 합니다.'),
    templates: [
      { id: 'gift-package', title: '선물 패키지', description: '행사 기념품이나 환영 선물용 패키지' },
      { id: 'kit-package', title: '교육 키트 패키지', description: '교재와 물품을 담는 키트 박스' },
    ],
  },
  {
    id: 'fan',
    label: '부채/썬캡',
    group: '인쇄/홍보',
    sizeLabel: '판촉물 / 칼선 선택',
    canvasWidth: 190,
    canvasHeight: 190,
    unit: 'mm',
    defaultProjectName: '부채 판촉물 디자인',
    templateLead: '여름 행사, 전도 행사, 수련회용 부채와 썬캡 디자인입니다.',
    outputHint: '제품 모양 칼선 안쪽에 주요 내용을 배치해야 합니다.',
    sourceCutline: wowpressCutline('pp_v1.zip', 'PP부채와 종이썬캡 계열로 확장합니다.'),
    templates: [
      { id: 'summer-fan', title: '여름 부채', description: '시원한 이미지와 교회 정보를 담는 형태' },
      { id: 'camp-fan', title: '수련회 부채', description: '수련회 주제와 일정 정보를 담는 형태' },
    ],
  },
  {
    id: 'id-card',
    label: '명찰/사원증',
    group: '인쇄/홍보',
    sizeLabel: '90 x 55 mm 대표',
    canvasWidth: 90,
    canvasHeight: 55,
    unit: 'mm',
    defaultProjectName: '명찰 사원증 디자인',
    templateLead: '교회 스태프, 봉사자, 행사 참가자용 명찰과 사원증입니다.',
    outputHint: '사진, 이름, 역할, QR/바코드 영역을 분리해 디자인합니다.',
    sourceCutline: wowpressCutline('nametag.zip', '명찰과 사원증 파일을 분리해 확장합니다.'),
    templates: [
      { id: 'staff-id', title: '봉사자 명찰', description: '이름과 역할을 크게 보여주는 형태' },
      { id: 'event-pass', title: '행사 패스', description: '참가자 구분과 QR 확인에 적합한 형태' },
    ],
  },
  {
    id: 'calendar',
    label: '캘린더',
    group: '인쇄/홍보',
    sizeLabel: '탁상형 대표',
    canvasWidth: 210,
    canvasHeight: 150,
    unit: 'mm',
    defaultProjectName: '캘린더 디자인',
    templateLead: '교회 연간 캘린더, 말씀 캘린더, 선물용 탁상 달력입니다.',
    outputHint: '월별 반복 페이지와 제본/스탠드 구조를 고려해야 합니다.',
    sourceCutline: wowpressCutline('small_c_v2.zip', '우드스탠드/소량탁상용 캘린더 계열로 확장합니다.'),
    templates: [
      { id: 'monthly-calendar', title: '월별 캘린더', description: '월별 사진과 말씀을 배치하는 형태' },
      { id: 'church-calendar', title: '교회 일정 캘린더', description: '절기와 예배 일정을 강조하는 형태' },
    ],
  },
  {
    id: 'paper-holder',
    label: '홀더/책받침',
    group: '인쇄/홍보',
    sizeLabel: 'A4 홀더 대표',
    canvasWidth: 220,
    canvasHeight: 310,
    unit: 'mm',
    defaultProjectName: '홀더 디자인',
    templateLead: '교회 소개 자료, 등록 서류, 교육 자료를 담는 홀더류입니다.',
    outputHint: '접힘선과 포켓 영역을 피해 주요 내용을 배치합니다.',
    sourceCutline: wowpressCutline('paperholder_n.zip', '종이홀더, PP홀더, 책받침 계열로 확장합니다.'),
    templates: [
      { id: 'welcome-holder', title: '새가족 자료 홀더', description: '새가족 안내 자료를 담는 교회 브랜딩 홀더' },
      { id: 'academy-holder', title: '교육 자료 홀더', description: '아카데미와 세미나 자료용 홀더' },
    ],
  },
  {
    id: 'cup-carrier',
    label: '컵/음료 캐리어',
    group: '인쇄/홍보',
    sizeLabel: '제품 칼선 선택',
    canvasWidth: 200,
    canvasHeight: 120,
    unit: 'mm',
    defaultProjectName: '컵 캐리어 디자인',
    templateLead: '카페, 행사 부스, 환영 음료용 컵과 음료 캐리어 디자인입니다.',
    outputHint: '곡면/접힘면 때문에 업체 칼선 해석 후 프리셋화가 필요합니다.',
    sourceCutline: wowpressCutline('papercup.zip', '종이컵, 투명컵, 음료캐리어 계열로 확장합니다.'),
    templates: [
      { id: 'church-cup', title: '교회 카페 컵', description: '교회 로고와 짧은 문구를 넣는 컵 디자인' },
      { id: 'event-carrier', title: '행사 음료 캐리어', description: '행사명과 후원 정보를 담는 캐리어 디자인' },
    ],
  },
  {
    id: 'goods-print',
    label: '소형 굿즈',
    group: '인쇄/홍보',
    sizeLabel: '굿즈 / 칼선 선택',
    canvasWidth: 100,
    canvasHeight: 100,
    unit: 'mm',
    defaultProjectName: '소형 굿즈 디자인',
    templateLead: '마스킹테이프, 폴라로이드팩, 틴케이스, 냅킨 등 작은 굿즈 디자인입니다.',
    outputHint: '제품별 가공선과 반복 패턴 여부를 확인해야 합니다.',
    sourceCutline: wowpressCutline('masking_tape_n.zip', '마스킹테이프, 폴라로이드팩, 틴케이스, 냅킨 계열로 확장합니다.'),
    templates: [
      { id: 'small-gift', title: '기념 굿즈', description: '교회 행사 기념품에 맞춘 작은 디자인' },
      { id: 'pattern-goods', title: '패턴 굿즈', description: '반복 패턴과 로고를 활용하는 굿즈 디자인' },
    ],
  },
];

export function getCanvasPurpose(id: string | null | undefined): CanvasPurpose | null {
  if (!id) return null;
  return CANVAS_PURPOSES.find((purpose) => purpose.id === id) ?? null;
}
