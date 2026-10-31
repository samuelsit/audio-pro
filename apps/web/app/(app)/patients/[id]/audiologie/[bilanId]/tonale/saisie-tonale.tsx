'use client';

import {
  audiogrammeSaisieSchema,
  avertissementsAudiogramme,
  cellulesInvalides,
  formaterDb,
  FREQUENCES_AUDIOGRAMME,
  GRILLE_VIDE,
  grilleDepuisOreille,
  LIBELLES_GRADES,
  LIBELLES_LIGNES_GRILLE,
  LIBELLES_OREILLES,
  libelleFrequence,
  LIGNES_GRILLE,
  MENTION_GRADE,
  oreilleDepuisGrille,
  rendreAudiogrammeSvg,
  rendreLegendeAudiogrammeSvg,
  syntheseTonale,
  type Audiogramme,
  type FrequenceAudiogramme,
  type GrilleOreille,
  type LigneGrille,
  type Oreille,
  type ResultatOreille,
} from '@ha/domain';
import { useActionState, useMemo, useState, type KeyboardEvent } from 'react';

import { BoutonEnvoi, ChampTexte, MessageFormulaire } from '@/components/formulaire';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ETAT_INITIAL, type EtatFormulaire } from '@/lib/formulaire';
import { cn } from '@/lib/utils';

import { Graphique } from '../../composants';

const OREILLES_SAISIE = ['DROITE', 'GAUCHE'] as const;

const CLASSES_LIGNE: Readonly<Record<LigneGrille, string>> = {
  aerienne: '',
  masqueAerienne: 'text-muted-foreground',
  osseuse: '',
  masqueOsseuse: 'text-muted-foreground',
  inconfort: '',
};

function identifiant(oreille: Oreille, ligne: number, colonne: number): string {
  return `cellule-${oreille}-${String(ligne)}-${String(colonne)}`;
}

/** Saisie au clavier : Entrée avance d'une fréquence, les flèches se déplacent dans la grille. */
function deplacer(
  evenement: KeyboardEvent<HTMLInputElement>,
  oreille: Oreille,
  l: number,
  c: number,
) {
  const dernierL = LIGNES_GRILLE.length - 1;
  const dernierC = FREQUENCES_AUDIOGRAMME.length - 1;
  const cibles: Readonly<Record<string, readonly [number, number]>> = {
    Enter: c === dernierC ? [Math.min(l + 1, dernierL), 0] : [l, c + 1],
    ArrowRight: [l, Math.min(c + 1, dernierC)],
    ArrowLeft: [l, Math.max(c - 1, 0)],
    ArrowDown: [Math.min(l + 1, dernierL), c],
    ArrowUp: [Math.max(l - 1, 0), c],
  };
  const cible = cibles[evenement.key];
  if (!cible) {
    return;
  }
  evenement.preventDefault();
  const champ = document.getElementById(identifiant(oreille, cible[0], cible[1]));
  if (champ instanceof HTMLInputElement) {
    champ.focus();
    champ.select();
  }
}

