import { Suspense } from 'react';
import FellowshipPage from '@/components/media/fellowship/FellowshipPage';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-sm text-gray-400">자막협조 로딩 중...</p>
        </div>
      }
    >
      <FellowshipPage />
    </Suspense>
  );
}
