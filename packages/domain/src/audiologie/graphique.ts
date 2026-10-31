import { LIBELLES_OREILLES, type Oreille } from '../audio-rules/code-prestation';
import { joursEntre } from '../commun/date';
import { dateFr, echapperHtml } from '../devis/rendu';
import type { OreilleAudiogramme, PointAudiogramme } from './audiogramme';
import { NIVEAU_MAX_DB, NIVEAU_MIN_DB } from './audiogramme';
import { FREQUENCES_AUDIOGRAMME, libelleFrequence, type FrequenceAudiogramme } from './frequences';
import {
  LIBELLES_ECOUTES_VOCALE,
  LIBELLES_TRANSDUCTEURS_VOCALE,
  PLAGES_VOCALE,
  pointsTries,
  type CourbeVocale,
  type EcouteVocale,
  type Vocale,
} from './vocale';

/** Convention d'usage : droite en rouge, gauche en bleu. À VÉRIFIER : absente de docs/ref (R25). */
export const COULEURS_OREILLES: Readonly<Record<Oreille, string>> = {
  DROITE: '#c8102e',
  GAUCHE: '#0b4fa8',
};

const COULEUR_GRILLE = '#c9ced6';
const COULEUR_TEXTE = '#333a45';
const COULEUR_BINAURALE = '#333a45';

// Un octave vaut 20 dB sur les deux axes, pour garder la pente lisible d'un audiogramme à l'autre.
const PX_PAR_OCTAVE = 60;
const PX_PAR_DB = PX_PAR_OCTAVE / 20;
const MARGE_GAUCHE = 44;
const MARGE_DROITE = 20;
const MARGE_HAUT = 44;
const MARGE_BAS = 30;
const MARGE_BAS_AUDIOGRAMME = 44;
const TAILLE_SYMBOLE = 6;
const DECALAGE_OSSEUX = 8;
const OCTAVES = Math.log2(8000 / 125);
const LARGEUR_TRACE = OCTAVES * PX_PAR_OCTAVE;
const HAUTEUR_TRACE = (NIVEAU_MAX_DB - NIVEAU_MIN_DB) * PX_PAR_DB;
const LARGEUR_AUDIOGRAMME = MARGE_GAUCHE + LARGEUR_TRACE + MARGE_DROITE;
const HAUTEUR_AUDIOGRAMME = MARGE_HAUT + HAUTEUR_TRACE + MARGE_BAS_AUDIOGRAMME;

/** Deux décimales suffisent à l'écran et gardent des instantanés stables d'une machine à l'autre. */
function n(valeur: number): string {
  return String(Number(valeur.toFixed(2)));
}

function xFrequence(frequence: FrequenceAudiogramme): number {
  return MARGE_GAUCHE + Math.log2(frequence / 125) * PX_PAR_OCTAVE;
}

function yNiveau(niveau: number): number {
  return MARGE_HAUT + (niveau - NIVEAU_MIN_DB) * PX_PAR_DB;
}

function ligne(x1: number, y1: number, x2: number, y2: number, attributs: string): string {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attributs}/>`;
}

function texteSvg(x: number, y: number, contenu: string, attributs = ''): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="10" fill="${COULEUR_TEXTE}" ${attributs}>${contenu}</text>`;
}

function grilleAudiogramme(): string {
  const elements: string[] = [];
  for (const frequence of FREQUENCES_AUDIOGRAMME) {
    const x = xFrequence(frequence);
    const octave = Number.isInteger(Math.log2(frequence / 125));
    elements.push(
      ligne(
        x,
        MARGE_HAUT,
        x,
        MARGE_HAUT + HAUTEUR_TRACE,
        `stroke="${COULEUR_GRILLE}"${octave ? '' : ' stroke-dasharray="2 3"'}`,
      ),
    );
    if (octave) {
      elements.push(
        texteSvg(x, MARGE_HAUT - 8, libelleFrequence(frequence), 'text-anchor="middle"'),
      );
    }
  }
  for (let niveau = NIVEAU_MIN_DB; niveau <= NIVEAU_MAX_DB; niveau += 10) {
    const y = yNiveau(niveau);
    elements.push(
      ligne(
        MARGE_GAUCHE,
        y,
        MARGE_GAUCHE + LARGEUR_TRACE,
        y,
        `stroke="${COULEUR_GRILLE}"${niveau === 0 ? ' stroke-width="1.6"' : ''}`,
      ),
      texteSvg(MARGE_GAUCHE - 6, y + 3, String(niveau), 'text-anchor="end"'),
    );
  }
  elements.push(
    texteSvg(MARGE_GAUCHE - 6, MARGE_HAUT - 20, 'dB HL', 'text-anchor="end"'),
    texteSvg(MARGE_GAUCHE + LARGEUR_TRACE, MARGE_HAUT - 20, 'Hz', 'text-anchor="end"'),
  );
  return elements.join('\n');
}

