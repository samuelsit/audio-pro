import { codePrestation, type Oreille } from '../audio-rules/code-prestation';
import type { RubriqueOffre } from '../audio-rules/controle-devis';
import type { TypeAppareillage } from '../audio-rules/prescription';
import {
  LIBELLES_LIEUX_FABRICATION,
  LIBELLES_TYPES_AIDE_AUDITIVE,
  type ClasseLpp,
} from '../catalogue';
import { formatEuros, type Centimes } from '../money';
import type { DevisCalcule, OffreCalculee, PosteCalcule } from './calcul';
import { MODELE_DEVIS } from './modele';
import type { DesignationAide, LigneConsommable, OffreDonnees } from './types';

export interface OreilleVue {
  readonly type: TypeAppareillage | null;
  readonly datePrecedent: string | null;
}

/** Données du devis normalisé. `nir` : en clair uniquement dans ce rendu, jamais journalisé. */
export interface VueDevis {
  readonly entreprise: {
    readonly nom: string;
    readonly adresse: readonly string[];
    readonly telephone: string;
    readonly email: string;
    readonly siret: string | null;
    readonly rcs: string | null;
    readonly finess: string | null;
    readonly tvaIntracommunautaire: string | null;
  };
  readonly audioprothesiste: {
    readonly prenomNom: string;
    readonly identifiant: string;
  };
  readonly patient: {
    readonly prenomNom: string;
    readonly nir: string;
    readonly organismeComplementaire: string | null;
  };
  readonly datePrescription: string | null;
  readonly numero: string;
  readonly dateEmission: string;
  readonly lieuEmission: string;
  readonly dateFinValidite: string;
  readonly oreilles: Readonly<Record<Oreille, OreilleVue>>;
  readonly c2s: boolean;
  readonly bobineTPresentee: boolean;
  readonly depotGarantie: Centimes | null;
  readonly offres: readonly OffreDonnees[];
  readonly calcul: DevisCalcule;
}

export function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dateFr(date: string | null): string {
  if (date === null) {
    return '…/…/……';
  }
  const [annee, mois, jour] = date.split('-');
  return `${String(jour)}/${String(mois)}/${String(annee)}`;
}

function euros(montant: Centimes | null | undefined): string {
  return montant === null || montant === undefined ? '' : echapperHtml(formatEuros(montant));
}

function caseACocher(cochee: boolean): string {
  return `<span class="case${cochee ? ' cochee' : ''}"></span>`;
}

function ouiNon(valeur: boolean | null): string {
  if (valeur === null) {
    return '';
  }
  return valeur ? 'oui' : 'non';
}

/** Une ligne par mention du tableau des offres, déjà échappée. */
function lignesAide(aide: DesignationAide): string[] {
  const lieu = aide.lieuFabrication && LIBELLES_LIEUX_FABRICATION[aide.lieuFabrication];
  const type = LIBELLES_TYPES_AIDE_AUDITIVE[aide.type];
  const modele = aide.modele.startsWith(aide.gamme) ? aide.modele : `${aide.gamme} ${aide.modele}`;
  const brutes = [
    [aide.fabricant, aide.adresseFabricant].filter(Boolean).join(', '),
    ...(aide.mandataire === null ? [] : [`Mandataire : ${aide.mandataire}`]),
    `Marque : ${aide.marque ?? ''} ; modèle : ${modele} ; référence commerciale : ${aide.referenceCommerciale ?? ''} ;`,
    `Lieu de fabrication : ${lieu ?? ''} ;`,
    'Caractéristiques essentielles, notamment :',
    `- type : ${type}, nombre de canaux : ${String(aide.nombreCanaux ?? '')} ;`,
    `- dispositifs de connectivité : ${aide.connectivite ?? ''} ;`,
    `- anti-larsen : ${ouiNon(aide.antiLarsen)} ;`,
    `- réducteur d’acouphènes : ${ouiNon(aide.reducteurAcouphenes)} ;`,
    `- accessibilité de la boucle magnétique ou bobine T : ${ouiNon(aide.bobineT)}`,
  ];
  return brutes.map(echapperHtml);
}

