// 연주용 악보 라우트 — 화면 본체는 features/worship-prep-ui 에 있다.
//   /worship/play?team=주일1부&date=2026-08-05   (date 를 빼면 그 팀의 가장 최근 셋)

import PlayViewer from '../../../features/worship-prep-ui/PlayViewer';

export const metadata = { title: '연주용 악보 · UnoWorship Pro' };

export default function Page() {
  return <PlayViewer />;
}
