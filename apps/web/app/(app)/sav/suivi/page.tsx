import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerControles, type ControleListe } from '@/server/services/suivi';

export const metadata: Metadata = { title: 'Suivi – HA-Gestion' };

function lienPlanifier(c: ControleListe): string {
  const parametres = new URLSearchParams({
    patient: c.patientId,
    reference: c.dateReference,
    rang: String(c.rang),
    prevue: c.datePrevue,
    centre: c.centreId,
  });
  return `/sav/suivi/planifier?${parametres.toString()}`;
}

const COLONNES: readonly Colonne<ControleListe>[] = [
  {
    libelle: 'Patient',
    rendu: (c) => (
      <Link href={`/patients/${c.patientId}`} className="underline-offset-4 hover:underline">
        {c.patient}
      </Link>
    ),
  },
  { libelle: 'Centre', rendu: (c) => c.centre },
  { libelle: 'Délivrance', rendu: (c) => formaterDate(c.dateReference) },
  { libelle: 'Contrôle', rendu: (c) => `${String(c.mois)} mois` },
  { libelle: 'Prévu le', rendu: (c) => formaterDate(c.datePrevue) },
  {
    libelle: 'État',
    rendu: (c) =>
      c.enRetard ? <Badge variant="destructive">En retard</Badge> : <Badge>À planifier</Badge>,
  },
  {
    libelle: '',
    rendu: (c) => (
      <Button asChild size="sm" variant="outline">
        <Link href={lienPlanifier(c)}>Proposer un RDV</Link>
      </Button>
    ),
  },
];

export default async function PageSuivi({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const parametres = premieresValeurs(await searchParams);
  const { acteur, perimetre } = await perimetreCourant();
  const { lignes, pagination } = await listerControles(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Suivi post-appareillage">
        Contrôles prévus depuis la délivrance. Le rythme se règle dans Paramètres du SAV.
      </EntetePage>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(c) => `${c.patientId}-${c.dateReference}-${String(c.rang)}`}
        pagination={pagination}
        chemin="/sav/suivi"
        parametres={parametres}
        vide="Aucun contrôle à planifier."
      />
    </div>
  );
}
