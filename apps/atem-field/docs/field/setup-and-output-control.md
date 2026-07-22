# 방송 설정 정리 + 출력 제어 인벤토리

## 1. 디스플레이 ↔ 역할 ↔ ATEM 매핑
| 맥 디스플레이(이름) | 역할 | 앱 출력창(URL) | 타깃 | ATEM 입력 | ATEM 출력 |
|---|---|---|---|---|---|
| Blackmagic (C-type1) | **Fill** | `/atem-fill` | output | 입력4 | → Out1(회중, PGM) |
| Blackmagic (C-type2) | **Key** | `/atem-key` | output | 입력5 | → Out1(회중, PGM) |
| Blackmagic (HDMI) | **Sub(무대)** | `/atem-sub` | prompt | 입력6 | → Out2(무대) |
| F3278T | (제어용, 라이브 시 분리) | — | — | — | — |

- **메인(회중, Out1)** = Fill+Key 선형 키 → ATEM 카메라 위에 자막. 앱 타깃 `output`.
- **서브(무대, Out2)** = `/atem-sub`, 검정+흰 큰 글자. 앱 타깃 `prompt`.
- 제어 = iPad/노트북 원격(`http://맥IP:3000/composer`). **F3278T는 라이브 때 분리**(맥 3화면 한계).

### 디스플레이 이름·정렬 주의
- macOS는 **디스플레이 이름 변경 불가**(EDID 기준). 서브는 `Blackmagic(3)` 로 잡힘.
- Blackmagic 2개(Fill/Key)는 **동일 EDID → 1/2 번호가 재부팅 시 뒤섞일 수 있음**.
- 안정화: ①부팅 시 전부 연결+핫스왑 금지 ②출력창 라벨(FILL/KEY/SUB)+ATEM 멀티뷰로 확인, 뒤바뀌면 **입력4·5 케이블 교환** ③근본책=Fill/Key에 서로 다른 어댑터(EDID 구분).

## 2. 출력 제어 인벤토리 (구현된 것)
| 기능 | 위치 | 설명 |
|---|---|---|
| **타깃** | `CanvasRenderTarget` = `output`/`prompt`/`broadcast` | 출력 채널 구분 |
| **요소별 라우팅** | `visibleOn` (요소 필드), 편집=`ElementPanel` | 요소를 어느 출력에 보일지 |
| **출력 라우트** | `/atem-fill`·`/atem-key`(output), `/atem-sub`(prompt), `/main`·`/output`(output), `/atem-main` | 각 창이 자기 타깃 요소만 렌더 |
| **프롬프트 레이아웃** | `promptLayout` (프로그램별), 선택=`ChoirPromptLayoutSelector` | `black-white`(성가·구현), `youtube-dance`·`bible`(향후) |
| **송출 모드** | `promptSendMode` = `normal`/`prompt-only` | 전체 vs 무대 전용 |
| **큐매크로** | `SectionCueMacro` | 섹션별 타깃·전환·블랙아웃 |
| **템플릿** | `applyTemplate`, `data/templates/*.json` | fieldRole(title/body/reference) 바인딩, visibleOn 저장 |

### 핵심: 한 번 송출 → 양쪽 별도 디자인
- `normal` 송출은 output·prompt 둘 다 도달. 각 창이 `visibleOn`/`promptLayout`으로 **자기 디자인만** 렌더.
- 출력별 라우팅(visibleOn 커스텀) 섹션은 자동으로 raw 요소 전송 → 각 타깃 정확 필터.

## 3. 성가(찬양대) 시나리오 — 이미 구현
| 출력 | 결과 | 구현 |
|---|---|---|
| 메인(회중) | 카메라 + 얇은 가사 | Fill/Key 기본 자막 |
| 서브(무대) | **검정 배경 + 큰 흰 가사 + 다음 첫 줄** | `promptLayout: 'black-white'` (choirPromptLayoutRenderer, 현재 136px 흰 글자 / 다음줄 68px 회색) |

### 성가 테스트 절차
1. (iPad/노트북) 컴포즈에서 성가 프로그램 생성, **찬양대 PMT 선택기 → `블랙 + 흰색 가사(black-white)`**.
2. 맥 HDMI 화면에 `/atem-sub` 전체화면 → ATEM 입력6.
3. ATEM: **Out2 = 입력6**.
4. 송출 → 메인=얇은 가사(카메라 위 키), 서브=검정+흰 큰 글자+다음 줄.
5. 라벨/멀티뷰로 입력4/5/6 매핑 확인.

## 4. 향후 (다른 시나리오 = promptLayout 개발)
- **율동**: `youtube-dance` (안무 영상+가사) — 현재 stub.
- **설교**: `bible` (성경 본문 큰 글자) — 현재 stub.
- 성가와 동일 패턴: 프로그램 promptLayout 지정 → 서브가 그 레이아웃 렌더.