type Courbe = 'AERIENNE' | 'OSSEUSE';

function cercle(x: number, y: number, trait: string): string {
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(TAILLE_SYMBOLE)}" fill="none" ${trait}/>`;
}

function croix(x: number, y: number, trait: string): string {
  const t = TAILLE_SYMBOLE;
  return `${ligne(x - t, y - t, x + t, y + t, trait)}${ligne(x - t, y + t, x + t, y - t, trait)}`;
}

function triangle(x: number, y: number, trait: string): string {
  const t = TAILLE_SYMBOLE;
  return `<polygon points="${n(x)},${n(y - t)} ${n(x + t)},${n(y + t)} ${n(x - t)},${n(y + t)}" fill="none" ${trait}/>`;
}

function carre(x: number, y: number, trait: string): string {
  const t = TAILLE_SYMBOLE;
  return `<rect x="${n(x - t)}" y="${n(y - t)}" width="${n(2 * t)}" height="${n(2 * t)}" fill="none" ${trait}/>`;
}

function chevron(x: number, y: number, sens: 1 | -1, trait: string): string {
  const t = TAILLE_SYMBOLE;
  return `<polyline points="${n(x + sens * t)},${n(y - t)} ${n(x)},${n(y)} ${n(x + sens * t)},${n(y + t)}" fill="none" ${trait}/>`;
}

function crochet(x: number, y: number, sens: 1 | -1, trait: string): string {
  const t = TAILLE_SYMBOLE;
  return `<polyline points="${n(x + sens * t)},${n(y - t)} ${n(x)},${n(y - t)} ${n(x)},${n(y + t)} ${n(x + sens * t)},${n(y + t)}" fill="none" ${trait}/>`;
}

/** À VÉRIFIER : symboles d'usage courant, absents de docs/ref (R25). */
function symbole(
  oreille: Oreille,
  courbe: Courbe,
  masque: boolean,
  x: number,
  y: number,
  trait: string,
): string {
  if (courbe === 'AERIENNE') {
    if (oreille === 'DROITE') {
      return masque ? triangle(x, y, trait) : cercle(x, y, trait);
    }
    return masque ? carre(x, y, trait) : croix(x, y, trait);
  }
  const sens = oreille === 'DROITE' ? 1 : -1;
  return masque ? crochet(x, y, sens, trait) : chevron(x, y, sens, trait);
}

/** Flèche vers le bas : aucune réponse au niveau maximal. */
function flecheSansReponse(x: number, y: number, sens: 1 | -1, trait: string): string {
  const pointeX = x + sens * 8;
  const pointeY = y + 10;
  return `${ligne(x, y, pointeX, pointeY, trait)}${ligne(pointeX, pointeY, pointeX - sens * 5, pointeY, trait)}${ligne(pointeX, pointeY, pointeX, pointeY - 5, trait)}`;
}

function pointsCourbe(
  oreille: Oreille,
  courbe: Courbe,
  points: readonly PointAudiogramme[],
  trait: string,
): string {
  const sens = oreille === 'DROITE' ? -1 : 1;
  const decalage = courbe === 'OSSEUSE' ? sens * DECALAGE_OSSEUX : 0;
  return points
    .map(({ frequence, seuil, masque }) => {
      const x = xFrequence(frequence) + decalage;
      const y = yNiveau(seuil ?? NIVEAU_MAX_DB);
      const marque = symbole(oreille, courbe, masque !== null, x, y, trait);
      return seuil === null ? `${marque}${flecheSansReponse(x, y, sens, trait)}` : marque;
    })
    .join('');
}