function descriptionDroite(aide: DesignationAide | undefined): string {
  return aide === undefined ? MODELE_DEVIS.descriptionAide : lignesAide(aide).join('<br>');
}

/** Le modèle ne demande que ce qui diffère de l'aide droite. */
function descriptionGauche(
  droite: DesignationAide | undefined,
  gauche: DesignationAide | undefined,
): string {
  if (gauche === undefined) {
    return MODELE_DEVIS.descriptionGauche;
  }
  const reference = droite === undefined ? [] : lignesAide(droite);
  const differences = lignesAide(gauche).filter((ligne) => !reference.includes(ligne));
  return differences.length === 0
    ? 'Identique à l’aide auditive droite.'
    : differences.join('<br>');
}

function descriptionConsommables(lignes: readonly LigneConsommable[]): string {
  if (lignes.length === 0) {
    return MODELE_DEVIS.descriptionConsommables;
  }
  return lignes
    .map(({ designation, quantite }) =>
      echapperHtml(
        `${designation.marque ?? ''}, ${designation.nom}, référence ${designation.referenceCommerciale ?? ''} × ${String(quantite)}`,
      ),
    )
    .join('<br>');
}

/** À VÉRIFIER : « code de regroupement » n'est défini par aucun texte de docs/ref, codes R7 retenus. */
function codeAide(oreille: Oreille, classe: ClasseLpp | undefined, c2s: boolean): string {
  return classe === undefined ? 'code de regroupement' : codePrestation({ classe, oreille, c2s });
}

function codesConsommables(lignes: readonly LigneConsommable[]): string {
  if (lignes.length === 0) {
    return 'code de regroupement';
  }
  return [...new Set(lignes.map(({ nature }) => codePrestation({ nature })))].join(', ');
}

/** Colonnes de prix : deux en 1.1, trois en 1.2 (« Prix HT après remise »). */
function cellulesPrix(rubrique: RubriqueOffre, poste: PosteCalcule | null): string {
  const remise =
    rubrique === 'AUTRE_OFFRE' ? `<td class="prix">${euros(poste?.htApresRemise)}</td>` : '';
  return `<td class="prix">${euros(poste?.ht)}</td>${remise}<td class="prix">${euros(poste?.ttc)}</td>`;
}

function ligneOffre(
  rubrique: RubriqueOffre,
  libelle: string,
  code: string,
  description: string,
  poste: PosteCalcule | null,
): string {
  return `<tr class="ligne-offre"><td class="libelle">${libelle}<br><small>(${code})</small></td><td>${description}</td>${cellulesPrix(rubrique, poste)}</tr>`;
}

function ligneMontant(libelle: string, colonnes: number, montant: string): string {
  return `<tr><td colspan="${String(colonnes)}">${libelle}</td><td></td><td class="prix">${montant}</td></tr>`;
}

interface OffreImprimee {
  readonly donnees: OffreDonnees | undefined;
  readonly calcul: OffreCalculee | undefined;
}

function offreImprimee(vue: VueDevis, rubrique: RubriqueOffre): OffreImprimee {
  return {
    donnees: vue.offres.find((offre) => offre.rubrique === rubrique),
    calcul: vue.calcul.offres.find((offre) => offre.rubrique === rubrique),
  };
}

function aideDe(offre: OffreDonnees | undefined, oreille: Oreille) {
  return offre?.aides.find((aide) => aide.oreille === oreille);
}

function lignesAides(rubrique: RubriqueOffre, offre: OffreImprimee, c2s: boolean): string {
  const droite = aideDe(offre.donnees, 'DROITE');
  const gauche = aideDe(offre.donnees, 'GAUCHE');
  return [
    ligneOffre(
      rubrique,
      'Aide auditive droite',
      codeAide('DROITE', droite?.classe, c2s),
      descriptionDroite(droite?.designation),
      offre.calcul?.droite ?? null,
    ),
    ligneOffre(
      rubrique,
      'Aide auditive gauche',
      codeAide('GAUCHE', gauche?.classe, c2s),
      descriptionGauche(droite?.designation, gauche?.designation),
      offre.calcul?.gauche ?? null,
    ),
  ].join('');
}

