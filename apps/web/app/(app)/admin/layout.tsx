import type { ReactNode } from 'react';

import { LIENS_ADMINISTRATION, SousNavigation } from '@/components/sous-navigation';
import { requireRole } from '@/server/auth/gardes';

export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await requireRole('ADMIN_CLIENT');
  return (
    <div className="grid gap-6">
      <SousNavigation liens={LIENS_ADMINISTRATION} />
      {children}
    </div>
  );
}
