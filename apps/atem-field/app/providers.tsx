'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import LocalRuntimeLoginOverlay from '@/components/auth/LocalRuntimeLoginOverlay';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LocalRuntimeLoginOverlay>{children}</LocalRuntimeLoginOverlay>
    </AuthProvider>
  );
}
