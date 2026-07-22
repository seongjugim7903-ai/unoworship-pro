// 찬양대 무대 sub모니터 이미지 공유 페이지 (모바일 뷰어, 로그인 불필요)
//   카톡 등으로 링크를 받은 사람이 섹션별 검정 배경 큰 글자 이미지를 보고 개별 다운로드한다.

import ChoirPromptShareView from '@/components/share/ChoirPromptShareView';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="min-h-dvh bg-gray-50 text-gray-900">
      <ChoirPromptShareView id={id} />
    </main>
  );
}