export interface SerieAudiogramme {
  /** Date du bilan, dans la légende d'une superposition. */
  readonly libelle: string;
  readonly courbes: OreilleAudiogramme;
}

function serieSvg(oreille: Oreille, { courbes }: SerieAudiogramme, comparee: boolean): string {
  const couleur = COULEURS_OREILLES[oreille];
  // Pointillés sur la seule ligne : un symbole en pointillés ne se lit plus.
  const attenuation = comparee ? ' opacity="0.6"' : '';
  const trait = `stroke="${couleur}" stroke-width="1.6"${attenuation}`;
  const traitLigne = comparee ? `${trait} stroke-dasharray="5 4"` : trait;
  const mesures = [...courbes.aerienne]
    .sort((a, b) => a.frequence - b.frequence)
    .flatMap(({ frequence, seuil }) =>
      seuil === null ? [] : [`${n(xFrequence(frequence))},${n(yNiveau(seuil))}`],
    );
  const relie =
    mesures.length > 1 ? `<polyline points="${mesures.join(' ')}" fill="none" ${traitLigne}/>` : '';
  const inconfort = courbes.inconfort
    .map(({ frequence, seuil }) =>
      texteSvg(
        xFrequence(frequence),
        yNiveau(seuil) + 4,
        'U',
        `text-anchor="middle" font-weight="700" style="fill:${couleur}"`,
      ),
    )
    .join('');
  return `<g>${relie}${pointsCourbe(oreille, 'AERIENNE', courbes.aerienne, trait)}${pointsCourbe(oreille, 'OSSEUSE', courbes.osseuse, trait)}${inconfort}</g>`;
}

function entete(largeur: number, hauteur: number, titre: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(largeur)} ${n(hauteur)}" width="${n(largeur)}" height="${n(hauteur)}" role="img" aria-label="${titre}" font-family="Arial, Helvetica, sans-serif" style="max-width:100%;height:auto;background:#fff">`;
}

function titreSvg(x: number, y: number, contenu: string, couleur: string): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="12" font-weight="700" fill="${couleur}">${contenu}</text>`;
}

/**
 * Audiogramme d'une oreille, en SVG autonome : le même rendu sert à l'écran, au PDF et aux instantanés.
 * `comparee` se superpose en pointillés.
 */
export function rendreAudiogrammeSvg(
  oreille: Oreille,
  serie: SerieAudiogramme,
  comparee?: SerieAudiogramme,
): string {
  const couleur = COULEURS_OREILLES[oreille];
  const titre = `Audiogramme, ${LIBELLES_OREILLES[oreille].toLowerCase()}`;
  const legende =
    comparee === undefined
      ? ''
      : texteSvg(
          MARGE_GAUCHE,
          HAUTEUR_AUDIOGRAMME - 22,
          `Trait plein : ${echapperHtml(serie.libelle)}. Pointillés : ${echapperHtml(comparee.libelle)}.`,
        );
  return `${entete(LARGEUR_AUDIOGRAMME, HAUTEUR_AUDIOGRAMME, titre)}
${titreSvg(MARGE_GAUCHE, 16, LIBELLES_OREILLES[oreille], couleur)}
${grilleAudiogramme()}
${comparee === undefined ? '' : serieSvg(oreille, comparee, true)}
${serieSvg(oreille, serie, false)}
${legende}
</svg>`;
}

const LIGNES_LEGENDE: readonly {
  readonly libelle: string;
  readonly courbe: Courbe;
  readonly masque: boolean;
}[] = [
  { libelle: 'Aérienne', courbe: 'AERIENNE', masque: false },
  { libelle: 'Aérienne masquée', courbe: 'AERIENNE', masque: true },
  { libelle: 'Osseuse', courbe: 'OSSEUSE', masque: false },
  { libelle: 'Osseuse masquée', courbe: 'OSSEUSE', masque: true },
];

/** Légende des symboles, partagée par l'écran et le PDF. */
export function rendreLegendeAudiogrammeSvg(): string {
  const largeur = 300;
  const hauteur = 20 + LIGNES_LEGENDE.length * 18 + 22;
  const colonnes = { DROITE: 120, GAUCHE: 170 } as const;
  const elements = [
    texteSvg(colonnes.DROITE, 12, 'Droite', 'text-anchor="middle"'),
    texteSvg(colonnes.GAUCHE, 12, 'Gauche', 'text-anchor="middle"'),
  ];
  LIGNES_LEGENDE.forEach(({ libelle, courbe, masque }, indice) => {
    const y = 28 + indice * 18;
    elements.push(texteSvg(0, y + 3, libelle));
    for (const oreille of ['DROITE', 'GAUCHE'] as const) {
      const trait = `stroke="${COULEURS_OREILLES[oreille]}" stroke-width="1.6"`;
      elements.push(symbole(oreille, courbe, masque, colonnes[oreille], y, trait));
    }
  });
  elements.push(texteSvg(0, hauteur - 8, 'U : seuil d’inconfort. Flèche : pas de réponse.'));
  return `${entete(largeur, hauteur, 'Légende des symboles')}
