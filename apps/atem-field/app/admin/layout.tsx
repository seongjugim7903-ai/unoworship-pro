import type { ReactNode } from 'react';
import { AdminConsoleShell } from '@/components/admin/AdminConsoleShell';
import { UnoWorshipMarketingLayout } from '@/components/marketing/UnoWorshipMarketingLayout';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <UnoWorshipMarketingLayout>
      <AdminConsoleShell>{children}</AdminConsoleShell>
    </UnoWorshipMarketingLayout>
  );
}
