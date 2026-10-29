import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function EntetePage({
  titre,
  action,
  children,
}: {
  titre: string;
  action?: { href: string; libelle: string };
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
        {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {action ? (
        <Button asChild>
          <Link href={action.href}>{action.libelle}</Link>
        </Button>
      ) : null}
    </div>
  );
}
