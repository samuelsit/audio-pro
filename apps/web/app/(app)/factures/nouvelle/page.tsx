import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { donneesVenteDirecte } from '@/server/services/facturation';

import { FormulaireVenteDirecte } from '../formulaires';

export const metadata: Metadata = { title: 'Vente directe – HA-Gestion' };

export default async function PageVenteDirecte({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const { patient: patientId } = premieresValeurs(await searchParams);
  if (!patientId) {
    notFound();
  }
  const donnees = await ouIntrouvable(donneesVenteDirecte(acteur, patientId));
  return (
    <div className="grid gap-6">
      <EntetePage titre="Vente directe">
        Piles, accessoires ou entretien pour {donnees.patient}.
      </EntetePage>
      <FormulaireVenteDirecte
        patientId={patientId}
        centres={donnees.centres}
        prescriptions={donnees.prescriptions}
      />
    </div>
  );
}
