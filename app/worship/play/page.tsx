// 연주용 악보 보기 라우트 — 반주자 아이패드에서 이 주소를 북마크해 쓴다.
//   /worship/play?team=주일1부&date=2026-08-05   (date 를 빼면 그 팀의 가장 최근 셋)

import PlayViewer from './PlayViewer';

export const metadata = {
  title: '연주용 악보 · UnoWorship Pro',
};

export default function WorshipPlayPage() {
  return <PlayViewer />;
}
