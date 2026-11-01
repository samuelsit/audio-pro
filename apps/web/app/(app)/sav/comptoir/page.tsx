import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { EtatVide } from '@/components/etat-vide';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { articlesComptoir, compteurPiles } from '@/server/services/comptoir';
import { donneesVenteDirecte } from '@/server/services/facturation';

import { FormulaireComptoir } from '../formulaires';

export const metadata: Metadata = { title: 'Comptoir – HA-Gestion' };

/** La vente rapide part de la fiche patient : une prescription peut ouvrir le remboursement (R30). */
export default async function PageComptoir({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const { patient: patientId, centre } = premieresValeurs(await searchParams);
  if (!patientId) {
    return (
      <div className="grid gap-6">
        <EntetePage titre="Comptoir">Piles, filtres, dômes et entretien.</EntetePage>
        <EtatVide titre="Choisir un patient">
          <Link href="/patients" className="underline underline-offset-4">
            Ouvrir la fiche du patient
          </Link>
          , puis le bouton Comptoir.
        </EtatVide>
      </div>
    );
  }
  const donnees = await ouIntrouvable(donneesVenteDirecte(acteur, patientId));
  const centreId = donnees.centres.find((c) => c.id === centre)?.id ?? donnees.centres[0]?.id;
  if (!centreId) {
    return <EtatVide titre="Aucun centre">Aucun centre ne vous est rattaché.</EtatVide>;
  }
  const [articles, quota] = await Promise.all([
    articlesComptoir(acteur, centreId),
    ouIntrouvable(compteurPiles(acteur, patientId)),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Comptoir">Vente pour {donnees.patient}.</EntetePage>
      {donnees.centres.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {donnees.centres.map((c) => (
            <Button
              key={c.id}
              asChild
              size="sm"
              variant={c.id === centreId ? 'default' : 'outline'}
            >
              <Link href={`/sav/comptoir?patient=${patientId}&centre=${c.id}`}>{c.nom}</Link>
            </Button>
          ))}
        </div>
      ) : null}
      <Alert variant={quota.depasse ? 'destructive' : 'default'}>
        <AlertTitle>Piles remboursées en {quota.annee}</AlertTitle>
        <AlertDescription>
          {quota.boites} boîte{quota.boites > 1 ? 's' : ''}
          {quota.quota === null
            ? '. Aucun quota en vigueur.'
            : ` sur ${String(quota.quota)} par an${quota.depasse ? ' : quota dépassé, la vente reste possible.' : '.'}`}
        </AlertDescription>
      </Alert>
      <FormulaireComptoir
        patientId={patientId}
        centreId={centreId}
        articles={articles}
        prescriptions={donnees.prescriptions}
      />
    </div>
  );
}