${elements.join('\n')}
</svg>`;
}

const LARGEUR_COURBE = 420;
const HAUTEUR_COURBE = 260;

function couleurEcoute(ecoute: EcouteVocale): string {
  return ecoute === 'BINAURALE' ? COULEUR_BINAURALE : COULEURS_OREILLES[ecoute];
}

function libelleCourbe(courbe: CourbeVocale): string {
  const appareil = courbe.appareille ? 'avec appareil' : 'sans appareil';
  return `${LIBELLES_ECOUTES_VOCALE[courbe.ecoute]}, ${LIBELLES_TRANSDUCTEURS_VOCALE[courbe.transducteur].toLowerCase()}, ${appareil}`;
}

/** Courbes d'intelligibilité : pourcentage selon l'intensité (calme) ou le rapport signal sur bruit (bruit). */
export function rendreVocaleSvg(vocale: Vocale): string {
  const { min, max, axe } = PLAGES_VOCALE[vocale.contexte];
  const hauteur = HAUTEUR_COURBE + vocale.courbes.length * 14;
  const x = (niveau: number) =>
    MARGE_GAUCHE + ((niveau - min) / (max - min)) * (LARGEUR_COURBE - MARGE_GAUCHE - MARGE_DROITE);
  const y = (pourcentage: number) =>
    MARGE_HAUT + ((100 - pourcentage) / 100) * (HAUTEUR_COURBE - MARGE_HAUT - MARGE_BAS);
  const grille: string[] = [];
  for (let pourcentage = 0; pourcentage <= 100; pourcentage += 25) {
    grille.push(
      ligne(
        MARGE_GAUCHE,
        y(pourcentage),
        LARGEUR_COURBE - MARGE_DROITE,
        y(pourcentage),
        `stroke="${COULEUR_GRILLE}"`,
      ),
      texteSvg(
        MARGE_GAUCHE - 6,
        y(pourcentage) + 3,
        `${String(pourcentage)} %`,
        'text-anchor="end"',
      ),
    );
  }
  const pas = (max - min) / 6;
  for (let niveau = min; niveau <= max; niveau += pas) {
    grille.push(
      ligne(
        x(niveau),
        MARGE_HAUT,
        x(niveau),
        HAUTEUR_COURBE - MARGE_BAS,
        `stroke="${COULEUR_GRILLE}"`,
      ),
      texteSvg(x(niveau), HAUTEUR_COURBE - MARGE_BAS + 13, String(niveau), 'text-anchor="middle"'),
    );
  }
  const courbes = vocale.courbes.map((courbe, indice) => {
    const couleur = couleurEcoute(courbe.ecoute);
    const pointilles = courbe.appareille ? ' stroke-dasharray="6 3"' : '';
    const points = pointsTries(courbe.points);
    const trace = points.map((p) => `${n(x(p.niveau))},${n(y(p.pourcentage))}`).join(' ');
    const marques = points
      .map(
        (p) =>
          `<circle cx="${n(x(p.niveau))}" cy="${n(y(p.pourcentage))}" r="3" fill="${couleur}"/>`,
      )
      .join('');
    const legendeY = HAUTEUR_COURBE + indice * 14;
    return `<g><polyline points="${trace}" fill="none" stroke="${couleur}" stroke-width="1.6"${pointilles}/>${marques}${ligne(MARGE_GAUCHE, legendeY - 3, MARGE_GAUCHE + 22, legendeY - 3, `stroke="${couleur}" stroke-width="1.6"${pointilles}`)}${texteSvg(MARGE_GAUCHE + 28, legendeY, libelleCourbe(courbe))}</g>`;
  });
  const titre =
    vocale.contexte === 'CALME'
      ? 'Audiométrie vocale dans le calme'
      : 'Audiométrie vocale dans le bruit';
  return `${entete(LARGEUR_COURBE, hauteur, titre)}
