import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Mise en page des écrans hors application (connexion, étapes obligatoires du compte). */
export function PageCentree({
  titre,
  description,
  children,
}: {
  titre: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-16">
      <p className="text-center text-lg font-semibold tracking-tight">HA-Gestion</p>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{titre}</h1>
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}
