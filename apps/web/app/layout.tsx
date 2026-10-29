import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Geist } from 'next/font/google';

import { cn } from '@/lib/utils';

import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'HA-Gestion',
  description: 'Gestion interne du réseau de centres d’audioprothèse',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={cn('font-sans', geist.variable)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
