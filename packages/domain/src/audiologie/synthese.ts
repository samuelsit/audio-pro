import { LIBELLES_OREILLES, type Oreille } from '../audio-rules/code-prestation';
import { dateFr, echapperHtml } from '../devis/rendu';
import type { Audiogramme } from './audiogramme';
import {
  calculerScores,
  formaterScore,
  libelleReponse,
  type DefinitionFormulaire,
  type Reponses,
} from './formulaire';
import {
  LIBELLES_GRADES,
  MENTION_GRADE,
  syntheseTonale,
  type ResultatOreille,
  type SyntheseTonale,
} from './grade';
import { rendreAudiogrammeSvg, rendreLegendeAudiogrammeSvg, rendreVocaleSvg } from './graphique';
import { LIBELLES_SOURCES_MESURE, LIBELLES_TYPES_MESURE, type SourceMesure } from './mesure';
import {
  LIBELLES_ETATS_CONDUIT,
  LIBELLES_ETATS_TYMPAN,
  type ConstatOtoscopique,
} from './otoscopie';
import { formaterDb } from './perte-moyenne';
import {
  LIBELLES_ECOUTES_VOCALE,
  LIBELLES_TRANSDUCTEURS_VOCALE,
  meilleurPourcentage,
  niveauA50Pourcent,
  type CourbeVocale,
  type Vocale,
} from './vocale';

export interface MetaMesureSynthese {
  readonly source: SourceMesure;
  readonly date: string;
  readonly appareil: string | null;
}

export interface FormulaireSynthese {
  readonly nom: string;
  readonly definition: DefinitionFormulaire;
  readonly reponses: Reponses;
}

export interface OtoscopieSynthese {
  readonly oreille: Oreille;
  readonly constat: ConstatOtoscopique;
  readonly photo: boolean;
}

/** Données de la synthèse : ni NIR ni montant. */
export interface VueSyntheseBilan {
  readonly centre: {
    readonly nom: string;
    readonly adresse: readonly string[];
    readonly telephone: string | null;
  };
  readonly patient: { readonly prenomNom: string; readonly dateNaissance: string };
  readonly dateBilan: string;
  readonly praticien: string | null;
  readonly anamnese: FormulaireSynthese | null;
  readonly otoscopies: readonly OtoscopieSynthese[];
  readonly tonale: (MetaMesureSynthese & { readonly audiogramme: Audiogramme }) | null;
  readonly vocales: readonly (MetaMesureSynthese & { readonly vocale: Vocale })[];
  readonly questionnaires: readonly FormulaireSynthese[];
}

const STYLE = `
@page { size: A4; margin: 16mm 14mm; }
body { font: 10pt/1.4 Arial, Helvetica, sans-serif; color: #111; }
h1 { font-size: 14pt; margin: 18px 0 8px; }
h2 { font-size: 11.5pt; margin: 16px 0 6px; border-bottom: 1px solid #888; padding-bottom: 2px; }
h3 { font-size: 10pt; margin: 10px 0 4px; }
p { margin: 3px 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #aaa; padding: 3px 6px; text-align: left; vertical-align: top; }
th { background: #eee; font-weight: 600; }
.entete { display: flex; justify-content: space-between; gap: 24px; }
.graphiques { display: flex; gap: 8px; align-items: flex-start; break-inside: avoid; }
.graphiques svg { width: 50%; height: auto; }
.bloc { break-inside: avoid; }
.mention { font-size: 8.5pt; color: #444; }
.meta { font-size: 8.5pt; color: #444; }
`;

function meta({ source, date, appareil }: MetaMesureSynthese): string {
  const details = [
    `Source : ${LIBELLES_SOURCES_MESURE[source]}`,
    `mesure du ${dateFr(date)}`,
    ...(appareil === null ? [] : [`appareil : ${echapperHtml(appareil)}`]),
  ];
  return `<p class="meta">${details.join(' – ')}</p>`;
}

function blocFormulaire({ definition, reponses }: FormulaireSynthese): string {
  const sections = definition.sections.map(({ titre, questions }) => {
    const lignes = questions
      .filter((q) => reponses[q.id] !== undefined)
      .map(
        (q) =>
          `<tr><td>${echapperHtml(q.libelle)}</td><td>${echapperHtml(libelleReponse(q, reponses))}</td></tr>`,
      );
    return lignes.length === 0
      ? ''
      : `<div class="bloc"><h3>${echapperHtml(titre)}</h3><table><tbody>\n${lignes.join('\n')}\n</tbody></table></div>`;
  });
  const scores = calculerScores(definition, reponses).map(
    ({ libelle, valeur }) =>
      `<p><strong>${echapperHtml(libelle)}</strong> : ${formaterScore(valeur)}</p>`,
  );
  return [...sections, ...scores].join('\n');
}

function ligneOtoscopie({ oreille, constat, photo }: OtoscopieSynthese): string {
  return `<tr><td>${LIBELLES_OREILLES[oreille]}</td><td>${LIBELLES_ETATS_CONDUIT[constat.conduit]}</td><td>${LIBELLES_ETATS_TYMPAN[constat.tympan]}</td><td>${constat.observation === null ? '—' : echapperHtml(constat.observation)}</td><td>${photo ? 'Au dossier' : '—'}</td></tr>`;
}

function ligneGrade(oreille: Oreille, { perteMoyenne, grade }: ResultatOreille): string {
  return perteMoyenne === null || grade === null
    ? `<tr><td>${LIBELLES_OREILLES[oreille]}</td><td colspan="2">Non calculable : seuil manquant à 500, 1000, 2000 ou 4000 Hz</td></tr>`
    : `<tr><td>${LIBELLES_OREILLES[oreille]}</td><td>${formaterDb(perteMoyenne)}</td><td>Grade ${String(grade)} – ${LIBELLES_GRADES[grade]}</td></tr>`;
}