function ligneConsommables(rubrique: RubriqueOffre, offre: OffreImprimee): string {
  const lignes = offre.donnees?.consommables ?? [];
  return ligneOffre(
    rubrique,
    'Consommables, piles et accessoires',
    codesConsommables(lignes),
    descriptionConsommables(lignes),
    offre.calcul?.consommables ?? null,
  );
}

/** Lignes de total communes aux deux offres ; seule l'offre 1.1 porte l'appel de note 2. */
function lignesTotaux(rubrique: RubriqueOffre, offre: OffreImprimee, libelleTotal: string): string {
  const total = offre.calcul?.total;
  const colonnes = rubrique === 'AUTRE_OFFRE' ? 3 : 2;
  const note2 = rubrique === 'OFFRE_100_SANTE' ? '<sup>2</sup>' : '';
  return [
    `<tr class="total"><td colspan="2">${libelleTotal}</td>${cellulesPrix(rubrique, total ?? null)}</tr>`,
    ligneMontant(
      `Montant pris en charge par l’assurance maladie obligatoire${note2} :`,
      colonnes,
      euros(total?.amo),
    ),
    ligneMontant(
      'Montant pris en charge par l’organisme complémentaire d’assurance maladie, si connu <sup>3</sup> :',
      colonnes,
      euros(total?.amc),
    ),
    ligneMontant(
      'Montant total du reste à charge, si connu :',
      colonnes,
      euros(total?.resteACharge),
    ),
  ].join('');
}

function ligneOreille(libelle: string, oreille: OreilleVue): string {
  const date = oreille.type === 'RENOUVELLEMENT' ? oreille.datePrecedent : null;
  return `<p>Oreille ${libelle} : ${caseACocher(oreille.type === 'PRIMO')} Premier appareillage ; ${caseACocher(oreille.type === 'RENOUVELLEMENT')} Renouvellement (si oui, date du précédent appareillage : ${dateFr(date)})</p>`;
}

function enTete(vue: VueDevis): string {
  const { entreprise, audioprothesiste, patient } = vue;
  return `<header>
  <div class="logo"></div>
  <h1>${MODELE_DEVIS.titre}</h1>
  <p class="sous-titre">${MODELE_DEVIS.sousTitre}<br>${MODELE_DEVIS.references}</p>
</header>
<div class="identites">
  <div>
    <div class="cadre">
      <strong>Nom de l’entreprise</strong> ${echapperHtml(entreprise.nom)}<br>
      <strong>Audioprothésiste</strong> (prénom, nom) ${echapperHtml(audioprothesiste.prenomNom)}<br>
      Adresse d’exercice ${entreprise.adresse.map(echapperHtml).join(', ')}<br>
      Tél ${echapperHtml(entreprise.telephone)}<br>
      Courriel ${echapperHtml(entreprise.email)}<br>
      N° d’identification ADELI ou RPPS ${echapperHtml(audioprothesiste.identifiant)}
    </div>
    <div class="cadre">
      <strong>N° du devis</strong> ${echapperHtml(vue.numero)}<br>
      Date et lieu d’émission : ${dateFr(vue.dateEmission)} à ${echapperHtml(vue.lieuEmission)}<br>
      Valable jusqu’au (validité d’au moins 2 mois) : ${dateFr(vue.dateFinValidite)}
    </div>
  </div>
  <div>
    <div class="cadre">
      <strong>Patient</strong> (prénom, nom) ${echapperHtml(patient.prenomNom)}<br>
      N° de sécurité sociale ${echapperHtml(patient.nir)}<br>
      Organisme complémentaire d’assurance maladie (facultatif) ${echapperHtml(patient.organismeComplementaire ?? '')}
    </div>
    <div class="cadre">Date de la prescription médicale préalable obligatoire : ${dateFr(vue.datePrescription)}</div>
  </div>
</div>
<div class="oreilles">
  ${ligneOreille('droite', vue.oreilles.DROITE)}
  ${ligneOreille('gauche', vue.oreilles.GAUCHE)}
</div>`;
}

const COLONNES_100_SANTE =
  '<colgroup><col class="libelle"><col><col class="prix"><col class="prix"></colgroup>';
const COLONNES_AUTRE =
  '<colgroup><col class="libelle"><col><col class="prix"><col class="prix"><col class="prix"></colgroup>';

