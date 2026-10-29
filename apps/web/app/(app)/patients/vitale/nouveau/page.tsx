import { etatDroitsAmo, preRemplissageDepuisBeneficiaire } from '@ha/domain';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { perimetreCourant } from '@/server/auth/gardes';
import { aujourdhui } from '@/server/services/patients';
import { lectureEnCours } from '@/server/services/vitale';
import { COOKIE_LECTURE_VITALE } from '@/server/vitale/jeton';

import { AlerteDroits, BadgeC2s } from '../../entete-patient';
import { FormulairePatient } from '../../formulaire-patient';
import { creerDepuisCarteAction } from '../actions';

export const metadata: Metadata = { title: 'Nouveau patient depuis la carte Vitale – HA-Gestion' };

/** Formulaire de création pré-rempli par le bénéficiaire choisi (le NIR ne passe jamais par l'URL). */
export default async function PageNouveauDepuisCarte({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const { acteur, perimetre, centres } = await perimetreCourant();
  const { b: index } = premieresValeurs(await searchParams);
  if (index === undefined) {
    notFound();
  }
  const lecture = lectureEnCours(acteur, (await cookies()).get(COOKIE_LECTURE_VITALE)?.value);
  const beneficiaire = lecture?.resultat.beneficiaires[Number(index)];
  if (!beneficiaire) {
    return (
      <div className="grid gap-6">
        <EntetePage titre="Nouveau patient depuis la carte Vitale" />
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            La lecture de la carte a expiré ou n’est plus valable : relisez la carte.
          </AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href="/patients/vitale">Retour à la lecture</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau patient depuis la carte Vitale">
        <span className="flex flex-wrap items-center gap-2">
          Formulaire pré-rempli avec la carte : choisissez la civilité et le sexe, et vérifiez le
          nom (la carte porte le nom usuel). {beneficiaire.c2s ? <BadgeC2s /> : null}
        </span>
      </EntetePage>
      <AlerteDroits
        etat={etatDroitsAmo(beneficiaire.droitsAmo, aujourdhui())}
        fin={beneficiaire.droitsAmo.fin}
        debut={beneficiaire.droitsAmo.debut}
      />
      <FormulairePatient
        action={creerDepuisCarteAction.bind(null, index)}
        centres={centres}
        centreParDefaut={perimetre.type === 'centre' ? perimetre.centreId : undefined}
        preRempli={preRemplissageDepuisBeneficiaire(beneficiaire)}
      />
    </div>
  );
}
