'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Largeur de lecture partout, sauf sur l'agenda : la vue multi-praticiens a besoin de la page entière. */
export function ConteneurPage({ children }: { children: ReactNode }) {
  const pleineLargeur = usePathname().startsWith('/agenda');
  return <div className={cn('mx-auto', !pleineLargeur && 'max-w-6xl')}>{children}</div>;
}
