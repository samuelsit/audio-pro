import type { ReactNode } from 'react';

import { requireRole } from '@/server/auth/gardes';

export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await requireRole('ADMIN');
  return children;
}
