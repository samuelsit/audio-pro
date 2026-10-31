import { LIBELLES_OREILLES, type Oreille } from '../audio-rules/code-prestation';
import { dateFr, echapperHtml } from '../devis/rendu';
import {
  LIBELLES_ISSUES_ESSAI,
  LIBELLES_TYPES_RDV_ESSAI,
  type IssueEssai,
  type TypeRdvEssai,
} from './saisie';

export interface AppareilCompteRendu {
  readonly oreille: Oreille;
  readonly designation: string;
  readonly numeroSerie: string;
  readonly pose: string;
  /** `null` tant que l'appareil reste en essai. */
  readonly retrait: string | null;
}

export interface RdvCompteRendu {
  readonly date: string;
  readonly type: TypeRdvEssai;
  readonly compteRendu: string;
}

/** Données du courrier au prescripteur : ni NIR ni montant, il ne rend compte que de la prestation. */
export interface VueCompteRenduEssai {
  readonly entreprise: {
    readonly nom: string;
    readonly adresse: readonly string[];
    readonly telephone: string;
    readonly email: string;
  };
  readonly audioprothesiste: { readonly prenomNom: string; readonly identifiant: string };
  readonly prescripteur: { readonly prenomNom: string; readonly cabinet: string | null };
  readonly patient: { readonly prenomNom: string; readonly dateNaissance: string };
  readonly lieu: string;
  readonly dateCourrier: string;
  readonly debut: string;
  readonly fin: string | null;
  readonly echeance: string;
  readonly issue: IssueEssai | null;
  readonly prolongation: { readonly dateDemande: string; readonly jours: number } | null;
  readonly appareils: readonly AppareilCompteRendu[];
  readonly rdvs: readonly RdvCompteRendu[];
}

const STYLE = `
@page { size: A4; margin: 18mm 16mm; }
body { font: 10.5pt/1.45 Arial, Helvetica, sans-serif; color: #111; }
h1 { font-size: 13pt; margin: 24px 0 12px; }
h2 { font-size: 11pt; margin: 18px 0 6px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #888; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; font-weight: 600; }
.entete { display: flex; justify-content: space-between; gap: 24px; }
.entete p, .signature p { margin: 0; }
.compte-rendu { white-space: pre-wrap; }
.signature { margin-top: 28px; }
`;

function texte(valeur: string): string {
  return echapperHtml(valeur);
}

function conclusion(vue: VueCompteRenduEssai): string {
  if (vue.issue === null) {
    return `Essai en cours, échéance au ${dateFr(vue.echeance)}.`;
  }
  return `Issue de l’essai : ${LIBELLES_ISSUES_ESSAI[vue.issue].toLowerCase()}, le ${dateFr(vue.fin)}.`;
}

function ligneAppareil(a: AppareilCompteRendu): string {
  return `<tr><td>${LIBELLES_OREILLES[a.oreille]}</td><td>${texte(a.designation)}</td><td>${texte(a.numeroSerie)}</td><td>${dateFr(a.pose)}</td><td>${a.retrait === null ? '—' : dateFr(a.retrait)}</td></tr>`;
}

function ligneRdv(r: RdvCompteRendu): string {
  return `<tr><td>${dateFr(r.date)}</td><td>${LIBELLES_TYPES_RDV_ESSAI[r.type]}</td><td class="compte-rendu">${texte(r.compteRendu)}</td></tr>`;
}

/**
 * Courrier de synthèse de l'essai, remis au prescripteur.
 * Source : convention-audioprothesistes.pdf, art. 18 6°, p. 20 ; modele-devis-audio.pdf p. 2 § 4.
 * À VÉRIFIER : aucun document ne fixe son contenu, ce modèle est un choix applicatif (R20).
 */
export function rendreCompteRenduEssaiHtml(vue: VueCompteRenduEssai): string {
  const { entreprise, audioprothesiste, prescripteur, patient, prolongation } = vue;
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Compte rendu d’essai</title><style>${STYLE}</style></head>
<body>
<div class="entete">
<div>
<p><strong>${texte(entreprise.nom)}</strong></p>
${entreprise.adresse.map((ligne) => `<p>${texte(ligne)}</p>`).join('\n')}
<p>${texte(entreprise.telephone)} – ${texte(entreprise.email)}</p>
</div>
<div>
<p><strong>${texte(prescripteur.prenomNom)}</strong></p>
${prescripteur.cabinet === null ? '' : `<p>${texte(prescripteur.cabinet)}</p>`}
<p>${texte(vue.lieu)}, le ${dateFr(vue.dateCourrier)}</p>
</div>
</div>
<h1>Compte rendu de la période d’essai</h1>
<p>Patient : <strong>${texte(patient.prenomNom)}</strong>, né(e) le ${dateFr(patient.dateNaissance)}.</p>
<p>Essai débuté le ${dateFr(vue.debut)}. ${conclusion(vue)}</p>
${
  prolongation === null
    ? ''
    : `<p>Prolongation de ${String(prolongation.jours)} jours à votre demande du ${dateFr(prolongation.dateDemande)}.</p>`
}
<h2>Appareils confiés</h2>
<table>
<thead><tr><th>Oreille</th><th>Appareil</th><th>N° de série</th><th>Pose</th><th>Retrait</th></tr></thead>
<tbody>
${vue.appareils.map(ligneAppareil).join('\n')}
</tbody>
</table>
<h2>Rendez-vous</h2>
<table>
<thead><tr><th>Date</th><th>Type</th><th>Compte rendu</th></tr></thead>
<tbody>
${vue.rdvs.map(ligneRdv).join('\n')}
</tbody>
</table>
<div class="signature">
<p>${texte(audioprothesiste.prenomNom)}, audioprothésiste D.E.</p>
<p>N° ${texte(audioprothesiste.identifiant)}</p>
</div>
</body>
</html>
`;
}