function offre100Sante(vue: VueDevis): string {
  const offre = offreImprimee(vue, 'OFFRE_100_SANTE');
  return `<h2 class="titre-offre">1.1. Offre 100% santé<sup>1</sup>:</h2>
<div class="cadre large">${MODELE_DEVIS.offre100Sante}</div>
<table class="offre">
  ${COLONNES_100_SANTE}
  <thead><tr><th colspan="2">${MODELE_DEVIS.enteteOffres}</th><th>Prix HT</th><th>Prix TTC</th></tr></thead>
  <tbody>
    ${lignesAides('OFFRE_100_SANTE', offre, vue.c2s)}
    ${ligneConsommables('OFFRE_100_SANTE', offre)}
    ${lignesTotaux('OFFRE_100_SANTE', offre, 'Total offre 100% santé')}
  </tbody>
</table>`;
}

function autreOffreDebut(vue: VueDevis): string {
  const offre = offreImprimee(vue, 'AUTRE_OFFRE');
  return `<h2 class="titre-offre">1.2. Autre offre :</h2>
<table class="offre">
  ${COLONNES_AUTRE}
  <thead><tr><th colspan="2">${MODELE_DEVIS.enteteOffres}</th><th>Prix HT</th><th>Prix HT après remise</th><th>Prix TTC</th></tr></thead>
  <tbody>${lignesAides('AUTRE_OFFRE', offre, vue.c2s)}</tbody>
</table>`;
}

function autreOffreFin(vue: VueDevis): string {
  const offre = offreImprimee(vue, 'AUTRE_OFFRE');
  return `<table class="offre">
  ${COLONNES_AUTRE}
  <tbody>
    ${ligneConsommables('AUTRE_OFFRE', offre)}
    ${lignesTotaux('AUTRE_OFFRE', offre, 'Total autre offre')}
  </tbody>
</table>`;
}

function rubriquesFinales(vue: VueDevis): string {
  const { entreprise } = vue;
  const offreChoisie = (libelle: string) =>
    `${caseACocher(false)} ${libelle} (1.1) &nbsp;&nbsp;&nbsp; ${caseACocher(false)} Autre offre (1.2)`;
  return `<h2>2. Présentation de la bobine T :</h2>
<p>${MODELE_DEVIS.bobineT}</p>
<p>${caseACocher(vue.bobineTPresentee)} <small>${MODELE_DEVIS.bobineTCase}</small></p>
<div class="encadre">
  <h2>3. Essai de l’aide auditive sans engagement de votre part :</h2>
  ${MODELE_DEVIS.essai.map((texte) => `<p>${texte}</p>`).join('\n  ')}
  <p>- Montant du dépôt de garantie pour le matériel confié pendant les essais, le cas échéant : ${vue.depotGarantie === null ? '…' : euros(vue.depotGarantie)}</p>
  <p><strong><u>Offre choisie pour la réalisation de l’essai</u> :</strong> &nbsp;&nbsp; ${offreChoisie('Offre 100% santé')}</p>
</div>
<h2>4. Informations sur les prestations et garanties :</h2>
${MODELE_DEVIS.prestations.map((texte) => `<p>${texte}</p>`).join('\n')}
<p><small>${MODELE_DEVIS.autresInformations}</small></p>
<div class="encadre">
  <h2>5. Validation de la commande et engagement final :</h2>
  <p>${MODELE_DEVIS.validation}</p>
  <p><strong><u>Offre choisie à l’issue de la réalisation de l’essai</u> :</strong> &nbsp;&nbsp; ${offreChoisie('Offre 100% Santé')}</p>
  <p>Nom, prénom et signature de l’audioprothésiste D.E ayant réalisé le devis : ${echapperHtml(vue.audioprothesiste.prenomNom)}</p>
  <p class="signature-patient">Signature du patient lors de l’acceptation des conditions du devis<sup>4</sup> à l’issue de la période d’essai (précédée de la mention « <em>bon pour accord</em> » et de la date) <strong>:</strong></p>
</div>
<p class="identification">Informations d’identification de l’entreprise (n° SIRET, n° RCS, n° FINESS, n° TVA intracommunautaire) : ${[entreprise.siret, entreprise.rcs, entreprise.finess, entreprise.tvaIntracommunautaire].map((valeur) => echapperHtml(valeur ?? '')).join(' ; ')}</p>`;
}

