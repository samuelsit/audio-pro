import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { requireSession } from '@/server/auth/gardes';

import { FormulaireOuverture } from '../formulaires';

export const metadata: Metadata = { title: 'Nouveau ticket SAV – HA-Gestion' };

export default async function PageNouveauTicket({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  await requireSession();
  const { serie } = premieresValeurs(await searchParams);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau ticket SAV" />
      <FormulaireOuverture serie={serie ?? ''} />
    </div>
  );
}
