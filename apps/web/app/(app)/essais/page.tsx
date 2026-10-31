import type { Metadata } from 'next';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { TableauPagine, type Colonne } from '@/components/tableau-pagine';
import { formaterDate } from '@/lib/format';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerEssaisEnCours, type LigneEssai } from '@/server/services/essais';

import { AlertesEssai } from './alertes-essai';

export const metadata: Metadata = { title: 'Essais en cours – HA-Gestion' };

const CHEMIN = '/essais';

function libelleEcheance({ echeance, joursRestants }: LigneEssai): string {
  const date = formaterDate(echeance);
  if (joursRestants < 0) {
    return `${date} (dépassée de ${String(-joursRestants)} j)`;
  }
  return joursRestants === 0
    ? `${date} (aujourd’hui)`
    : `${date} (dans ${String(joursRestants)} j)`;
}

const COLONNES: readonly Colonne<LigneEssai>[] = [
  {
    libelle: 'Patient',
    rendu: (l) => (
      <Link href={`/dossiers/${l.dossierId}`} className="underline underline-offset-2">
        {l.patient}
      </Link>
    ),
  },
  { libelle: 'Centre', rendu: (l) => l.centre },
  {
    libelle: 'Numéros de série',
    rendu: (l) => <span className="font-mono">{l.numerosSerie.join(', ')}</span>,
  },
  { libelle: 'Jours écoulés', rendu: (l) => l.joursEcoules },
  { libelle: 'Échéance', rendu: libelleEcheance },
  { libelle: 'RDV réalisés', rendu: (l) => l.rdvRealises },
  { libelle: 'Alertes', rendu: (l) => <AlertesEssai alertes={l.alertes} /> },
];

/** La liste n'ouvre aucun dossier : pas de ligne READ (ADR-006). */
export default async function PageEssais({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre } = await perimetreCourant();
  const parametres = premieresValeurs(await searchParams);
  const { lignes, pagination } = await listerEssaisEnCours(acteur, perimetre, parametres);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Essais en cours">
        {perimetre.type === 'tous'
          ? 'Périodes d’essai de tout le réseau, les plus anciennes d’abord.'
          : 'Périodes d’essai du centre courant, les plus anciennes d’abord.'}
      </EntetePage>
      <TableauPagine
        colonnes={COLONNES}
        lignes={lignes}
        cleLigne={(l) => l.id}
        pagination={pagination}
        chemin={CHEMIN}
        parametres={{}}
        vide="Aucun essai en cours."
      />
    </div>
  );
}
