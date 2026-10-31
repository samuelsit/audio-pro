import { LIBELLES_CHAMPS_FUSION } from '@ha/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { ouIntrouvable, requireRole } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { preparerFusion, type PreparationFusion } from '@/server/services/patients';

import { fusionnerPatientsAction } from '../actions';
import { dateEtAge, identiteComplete, valeurChampFusion } from '../affichage';
import { FormulaireFusion } from './formulaire-fusion';

export const metadata: Metadata = { title: 'Fusion de fiches – HA-Gestion' };

/** Réservé à l'ADMIN_CLIENT et aux audioprothésistes ayant accès aux centres des deux fiches. */
export default async function PageFusion({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireRole('ADMIN_CLIENT', 'RESPONSABLE_CENTRE', 'AUDIO');
  const { conservee: conserveeId, doublon: doublonId } = premieresValeurs(await searchParams);
  if (!conserveeId || !doublonId) {
    notFound();
  }

  let preparation: PreparationFusion;
  try {
    preparation = await ouIntrouvable(preparerFusion(acteur, conserveeId, doublonId));
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) {
      throw erreur;
    }
    return (
      <div className="grid gap-6">
        <EntetePage titre="Fusion de fiches" />
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erreur.message}</AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href="/patients">Retour aux patients</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { conservee, doublon, champs } = preparation;
  const lignes = champs.map(({ champ, parDefaut }) => ({
    champ,
    libelle: LIBELLES_CHAMPS_FUSION[champ],
    conservee: valeurChampFusion(conservee, champ),
    doublon: valeurChampFusion(doublon, champ),
    parDefaut,
  }));

  return (
    <div className="grid gap-6">
      <EntetePage titre="Fusion de fiches">
        Choisissez, pour chaque champ différent, la valeur à garder. La fiche conservée garde son
        identifiant et son historique.
      </EntetePage>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Fiche conservée</p>
          <p className="font-medium">{identiteComplete(conservee)}</p>
          <p className="text-sm">
            {dateEtAge(conservee)} — {conservee.centre.nom}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Fiche en double (sera retirée)</p>
          <p className="font-medium">{identiteComplete(doublon)}</p>
          <p className="text-sm">
            {dateEtAge(doublon)} — {doublon.centre.nom}
          </p>
        </div>
      </div>
      <div>
        <Button asChild variant="outline" size="sm">
          <Link
            href={urlAvecParametres('/patients/fusion', {
              conservee: doublon.id,
              doublon: conservee.id,
            })}
          >
            Inverser : conserver l’autre fiche
          </Link>
        </Button>
      </div>
      <FormulaireFusion
        action={fusionnerPatientsAction.bind(null, conservee.id, doublon.id)}
        lignes={lignes}
      />
    </div>
  );
}
