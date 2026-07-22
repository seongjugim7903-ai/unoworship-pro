# Settings 모듈

UnoLive의 **글로벌 설정** 도메인. 에디터/아웃풋/송출 등 각 영역을 가로지르는 사용자 선호(preference)를 한 곳에서 관리합니다.

## 폴더 구조

```
lib/settings/
├── settingsTypes.ts     ← 카테고리별 타입 + 기본값
├── settingsStore.ts     ← Zustand + persist
└── README.md            ← (이 문서)

hooks/settings/
└── useSettings.ts       ← 카테고리별 getter/setter

components/composer/settings/
├── SettingsButton.tsx       ← MiddleTopMenu 톱니 아이콘
├── SettingsModal.tsx        ← 좌측 내비 + 우측 콘텐츠 쉘
├── categories/
│   ├── GeneralSettings.tsx
│   ├── EditorSettings.tsx
│   ├── OutputSettings.tsx
│   ├── BroadcastSettings.tsx
│   ├── ShortcutSettings.tsx
│   └── AboutSettings.tsx
└── index.ts
```

## 설계 원칙

### 1. 도메인 분리
- 브로드캐스트 **세부** 설정(스트림 키, RTMP URL, 녹화 품질 등) → `lib/broadcast/broadcastStore.ts`
- 브로드캐스트 **정책** 설정(자동 재연결, 종료 확인 등) → `lib/settings/settingsStore.ts` → `broadcastGlobal`
- 섹션/워십 데이터 → `lib/store.ts`
- 독립 캔버스 에디터 → `app/canvas/lib/canvasStore.ts`

### 2. persist 전략
전 카테고리를 localStorage에 영속화하되, 민감 정보는 포함하지 않음. 스트림 키는 broadcastStore에 격리.

### 3. 카테고리 추가 가이드
새 카테고리를 추가할 때:
1. `settingsTypes.ts` 에 인터페이스 + DEFAULT 상수 추가
2. `SettingsState` 와 `DEFAULT_SETTINGS_STATE` 확장
3. `settingsStore.ts` 에 update/reset 액션 추가
4. `categories/` 에 새 패널 파일 생성
5. `SettingsModal.tsx` 의 `NAV_ITEMS` + 렌더 분기에 등록

### 4. Phase 로드맵
- **Phase 1 (현재)**: UI 셸 + 주요 설정 표시 + localStorage persist
- **Phase 2**: 단축키 커스터마이즈 + 설정 검색 + import/export JSON
- **Phase 3**: 클라우드 동기화 (로그인 시 서버 저장)
- **Phase 4**: 프로필(여러 설정 세트) + 교회별 템플릿

## 카테고리 요약

| 카테고리 | 키 | 주요 항목 |
|---------|-----|----------|
| 일반 | `general` | 언어, 테마, 자동 저장, 세션 복원 |
| 에디터 | `editor` | 그리드, 스마트 가이드, 스냅, 넛지 단위 |
| 아웃풋 | `output` | 해상도, 풀스크린 모니터, 전환 효과 |
| 송출 | `broadcastGlobal` | 종료 확인, 자동 재연결, 자동 다운로드 |
| 단축키 | (읽기 전용) | 전체 단축키 참조 |
| 정보 | (읽기 전용) | 버전, 빌드, 라이선스 |
