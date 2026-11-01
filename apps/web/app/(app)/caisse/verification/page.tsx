import { peutGererCaisse } from '@ha/domain';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';

import { centreDeCaisse, ChoisirUnCentre } from '../centre';
import { BoutonVerifierChaine } from '../formulaires';

export const metadata: Metadata = { title: 'Vérification – HA-Gestion' };

export default async function PageVerification() {
  const { acteur, centreId } = await centreDeCaisse();
  if (!peutGererCaisse(acteur.role)) {
    notFound();
  }
  if (!centreId) {
    return <ChoisirUnCentre />;
  }
  return (
    <div className="grid gap-6">
      <EntetePage titre="Vérification de la chaîne">
        Recalcule chaque maillon, chaque pièce et chaque encaissement, contrôle les signatures, la
        numérotation et les totaux des clôtures. Le travail de nuit fait la même vérification, et
        tout échec est inscrit au journal de caisse.
      </EntetePage>
      <BoutonVerifierChaine centreId={centreId} />
    </div>
  );
}