function Grille({
  oreille,
  grille,
  surChangement,
}: {
  oreille: Oreille;
  grille: GrilleOreille;
  surChangement: (ligne: LigneGrille, frequence: FrequenceAudiogramme, valeur: string) => void;
}) {
  const invalides = cellulesInvalides(grille);
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <caption className="sr-only">{`Seuils, ${LIBELLES_OREILLES[oreille].toLowerCase()}`}</caption>
        <thead>
          <tr>
            <th scope="col" className="pr-2 text-left font-medium">
              dB HL
            </th>
            {FREQUENCES_AUDIOGRAMME.map((f) => (
              <th key={f} scope="col" className="px-0.5 text-xs font-medium">
                {libelleFrequence(f)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LIGNES_GRILLE.map((ligne, l) => (
            <tr key={ligne} className={CLASSES_LIGNE[ligne]}>
              <th scope="row" className="pr-2 text-left text-xs font-normal whitespace-nowrap">
                {LIBELLES_LIGNES_GRILLE[ligne]}
              </th>
              {FREQUENCES_AUDIOGRAMME.map((frequence, c) => (
                <td key={frequence} className="p-0.5">
                  <input
                    id={identifiant(oreille, l, c)}
                    aria-label={`${LIBELLES_OREILLES[oreille]}, ${LIBELLES_LIGNES_GRILLE[ligne]}, ${String(frequence)} Hz`}
                    aria-invalid={
                      invalides.some((i) => i.ligne === ligne && i.frequence === frequence)
                        ? true
                        : undefined
                    }
                    autoComplete="off"
                    value={grille[ligne][frequence] ?? ''}
                    onChange={(e) => surChangement(ligne, frequence, e.target.value)}
                    onKeyDown={(e) => deplacer(e, oreille, l, c)}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                      'h-8 w-11 rounded border border-input bg-transparent text-center text-sm outline-none',
                      'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50',
                      'aria-invalid:border-destructive',
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumeOreille({ oreille, resultat }: { oreille: Oreille; resultat: ResultatOreille }) {
  const { perteMoyenne, grade } = resultat;
  return (
    <p className="text-sm" data-testid={`resume-${oreille}`}>
      <strong>{LIBELLES_OREILLES[oreille]}</strong> :{' '}
      {perteMoyenne === null || grade === null
        ? 'perte moyenne non calculable (500, 1000, 2000 et 4000 Hz requis)'
        : `${formaterDb(perteMoyenne)}, grade ${String(grade)} – ${LIBELLES_GRADES[grade]}`}
    </p>
  );
}

export function SaisieTonale({
  action,
  audiogramme,
  appareil,
}: {
  action: (etat: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>;
  audiogramme: Audiogramme | null;
  appareil: string | null;
}) {
  const [etat, envoyer] = useActionState(action, ETAT_INITIAL);
  const [grilles, setGrilles] = useState<Readonly<Record<Oreille, GrilleOreille>>>({
    DROITE: audiogramme ? grilleDepuisOreille(audiogramme.droite) : GRILLE_VIDE,
    GAUCHE: audiogramme ? grilleDepuisOreille(audiogramme.gauche) : GRILLE_VIDE,
  });
  const saisie: Audiogramme = useMemo(
    () => ({
      droite: oreilleDepuisGrille(grilles.DROITE),
      gauche: oreilleDepuisGrille(grilles.GAUCHE),
    }),
    [grilles],
  );
  const synthese = syntheseTonale(saisie);
  const invalides = OREILLES_SAISIE.flatMap((o) => cellulesInvalides(grilles[o]));
  const verification = audiogrammeSaisieSchema.safeParse(saisie);
  const problemes = [
    ...(invalides.length > 0
      ? ['Valeurs illisibles : saisir un niveau en dB, ou nr pour « pas de réponse ».']
      : []),
    ...(verification.success ? [] : [...new Set(verification.error.issues.map((i) => i.message))]),
  ];
  const avertissements = verification.success ? avertissementsAudiogramme(saisie) : [];
  const erreursServeur = Object.values(etat.erreurs ?? {}).flat();

  function changer(
    oreille: Oreille,
    ligne: LigneGrille,
    frequence: FrequenceAudiogramme,
    valeur: string,
  ) {
    setGrilles((courantes) => ({
      ...courantes,
      [oreille]: {
        ...courantes[oreille],
        [ligne]: { ...courantes[oreille][ligne], [frequence]: valeur },
      },
    }));
  }

  return (
    <form
      action={envoyer}
      // Une cellule illisible n'est pas dans la saisie : l'envoyer la ferait disparaître sans bruit.
      onSubmit={(e) => {
        if (problemes.length > 0) {
          e.preventDefault();
        }
      }}
      className="grid gap-6"
    >
      <MessageFormulaire etat={etat} />
      {erreursServeur.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erreursServeur.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Audiogramme sans appareil. Entrée passe à la fréquence suivante, les flèches se déplacent
        dans la grille. Saisir nr quand il n’y a pas de réponse.
      </p>
      {OREILLES_SAISIE.map((oreille) => (
        <section key={oreille} className="grid gap-3" aria-label={LIBELLES_OREILLES[oreille]}>
          <h2 className="text-lg font-semibold">{LIBELLES_OREILLES[oreille]}</h2>
          <div className="flex flex-wrap items-start gap-6">
            <div className="grid gap-2">
              <Grille
                oreille={oreille}
                grille={grilles[oreille]}
                surChangement={(ligne, frequence, valeur) =>
                  changer(oreille, ligne, frequence, valeur)
                }
              />
              <ResumeOreille
                oreille={oreille}
                resultat={oreille === 'DROITE' ? synthese.droite : synthese.gauche}
              />
            </div>
            <Graphique
              svg={rendreAudiogrammeSvg(oreille, {
                libelle: '',
                courbes: oreille === 'DROITE' ? saisie.droite : saisie.gauche,
              })}
            />
          </div>
        </section>
      ))}
      <Graphique svg={rendreLegendeAudiogrammeSvg()} />
      {problemes.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{problemes.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      {avertissements.length > 0 ? (
        <Alert role="status">
          <AlertDescription>{avertissements.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-xs text-muted-foreground">{MENTION_GRADE}</p>
      <div className="max-w-sm">
        <ChampTexte etat={etat} nom="appareil" libelle="Audiomètre" defaut={appareil} />
      </div>
      <input type="hidden" name="audiogramme" value={JSON.stringify(saisie)} />
      <div>
        <BoutonEnvoi>Enregistrer l’audiogramme</BoutonEnvoi>
      </div>
    </form>
  );
}
