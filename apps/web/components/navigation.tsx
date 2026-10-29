'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export function Navigation({ liens }: { liens: readonly { href: string; libelle: string }[] }) {
  const chemin = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap gap-1">
      {liens.map((lien) => {
        const actif = lien.href === '/' ? chemin === '/' : chemin.startsWith(lien.href);
        return (
          <Link
            key={lien.href}
            href={lien.href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
              actif && 'bg-muted font-medium text-foreground',
            )}
          >
            {lien.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