function configuration({ asymetrique, unilaterale, global }: SyntheseTonale): string {
  const constats = [
    ...(unilaterale ? ['Perte unilatérale.'] : []),
    ...(asymetrique ? ['Perte asymétrique.'] : []),
    ...(global === null
      ? []
      : [
          `Grade global : ${String(global.grade)} – ${LIBELLES_GRADES[global.grade]} (${formaterDb(global.perteMoyenne)}).`,
        ]),
  ];
  return constats.length === 0 ? '' : `<p>${constats.join(' ')}</p>`;
}

function blocTonale(tonale: NonNullable<VueSyntheseBilan['tonale']>): string {
  const { audiogramme } = tonale;
  const synthese = syntheseTonale(audiogramme);
  const libelle = dateFr(tonale.date);
  return `<h2>${LIBELLES_TYPES_MESURE.TONALE}</h2>
${meta(tonale)}
<div class="graphiques">
${rendreAudiogrammeSvg('DROITE', { libelle, courbes: audiogramme.droite })}
${rendreAudiogrammeSvg('GAUCHE', { libelle, courbes: audiogramme.gauche })}
</div>
${rendreLegendeAudiogrammeSvg()}
<table>
<thead><tr><th>Oreille</th><th>Perte moyenne</th><th>Grade audiométrique</th></tr></thead>
<tbody>
${ligneGrade('DROITE', synthese.droite)}
${ligneGrade('GAUCHE', synthese.gauche)}
</tbody>
</table>
${configuration(synthese)}
<p class="mention">${MENTION_GRADE}</p>`;
}

function ligneVocale(courbe: CourbeVocale): string {
  const niveau = niveauA50Pourcent(courbe.points);
  return `<tr><td>${LIBELLES_ECOUTES_VOCALE[courbe.ecoute]}</td><td>${LIBELLES_TRANSDUCTEURS_VOCALE[courbe.transducteur]}</td><td>${courbe.appareille ? 'Avec' : 'Sans'}</td><td>${courbe.liste === null ? '—' : echapperHtml(courbe.liste)}</td><td>${String(meilleurPourcentage(courbe.points))} %</td><td>${niveau === null ? '—' : `${niveau.toFixed(1).replace('.', ',')} dB`}</td></tr>`;
}

function blocVocale(mesure: VueSyntheseBilan['vocales'][number]): string {
  const { vocale } = mesure;
  const type = vocale.contexte === 'CALME' ? 'VOCALE_CALME' : 'VOCALE_BRUIT';
  return `<div class="bloc"><h2>${LIBELLES_TYPES_MESURE[type]}</h2>
${meta(mesure)}
${vocale.typeBruit === null ? '' : `<p>Bruit : ${echapperHtml(vocale.typeBruit)}</p>`}
${rendreVocaleSvg(vocale)}
<table>
<thead><tr><th>Écoute</th><th>Mode</th><th>Appareil</th><th>Liste</th><th>Meilleur score</th><th>Niveau à 50 %</th></tr></thead>
<tbody>
${vocale.courbes.map(ligneVocale).join('\n')}
</tbody>
</table></div>`;
}

/**
 * Synthèse du bilan audiologique, rendue à la demande et jamais stockée (ADR-022).
 * À VÉRIFIER : aucun document ne fixe son contenu, ce modèle est un choix applicatif (R26).
 */
export function rendreSyntheseBilanHtml(vue: VueSyntheseBilan): string {
  const { centre, patient } = vue;
  // La droite d'abord, comme sur l'audiogramme.
  const otoscopies = (['DROITE', 'GAUCHE'] as const).flatMap((oreille) =>
    vue.otoscopies.filter((o) => o.oreille === oreille),
  );
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Bilan audiologique</title><style>${STYLE}</style></head>
<body>
<div class="entete">
<div>
<p><strong>${echapperHtml(centre.nom)}</strong></p>
${centre.adresse.map((ligne) => `<p>${echapperHtml(ligne)}</p>`).join('\n')}
${centre.telephone === null ? '' : `<p>${echapperHtml(centre.telephone)}</p>`}
</div>
<div>
<p><strong>${echapperHtml(patient.prenomNom)}</strong></p>
<p>Né(e) le ${dateFr(patient.dateNaissance)}</p>
</div>
</div>
<h1>Synthèse du bilan audiologique du ${dateFr(vue.dateBilan)}</h1>
${vue.praticien === null ? '' : `<p>Audioprothésiste : ${echapperHtml(vue.praticien)}</p>`}
${vue.anamnese === null ? '' : `<h2>Anamnèse</h2>\n${blocFormulaire(vue.anamnese)}`}
${
  otoscopies.length === 0
    ? ''
    : `<h2>Otoscopie</h2>
<table>
<thead><tr><th>Oreille</th><th>Conduit</th><th>Tympan</th><th>Observation</th><th>Photo</th></tr></thead>
<tbody>
${otoscopies.map(ligneOtoscopie).join('\n')}
</tbody>
</table>`
}
${vue.tonale === null ? '' : blocTonale(vue.tonale)}
${vue.vocales.map(blocVocale).join('\n')}
${vue.questionnaires.map((q) => `<h2>${echapperHtml(q.nom)}</h2>\n${blocFormulaire(q)}`).join('\n')}
</body>
</html>
`;
}
