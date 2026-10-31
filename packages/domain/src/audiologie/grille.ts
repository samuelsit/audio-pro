import type { OreilleAudiogramme, PointAudiogramme, PointInconfort } from './audiogramme';
import { FREQUENCES_AUDIOGRAMME, type FrequenceAudiogramme } from './frequences';

export const LIGNES_GRILLE = [
  'aerienne',
  'masqueAerienne',
  'osseuse',
  'masqueOsseuse',
  'inconfort',
] as const;
export type LigneGrille = (typeof LIGNES_GRILLE)[number];

export const LIBELLES_LIGNES_GRILLE: Readonly<Record<LigneGrille, string>> = {
  aerienne: 'Aérienne',
  masqueAerienne: 'Masquage aérienne',
  osseuse: 'Osseuse',
  masqueOsseuse: 'Masquage osseuse',
  inconfort: 'Inconfort',
};

/** Texte saisi, par fréquence. */
export type GrilleOreille = Readonly<
  Record<LigneGrille, Readonly<Partial<Record<FrequenceAudiogramme, string>>>>
>;

export const SAISIE_SANS_REPONSE = 'nr';

export const GRILLE_VIDE: GrilleOreille = {
  aerienne: {},
  masqueAerienne: {},
  osseuse: {},
  masqueOsseuse: {},
  inconfort: {},
};

function texteNiveau(niveau: number | null): string {
  return niveau === null ? SAISIE_SANS_REPONSE : String(niveau);
}

function textes(
  points: readonly { readonly frequence: FrequenceAudiogramme; readonly seuil: number | null }[],
): Partial<Record<FrequenceAudiogramme, string>> {
  return Object.fromEntries(points.map((p) => [p.frequence, texteNiveau(p.seuil)]));
}

function masques(
  points: readonly PointAudiogramme[],
): Partial<Record<FrequenceAudiogramme, string>> {
  return Object.fromEntries(
    points.flatMap((p) => (p.masque === null ? [] : [[p.frequence, String(p.masque)]])),
  );
}

export function grilleDepuisOreille(courbes: OreilleAudiogramme): GrilleOreille {
  return {
    aerienne: textes(courbes.aerienne),
    masqueAerienne: masques(courbes.aerienne),
    osseuse: textes(courbes.osseuse),
    masqueOsseuse: masques(courbes.osseuse),
    inconfort: textes(courbes.inconfort),
  };
}

type Lecture =
  | { readonly etat: 'vide' }
  | { readonly etat: 'invalide' }
  | { readonly etat: 'valeur'; readonly niveau: number | null };

function lireCellule(valeur: string | undefined, sansReponseAdmis: boolean): Lecture {
  const texte = valeur?.trim().toLowerCase() ?? '';
  if (texte === '') {
    return { etat: 'vide' };
  }
  if (texte === SAISIE_SANS_REPONSE) {
    return sansReponseAdmis ? { etat: 'valeur', niveau: null } : { etat: 'invalide' };
  }
  const niveau = Number(texte);
  return Number.isFinite(niveau) ? { etat: 'valeur', niveau } : { etat: 'invalide' };
}

export interface CelluleInvalide {
  readonly ligne: LigneGrille;
  readonly frequence: FrequenceAudiogramme;
}

/**
 * Cellules illisibles, ou masquage sans seuil. On les signale au lieu de les convertir :
 * `NaN` deviendrait `null` en JSON, c'est-à-dire « pas de réponse », compté 120 dB.
 */
export function cellulesInvalides(grille: GrilleOreille): CelluleInvalide[] {
  const invalides: CelluleInvalide[] = [];
  for (const frequence of FREQUENCES_AUDIOGRAMME) {
    for (const ligne of LIGNES_GRILLE) {
      const sansReponseAdmis = ligne === 'aerienne' || ligne === 'osseuse';
      if (lireCellule(grille[ligne][frequence], sansReponseAdmis).etat === 'invalide') {
        invalides.push({ ligne, frequence });
      }
    }
    const paires = [
      ['aerienne', 'masqueAerienne'],
      ['osseuse', 'masqueOsseuse'],
    ] as const;
    for (const [seuil, masque] of paires) {
      const manque = lireCellule(grille[seuil][frequence], true).etat === 'vide';
      if (manque && lireCellule(grille[masque][frequence], false).etat === 'valeur') {
        invalides.push({ ligne: masque, frequence });
      }
    }
  }
  return invalides;
}

function courbe(
  seuils: GrilleOreille[LigneGrille],
  masquesSaisis: GrilleOreille[LigneGrille],
): PointAudiogramme[] {
  return FREQUENCES_AUDIOGRAMME.flatMap((frequence) => {
    const seuil = lireCellule(seuils[frequence], true);
    if (seuil.etat !== 'valeur') {
      return [];
    }
    const masque = lireCellule(masquesSaisis[frequence], false);
    return [
      {
        frequence,
        seuil: seuil.niveau,
        masque: masque.etat === 'valeur' ? masque.niveau : null,
      },
    ];
  });
}

/** Ne retient que les cellules lisibles : la saisie se bloque d'abord sur `cellulesInvalides`. */
export function oreilleDepuisGrille(grille: GrilleOreille): OreilleAudiogramme {
  const inconfort: PointInconfort[] = FREQUENCES_AUDIOGRAMME.flatMap((frequence) => {
    const lu = lireCellule(grille.inconfort[frequence], false);
    return lu.etat === 'valeur' && lu.niveau !== null ? [{ frequence, seuil: lu.niveau }] : [];
  });
  return {
    aerienne: courbe(grille.aerienne, grille.masqueAerienne),
    osseuse: courbe(grille.osseuse, grille.masqueOsseuse),
    inconfort,
  };
}
