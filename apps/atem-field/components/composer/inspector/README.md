# 신형 요소 속성창 (Element Inspector v2)

> 2026-07-08. 도형·텍스트·이미지 캔버스 요소의 속성 편집 UI를 새 폴더에 재구현.
> **기존 패널(ElementPanel/TextPanel)은 무변경 유지** — BottomPanels의 토글로 신/구형 전환,
> 문제 시 토글 하나(또는 이 폴더 삭제 + BottomPanels 원복)로 즉시 롤백.

## 1. 리서치 요약

### 디자인 툴 인스펙터 관행 (Figma/Canva/Keynote 계열)
- **선택 요소 헤더**: 타입 아이콘 + 이름, 잠금/표시 토글이 최상단.
- **Transform 4칸 그리드**: X·Y·W·H를 2×2 숫자 필드로 — 가장 자주 쓰는 값이 항상 위.
- **접이식 섹션**: 채우기/테두리/효과/타이포를 섹션으로 나누고 접기 — 좁은 패널에서 스크롤 최소화.
- **토글 + 상세**: 그림자·그라디언트 같은 효과는 "체크박스 켜면 상세 필드 노출" 패턴.
- **세그먼트 컨트롤**: 정렬(좌/중/우)처럼 배타 선택은 드롭다운 대신 버튼 그룹.
- **색상 = 스와치 + hex 입력** 병행.

### 이 도메인 고유 요구 (일반 툴에 없는 것)
- **출력 라우팅(visibleOn)**: 요소를 메인(회중)/무대/방송 중 어디에 표시할지 — 듀얼아웃의 핵심.
- **고정 레이어(fixedLayer)**: 섹션이 바뀌어도 계속 송출되는 요소.
- **이미지 keyMode(luma-invert)**: 악보/가사 이미지를 키 신호로 추출하는 방송 전용 옵션.
- 라이브 안전: 편집은 로컬 상태만 변경, 송출은 명시 재송출로만 (기존 원칙 그대로 — 이
  인스펙터는 `updateElement`만 호출하고 어떤 소켓 송출도 하지 않는다).

### 요소 타입별 속성 인벤토리 (lib/canvasTypes.ts 기준)
| 그룹 | 속성 |
|---|---|
| 공통 Transform | x, y, width, height(%), rotation(°), opacity |
| 공통 Arrange | zIndex(앞/뒤), locked, visible |
| 공통 출력 | visibleOn(output/prompt/broadcast), fixedLayer |
| 텍스트 | content, fontFamily, fontSize, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, color, strokeColor+Width, autoFit, useGradient+gradient |
| 도형 | shapeType(rect/ellipse/roundRect/line), fill+fillOpacity, stroke+strokeWidth, cornerRadius, useGradient+gradient(angle+stops), useShadow+shadow, useGlow+glow |
| 이미지 | objectFit, blendMode, cornerRadius, stroke+strokeWidth, keyMode, useShadow+shadow, useGlow+glow |
| 제외(v1) | motion(모션 시퀀스 — 별도 모듈 소관), eraserMask, clipMaskId, gradientMask, imageFill, cornerRadii(개별 코너) |

## 2. 구조

```
inspector/
├── README.md            ← 이 문서
├── controls.tsx         ← 공용 소형 컨트롤 (Section·Num·ColorIn·Seg·Toggle·Sel)
└── ElementInspector.tsx ← 메인 — 선택 요소 해석 + 타입별 섹션 조립
```

- 데이터 흐름: `useStore`에서 선택 요소 해석(TextPanel과 동일 패턴) →
  `undoManager.pushState` + `updateElement(setlistId, itemId, sectionId, elId, updates)`.
- 부착점: `BottomPanels.tsx`의 PanelContent 1곳 — '요소 설정' 열을 신형으로 교체하는 토글
  (localStorage `unolive-inspector-v2`). '텍스트 설정' 열은 신형 사용 시 안내만 표시
  (타이포가 신형에 통합되므로).

## 3. 롤백

- 토글 끄기: 패널 상단 "구형으로" 버튼 (즉시).
- 완전 제거: 이 폴더 삭제 + BottomPanels.tsx의 토글 분기 제거 (커밋 1개 되돌리기).
