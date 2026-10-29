import { etatDroitsAmo, LIBELLES_CHAMPS_CARTE, valeurCarte, valeurFiche } from '@ha/domain';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { aujourdhui, versSaisie } from '@/server/services/patients';
import { preparerComparaison, type Comparaison } from '@/server/services/vitale';
import { COOKIE_LECTURE_VITALE } from '@/server/vitale/jeton';

import { valeurChampCarte } from '../../affichage';
import { AlerteDroits, EntetePatient } from '../../entete-patient';
import { appliquerCarteAction } from '../actions';
import { FormulaireComparaison, type LigneComparaison } from './formulaire-comparaison';

export const metadata: Metadata = { title: 'Comparer avec la carte Vitale – HA-Gestion' };

/** Comparaison champ par champ de la fiche et de la carte ; ouvrir l'écran écrit une ligne READ. */
export default async function PageComparaisonVitale({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const { b: index, patient: patientId } = premieresValeurs(await searchParams);
  if (index === undefined || !patientId) {
    notFound();
  }
  const jeton = (await cookies()).get(COOKIE_LECTURE_VITALE)?.value;

  let comparaison: Comparaison;
  try {
    comparaison = await ouIntrouvable(preparerComparaison(acteur, jeton, index, patientId));
  } catch (erreur) {
    if (!(erreur instanceof ErreurSaisie)) {
      throw erreur;
    }
    return (
      <div className="grid gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Comparer avec la carte Vitale</h1>
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erreur.message}</AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href={`/patients/${patientId}`}>Retour à la fiche</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { fiche, beneficiaire, champs, correspond } = comparaison;
  const avant = versSaisie(fiche);
  const lignes: LigneComparaison[] = champs.map((champ) => ({
    champ,
    libelle: LIBELLES_CHAMPS_CARTE[champ],
    base: valeurChampCarte(champ, valeurFiche(avant, champ)),
    carte: valeurChampCarte(champ, valeurCarte(beneficiaire, champ)),
  }));

  return (
    <div className="grid gap-6">
      <EntetePatient fiche={fiche} titre="Comparer avec la carte Vitale">
        <Button asChild variant="outline">
          <Link href={urlAvecParametres('/patients/vitale', { b: index, patient: patientId })}>
            Retour à la lecture
          </Link>
        </Button>
      </EntetePatient>

      {correspond ? null : (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Cette fiche ne porte pas le NIR de ce bénéficiaire</AlertTitle>
          <AlertDescription>
            Vérifiez qu’il s’agit bien de la même personne ({beneficiaire.prenom} {beneficiaire.nom}
            ) avant de mettre la fiche à jour.
          </AlertDescription>
        </Alert>
      )}
      <AlerteDroits
        etat={etatDroitsAmo(beneficiaire.droitsAmo, aujourdhui())}
        fin={beneficiaire.droitsAmo.fin}
        debut={beneficiaire.droitsAmo.debut}
      />

      <FormulaireComparaison
        action={appliquerCarteAction.bind(null, index, patientId)}
        lignes={lignes}
      />
    </div>
  );
}
