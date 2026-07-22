# PPT/Keynote 이미지 슬라이드 제너레이터

키노트 또는 파워포인트에서 내보낸 PNG/JPG 폴더나 정적인 PPT/PPTX 파일을 UnoLive/UnoWorship 콤포우즈 프로그램으로 변환하는 도구입니다.

## 가장 쉬운 흐름

1. `generator/ppt-slides/inbox` 안에 이미지 폴더 또는 PPT/PPTX 파일을 넣습니다.
2. 콤포우즈 페이지 상단 `PPT` 버튼을 눌러 가져옵니다.
3. 저장 분류를 선택합니다.
   - `FILES/01_HYMNS`: 찬송가 / 정규 찬송 자료
   - `FILES/02_PRAISE`: 찬양곡 / 콘티용 악보
4. ATEM DSK/Luma Key로 카메라 위에 얹을 자료는 `ATEM DSK/Luma Key용으로 변환`을 켭니다.

```bash
npm run generate:ppt -- --name "나의 하나님"
```

터미널 명령이 번거로우면 `generator/ppt-slides/이미지슬라이드-생성.command`를 더블클릭한 뒤 프로그램 이름만 입력해도 됩니다.

`--source`를 직접 지정해도 됩니다.

```bash
npm run generate:ppt -- --source "/Users/kimseongju/Downloads/나의하나님_와이드" --name "나의 하나님"
```

## 결과

- 원본 파일이나 폴더는 생성 완료 후 `generator/ppt-slides/inbox/archive/...`로 이동합니다.
- 앱 전용 보관 파일은 `FILES/01_HYMNS/...` 또는 `FILES/02_PRAISE/...`에 저장됩니다.
- 송출용 이미지 파일은 `public/generated/ppt-slides/...` 아래에 정리됩니다.
- 앱에서 읽는 프로그램 파일은 `data/programs/...json`으로 생성됩니다.
- 백업용 manifest는 `generator/ppt-slides/generated/...json`에도 저장됩니다.
- 콤포우즈 페이지에서 바로 프로그램으로 들어오며, 재시작 후에도 `data/programs` 기준으로 다시 불러올 수 있습니다.

## ATEM 키 출력 메모

- `ATEM DSK/Luma Key용으로 변환` ON: 검은 가사/악보선을 흰색으로 추출하고 나머지는 검정으로 렌더링합니다. DSK에서 검정이 빠지고 글자/악보선만 카메라 위에 올라갑니다.
- OFF: PPT 원본 색을 그대로 씁니다. ATEM에서 4번 입력을 화면 전체로 컷/전환해 보여줄 때 사용합니다.

## 옵션

```bash
npm run generate:ppt -- \
  --source "/Users/kimseongju/Downloads/슬라이드폴더" \
  --name "프로그램 이름" \
  --date 20260629 \
  --worship "20260629-주일낮예배" \
  --worship-name "2026.06.29 주일낮예배" \
  --library praise \
  --key-mode luma-invert \
  --fit fill
```

- `--name`: 콤포우즈에 표시될 고유 프로그램 이름입니다.
- `--fit`: `fill`, `contain`, `cover` 중 선택합니다. PPT/키노트 16:9 이미지는 보통 `fill`이 맞습니다.
- `--library`: `hymns`, `praise` 중 선택합니다. 기본값은 `praise`입니다.
- `--key-mode`: `luma-invert`, `none` 중 선택합니다. 기본값은 `luma-invert`입니다.
- `--source`: 생략하면 `inbox` 안에서 가장 최근 이미지 폴더를 자동 사용합니다.

## 현장 운영 메모

슬라이드 이미지는 JSON에 직접 넣지 않고 URL로 참조합니다. 그래서 여러 장을 한 번에 가져와도 로컬 스토어가 과하게 커지지 않고, 송출 캔버스도 더 안정적으로 동작합니다.
