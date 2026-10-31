import { LIBELLES_RUBRIQUES_OFFRE } from '@ha/domain';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { obtenirDevis } from '@/server/services/devis';

import { signerSurEcranAction } from '../../actions';
import { ZoneSignature } from './zone-signature';

export const metadata: Metadata = { title: 'Signature du devis – HA-Gestion' };

export default async function PageSignature({
  params,
}: PageProps<'/dossiers/[id]/devis/[devisId]/signature'>) {
  const { id, devisId } = await params;
  const acteur = await requireSession();
  const devis = await ouIntrouvable(obtenirDevis(acteur, devisId));
  if (devis.dossierId !== id || !devis.actions.signerEcran) {
    notFound();
  }
  return (
    <div className="grid gap-6">
      <EntetePage titre={`Validation du devis ${devis.numeroAffiche}`}>
        À l’issue de l’essai, le patient choisit son offre et signe dans le cadre ci-dessous.
      </EntetePage>
      <ZoneSignature
        action={signerSurEcranAction.bind(null, id, devisId)}
        statut={devis.statut}
        offres={devis.offres.map((o) => ({
          valeur: o.rubrique,
          libelle: LIBELLES_RUBRIQUES_OFFRE[o.rubrique],
        }))}
      />
    </div>
  );
}
