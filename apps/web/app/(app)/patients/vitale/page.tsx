import {
  etatDroitsAmo,
  LIBELLES_QUALITE,
  LIBELLES_SOURCE_LECTURE_VITALE,
  type BeneficiaireVitale,
} from '@ha/domain';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { EntetePage } from '@/components/entete-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formaterDate, formaterDateHeure } from '@/lib/format';
import { premieresValeurs, urlAvecParametres, type ParametresRecherche } from '@/lib/parametres';
import { requireSession } from '@/server/auth/gardes';
import { ErreurSaisie } from '@/server/erreurs';
import { aujourdhui } from '@/server/services/patients';
import {
  lectureEnCours,
  rechercherBeneficiaire,
  type RechercheBeneficiaire,
} from '@/server/services/vitale';
import { COOKIE_LECTURE_VITALE } from '@/server/vitale/jeton';

import { AlerteDroits, BadgeC2s, droitsEnAlerte } from '../entete-patient';
import { LectureVitale } from '../lecture-vitale';
import { terminerLectureAction } from './actions';

export const metadata: Metadata = { title: 'Lecture de la carte Vitale – HA-Gestion' };

const CHEMIN = '/patients/vitale';

function nomBeneficiaire(b: BeneficiaireVitale): string {
  return `${b.prenom} ${b.nom}`;
}

function BoutonTerminer() {
  return (
    <form action={terminerLectureAction}>
      <Button type="submit" variant="outline">
        Terminer la lecture
      </Button>
    </form>
  );
}

/** Fiches correspondant au bénéficiaire choisi, ou création d'une fiche. */
function Correspondances({
  index,
  recherche,
  origine,
}: {
  index: string;
  recherche: RechercheBeneficiaire;
  origine: string | undefined;
}) {
  const { visibles, horsPerimetre, beneficiaire } = recherche;
  const comparer = (patientId: string) =>
    urlAvecParametres(`${CHEMIN}/comparer`, { b: index, patient: patientId });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{nomBeneficiaire(beneficiaire)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {visibles.length > 0 ? (
          <ul className="grid gap-2">
            {visibles.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span>
                  Fiche existante :{' '}
                  <Link
                    href={`/patients/${f.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {f.prenoms} {(f.nomUsage ?? f.nomNaissance).toUpperCase()}
                  </Link>{' '}
                  ({formaterDate(f.dateNaissance)}, {f.centreNom})
                </span>
                <Button asChild size="sm">
                  <Link href={comparer(f.id)}>Comparer avec la carte</Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {horsPerimetre.map((f, i) => (
          <p key={i} className="text-sm">
            Ce bénéficiaire a une fiche au centre {f.centreNom} : contactez l’administrateur.
          </p>
        ))}
        {visibles.length === 0 && horsPerimetre.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Aucune fiche ne correspond à ce bénéficiaire (NIR, qualité et rang).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={urlAvecParametres(`${CHEMIN}/nouveau`, { b: index })}>
                  Créer la fiche depuis la carte
                </Link>
              </Button>
              {origine ? (
                <Button asChild variant="outline">
                  <Link href={comparer(origine)}>Comparer avec la fiche d’origine</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Lecture en cours : choix du bénéficiaire, puis fiche existante (comparaison) ou création. */
export default async function PageLectureVitale({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const parametres = premieresValeurs(await searchParams);
  const jeton = (await cookies()).get(COOKIE_LECTURE_VITALE)?.value;
  const lecture = lectureEnCours(acteur, jeton);

  if (!lecture) {
    return (
      <div className="grid gap-6">
        <EntetePage titre="Lecture de la carte Vitale" />
        <Alert role="status">
          <AlertDescription>
            Aucune lecture en cours (une lecture reste utilisable 15 minutes). Insérez la carte et
            lancez la lecture.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap justify-between gap-4">
          <Button asChild variant="outline">
            <Link href="/patients">Retour aux patients</Link>
          </Button>
          <LectureVitale patientId={parametres.patient ?? null} />
        </div>
      </div>
    );
  }

  const { beneficiaires, source, dateLecture } = lecture.resultat;
  const index = parametres.b ?? (beneficiaires.length === 1 ? '0' : undefined);
  const jour = aujourdhui();
  let recherche: RechercheBeneficiaire | null = null;
  let erreur: string | null = null;
  if (index !== undefined) {
    try {
      recherche = await rechercherBeneficiaire(acteur, jeton, index);
    } catch (e) {
      if (!(e instanceof ErreurSaisie)) {
        throw e;
      }
      erreur = e.message;
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <EntetePage titre="Lecture de la carte Vitale">
          {LIBELLES_SOURCE_LECTURE_VITALE[source]} lue le {formaterDateHeure(new Date(dateLecture))}
          {' — '}
          {beneficiaires.length} bénéficiaire{beneficiaires.length > 1 ? 's' : ''}
        </EntetePage>
        <BoutonTerminer />
      </div>

      {erreur ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3" aria-label="Bénéficiaires de la carte">
        <h2 className="text-lg font-semibold">
          {beneficiaires.length > 1 ? 'Choisissez le bénéficiaire' : 'Bénéficiaire'}
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {beneficiaires.map((b, i) => {
            const etat = etatDroitsAmo(b.droitsAmo, jour);
            const choisi = index === String(i);
            return (
              <li key={i}>
                <Link
                  href={urlAvecParametres(CHEMIN, parametres, { b: i })}
                  aria-current={choisi ? 'true' : undefined}
                  className={`grid gap-1 rounded-lg border p-3 text-sm hover:bg-muted ${choisi ? 'border-primary ring-1 ring-primary' : ''}`}
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {nomBeneficiaire(b)}
                    {b.c2s ? <BadgeC2s /> : null}
                  </span>
                  <span className="text-muted-foreground">
                    Né(e) le {formaterDate(b.dateNaissance)} — {LIBELLES_QUALITE[b.qualite]}, rang{' '}
                    {b.rang}
                  </span>
                  {droitsEnAlerte(etat) ? (
                    <span className="text-destructive">Droits AMO expirés ou non ouverts</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {recherche && index !== undefined ? (
        <>
          <AlerteDroits
            etat={etatDroitsAmo(recherche.beneficiaire.droitsAmo, jour)}
            fin={recherche.beneficiaire.droitsAmo.fin}
            debut={recherche.beneficiaire.droitsAmo.debut}
          />
          {/* Source : convention-audioprothesistes.pdf art. 29 § 1 (p. 27). */}
          {recherche.beneficiaire.c2s ? (
            <Alert role="status">
              <AlertTitle>Bénéficiaire de la complémentaire santé solidaire (C2S)</AlertTitle>
              <AlertDescription>
                Proposer en première intention des aides auditives aux prix limites de vente, sans
                participation financière.
              </AlertDescription>
            </Alert>
          ) : null}
          <Correspondances index={index} recherche={recherche} origine={parametres.patient} />
        </>
      ) : null}
    </div>
  );
}