${titreSvg(MARGE_GAUCHE, 16, titre, COULEUR_TEXTE)}
${texteSvg(MARGE_GAUCHE, 32, axe)}
${grille.join('\n')}
${courbes.join('\n')}
</svg>`;
}

export interface PointEvolution {
  readonly date: string;
  readonly droite: number | null;
  readonly gauche: number | null;
}

const LARGEUR_EVOLUTION = 560;
const HAUTEUR_EVOLUTION = 260;
const REPERES_EVOLUTION = [0, 20, 35, 50, 65, 80, 95, 120] as const;

/**
 * Perte moyenne par oreille au fil des bilans, reçus dans l'ordre chronologique.
 * Les repères horizontaux sont les bornes de grades : on voit quand un patient change de grade.
 */
export function rendreEvolutionSvg(points: readonly PointEvolution[]): string {
  const debut = points[0]?.date ?? '';
  const fin = points.at(-1)?.date ?? debut;
  const duree = points.length < 2 ? 0 : joursEntre(debut, fin);
  const largeurTrace = LARGEUR_EVOLUTION - MARGE_GAUCHE - MARGE_DROITE;
  const x = (date: string) =>
    duree === 0
      ? MARGE_GAUCHE + largeurTrace / 2
      : MARGE_GAUCHE + (joursEntre(debut, date) / duree) * largeurTrace;
  const y = (niveau: number) =>
    MARGE_HAUT + (niveau / 120) * (HAUTEUR_EVOLUTION - MARGE_HAUT - MARGE_BAS);
  const grille = REPERES_EVOLUTION.map((niveau) =>
    [
      ligne(
        MARGE_GAUCHE,
        y(niveau),
        LARGEUR_EVOLUTION - MARGE_DROITE,
        y(niveau),
        `stroke="${COULEUR_GRILLE}"`,
      ),
      texteSvg(MARGE_GAUCHE - 6, y(niveau) + 3, String(niveau), 'text-anchor="end"'),
    ].join(''),
  );
  const dates = points.map((p, indice) =>
    indice === 0 || indice === points.length - 1
      ? texteSvg(
          x(p.date),
          HAUTEUR_EVOLUTION - MARGE_BAS + 14,
          dateFr(p.date),
          `text-anchor="${duree === 0 ? 'middle' : indice === 0 ? 'start' : 'end'}"`,
        )
      : '',
  );
  const series = (['DROITE', 'GAUCHE'] as const).map((oreille) => {
    const couleur = COULEURS_OREILLES[oreille];
    const valeurs = points.flatMap((p) => {
      const niveau = oreille === 'DROITE' ? p.droite : p.gauche;
      return niveau === null ? [] : [{ date: p.date, niveau }];
    });
    const trace = valeurs.map((p) => `${n(x(p.date))},${n(y(p.niveau))}`).join(' ');
    const marques = valeurs
      .map((p) => `<circle cx="${n(x(p.date))}" cy="${n(y(p.niveau))}" r="3" fill="${couleur}"/>`)
      .join('');
    return `<g><polyline points="${trace}" fill="none" stroke="${couleur}" stroke-width="1.6"/>${marques}</g>`;
  });
  const titre = 'Évolution de la perte moyenne';
  return `${entete(LARGEUR_EVOLUTION, HAUTEUR_EVOLUTION, titre)}
${titreSvg(MARGE_GAUCHE, 16, titre, COULEUR_TEXTE)}
${texteSvg(MARGE_GAUCHE, 32, 'dB HL, repères aux bornes des grades. Droite en rouge, gauche en bleu.')}
${grille.join('\n')}
${dates.join('')}
${series.join('\n')}
</svg>`;
}