const STYLE = `@page { size: A4; margin: 9mm 12mm 11mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 7.6pt/1.17 Arial, Helvetica, sans-serif; color: #000; }
.page { min-height: 277mm; display: flex; flex-direction: column; break-after: page; }
.page:last-child { break-after: auto; }
.notes { margin-top: auto; padding-top: 3mm; font-size: 6.2pt; font-style: italic; }
.notes::before { content: ''; display: block; width: 45mm; border-top: 0.5pt solid #000; margin-bottom: 1mm; }
.notes p { margin: 0; }
header { position: relative; min-height: 16mm; text-align: center; }
.logo { position: absolute; left: 0; top: 0; width: 37mm; height: 15mm; border: 0.75pt solid #000; }
h1 { margin: 2mm 0 0.5mm 38mm; font-size: 9.5pt; font-weight: bold; }
.sous-titre { margin: 0 0 0 38mm; font-size: 6.8pt; }
.identites { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 1.5mm 7mm 0; }
.cadre { border: 0.5pt dotted #000; padding: 1mm 1.5mm; margin-bottom: 1.5mm; }
.cadre.large { margin: 0.5mm 0 1mm; }
.oreilles { margin: 0 0 1mm 8mm; }
.oreilles p { margin: 0; }
.avertissement { border: 0.75pt dotted #000; padding: 0.8mm 1.5mm; margin: 0 0 1mm; font-weight: bold; font-size: 7.8pt; text-align: justify; }
h2 { margin: 1.5mm 0 0.7mm; font-size: 8.4pt; font-weight: bold; text-decoration: underline; }
.titre-offre { margin-left: 3mm; }
p { margin: 0.6mm 0; text-align: justify; }
small { font-size: 6.2pt; }
table.offre { width: 100%; border-collapse: collapse; table-layout: fixed; }
.offre th, .offre td { border: 0.5pt dotted #000; padding: 0.5mm 1mm; vertical-align: top; font-weight: normal; text-align: left; }
.offre thead th:first-child { font-weight: bold; }
.offre tr { break-inside: avoid; }
.offre td.prix { white-space: nowrap; text-align: right; }
.offre col.libelle { width: 35mm; }
.offre col.prix { width: 20mm; }
.total td { font-weight: bold; text-align: right; }
.encadre { border: 0.75pt solid #000; padding: 0.5mm 1.5mm; margin: 1mm 0; }
.signature-patient { min-height: 13mm; }
.identification { font-size: 6.8pt; margin-top: 1mm; }
.case { display: inline-block; width: 2.3mm; height: 2.3mm; border: 0.6pt solid #000; vertical-align: -0.3mm; position: relative; }
.case.cochee::after { content: 'X'; position: absolute; inset: 0; font: bold 6.4pt/2.2mm Arial, Helvetica, sans-serif; text-align: center; }`;

/**
 * Devis normalisé en HTML autonome, reproduisant structure, rubriques et mentions du modèle, sans rien
 * y ajouter. Les offres choisies et les signatures se remplissent à la main (§ 3 et § 5).
 * Toute donnée variable est échappée.
 * Source : modele-devis-audio.pdf p. 1 et 2.
 * À VÉRIFIER : « Date de Naissance » existe dans la couche texte du modèle, invisible à l'affichage ;
 * non imprimée.
 */
export function rendreDevisHtml(vue: VueDevis): string {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Devis normalisé</title><style>${STYLE}</style></head>
<body>
<section class="page">
${enTete(vue)}
<div class="avertissement">${MODELE_DEVIS.avertissement}</div>
${offre100Sante(vue)}
${autreOffreDebut(vue)}
<div class="notes"><p>${MODELE_DEVIS.note1}</p><p>${MODELE_DEVIS.note2}</p><p>${MODELE_DEVIS.note3}</p></div>
</section>
<section class="page">
${autreOffreFin(vue)}
${rubriquesFinales(vue)}
<div class="notes"><p>${MODELE_DEVIS.note4}</p></div>
</section>
</body>
</html>
`;
}
