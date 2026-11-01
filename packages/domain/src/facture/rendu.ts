import { LIBELLES_OREILLES, type Oreille } from '../audio-rules/code-prestation';
import { dateFr, echapperHtml } from '../devis/rendu';
import { finGarantieMinimale } from '../devis/calcul';
import { GARANTIE_FABRICANT } from '../devis/modele';
import { centimes, formatEuros, type Centimes } from '../money';
import { MENTION_DELIVRANCE, type ClientFacture, type VendeurFacture } from './mentions';
import { LIBELLES_NATURES_PIECE, type NatureLigneFacture, type NaturePiece } from './types';

export interface LigneVue {
  readonly nature: NatureLigneFacture;
  readonly libelle: string;
  readonly oreille: Oreille | null;
  readonly codeLpp: string | null;
  readonly codePrestation: string | null;
  readonly numeroSerie: string | null;
  readonly quantite: number;
  readonly prixTTC: Centimes;
  readonly tauxTva: number;
  readonly montantHT: Centimes;
  readonly montantTva: Centimes;
  readonly baseRemboursement: Centimes;
  readonly amo: Centimes;
  readonly amc: Centimes;
  readonly resteACharge: Centimes;
}

/** Pièce figée, telle qu'imprimée. Ni NIR ni donnée de santé au-delà du détail de la vente. */
export interface VueFacture {
  readonly nature: NaturePiece;
  readonly numero: string;
  readonly dateFacture: string;
  readonly vendeur: VendeurFacture;
  readonly client: ClientFacture;
  readonly lignes: readonly LigneVue[];
  readonly totaux: {
    readonly prixTTC: Centimes;
    readonly ht: Centimes;
    readonly tva: Centimes;
    readonly amo: Centimes;
    readonly amc: Centimes;
    readonly resteACharge: Centimes;
  };
  /** Acomptes repris à la validation (R35). */
  readonly acomptesDeduits?: Centimes;
  /** `false` : le patient règle aussi la part AMO. */
  readonly tiersPayantAmo?: boolean;
  /** Sur un avoir : numéro et date de la facture reprise, et motif. */
  readonly origine: {
    readonly numero: string;
    readonly dateFacture: string;
    readonly motif: string;
  } | null;
}

export interface OptionsRendu {
  readonly duplicata: boolean;
}

export interface LigneRecapTva {
  readonly taux: number;
  readonly ht: Centimes;
  readonly tva: Centimes;
}

/** Récapitulatif par taux, du plus faible au plus fort. */
export function recapitulatifTva(lignes: readonly LigneVue[]): LigneRecapTva[] {
  const taux = [...new Set(lignes.map((l) => l.tauxTva))].sort((a, b) => a - b);
  return taux.map((t) => {
    const retenues = lignes.filter((l) => l.tauxTva === t);
    const somme = (montant: (l: LigneVue) => number) =>
      retenues.reduce((total, ligne) => total + montant(ligne), 0) as Centimes;
    return { taux: t, ht: somme((l) => l.montantHT), tva: somme((l) => l.montantTva) };
  });
}

function euros(montant: Centimes): string {
  return echapperHtml(formatEuros(montant));
}

function pourcentage(taux: number): string {
  return `${(taux / 100).toLocaleString('fr-FR')} %`;
}

function lignesTexte(textes: readonly (string | null)[]): string {
  return textes.flatMap((t) => (t === null ? [] : [echapperHtml(t)])).join('<br>');
}

function blocVendeur(vendeur: VendeurFacture): string {
  const { raisonSociale, nomCentre, adresse, telephone, email } = vendeur;
  const { siret, rcs, finess, tvaIntracommunautaire } = vendeur;
  return lignesTexte([
    raisonSociale,
    nomCentre,
    ...adresse,
    `${telephone} · ${email}`,
    siret && `SIRET : ${siret}`,
    rcs && `RCS : ${rcs}`,
    finess && `FINESS : ${finess}`,
    tvaIntracommunautaire && `TVA intracommunautaire : ${tvaIntracommunautaire}`,
  ]);
}

function ligneDetail(ligne: LigneVue): string {
  const { libelle, oreille, codeLpp, codePrestation, numeroSerie, quantite } = ligne;
  const details = [
    oreille && LIBELLES_OREILLES[oreille],
    codeLpp && `LPP ${codeLpp}`,
    codePrestation && `Code ${codePrestation}`,
    numeroSerie && `N° de série ${numeroSerie}`,
  ].filter((d) => d !== null);
  return `<tr>
  <td>${echapperHtml(libelle)}<br><small>${echapperHtml(details.join(' · '))}</small></td>
  <td class="n">${String(quantite)}</td>
  <td class="n">${euros(ligne.montantHT)}</td>
  <td class="n">${pourcentage(ligne.tauxTva)}</td>
  <td class="n">${euros(ligne.prixTTC)}</td>
  <td class="n">${euros(ligne.baseRemboursement)}</td>
  <td class="n">${euros(ligne.amo)}</td>
  <td class="n">${euros(ligne.amc)}</td>
  <td class="n">${euros(ligne.resteACharge)}</td>
</tr>`;
}

function garantie({ lignes, nature, dateFacture }: VueFacture): string {
  const aides = lignes.some((l) => l.nature === 'AIDE_AUDITIVE');
  if (!aides || nature === 'AVOIR') {
    return '';
  }
  return `<p>${MENTION_DELIVRANCE}</p>
<p>${GARANTIE_FABRICANT}</p>
<p>Garantie minimale du fabricant jusqu’au ${dateFr(finGarantieMinimale(dateFacture))} au moins.</p>`;
}

const STYLE = `@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 9pt/1.3 Arial, Helvetica, sans-serif; color: #000; }
h1 { margin: 0 0 1mm; font-size: 15pt; }
.duplicata { border: 1pt solid #000; padding: 1mm 3mm; margin: 0 0 3mm; font-weight: bold; text-align: center; letter-spacing: 1pt; }
.identites { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin: 4mm 0; }
table { width: 100%; border-collapse: collapse; margin: 3mm 0; }
th, td { border: 0.5pt solid #888; padding: 1mm 1.5mm; vertical-align: top; text-align: left; font-weight: normal; }
th { background: #eee; font-weight: bold; font-size: 8pt; }
tr { break-inside: avoid; }
td.n, th.n { text-align: right; white-space: nowrap; }
small { font-size: 7.5pt; }
.totaux { width: 45%; margin-left: auto; }
.totaux .fort td { font-weight: bold; }
p { margin: 1.5mm 0; }
.mentions { font-size: 8pt; }`;

/**
 * Facture ou avoir en HTML autonome, depuis le contenu figé : rendre deux fois donne le même document.
 * Toute donnée variable est échappée. Un duplicata se distingue de l'original à l'impression.
 * Source : modele-devis-audio.pdf p. 2 § 4 et § 5 (garantie, délivrance) et pied de page (identifiants).
 * À VÉRIFIER : la liste et la présentation des mentions d'une facture sont absentes de docs/ref (R27).
 */
export function rendreFactureHtml(vue: VueFacture, { duplicata }: OptionsRendu): string {
  const { nature, numero, dateFacture, vendeur, client, lignes, totaux, origine } = vue;
  const titre = LIBELLES_NATURES_PIECE[nature];
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${titre} ${echapperHtml(numero)}</title><style>${STYLE}</style></head>
<body>
${duplicata ? '<div class="duplicata">DUPLICATA</div>' : ''}
<h1>${titre} n° ${echapperHtml(numero)}</h1>
<p>Date : ${dateFr(dateFacture)}</p>
${origine === null ? '' : `<p>Avoir sur la facture n° ${echapperHtml(origine.numero)} du ${dateFr(origine.dateFacture)}. Motif : ${echapperHtml(origine.motif)}</p>`}
<div class="identites">
  <div><strong>Vendeur</strong><br>${blocVendeur(vendeur)}</div>
  <div><strong>Client</strong><br>${lignesTexte([client.prenomNom, ...client.adresse])}</div>
</div>
<table>
  <thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">HT</th><th class="n">TVA</th><th class="n">TTC</th><th class="n">Base</th><th class="n">AMO</th><th class="n">AMC</th><th class="n">Reste</th></tr></thead>
  <tbody>${lignes.map(ligneDetail).join('\n')}</tbody>
</table>
<table class="totaux">
  <tbody>
    ${recapitulatifTva(lignes)
      .map(
        ({ taux, ht, tva }) =>
          `<tr><td>TVA ${pourcentage(taux)} sur ${euros(ht)}</td><td class="n">${euros(tva)}</td></tr>`,
      )
      .join('\n    ')}
    <tr><td>Total HT</td><td class="n">${euros(totaux.ht)}</td></tr>
    <tr><td>Total TVA</td><td class="n">${euros(totaux.tva)}</td></tr>
    <tr class="fort"><td>Total TTC</td><td class="n">${euros(totaux.prixTTC)}</td></tr>
    <tr><td>Part AMO</td><td class="n">${euros(totaux.amo)}</td></tr>
    <tr><td>Part AMC</td><td class="n">${euros(totaux.amc)}</td></tr>
    <tr class="fort"><td>Reste à charge</td><td class="n">${euros(totaux.resteACharge)}</td></tr>
    ${
      vue.acomptesDeduits
        ? `<tr><td>Acomptes déduits</td><td class="n">${euros(vue.acomptesDeduits)}</td></tr>`
        : ''
    }
    ${
      vue.tiersPayantAmo === false
        ? `<tr class="fort"><td>Net à régler (sans tiers payant AMO)</td><td class="n">${euros(centimes(totaux.resteACharge + totaux.amo - (vue.acomptesDeduits ?? 0)))}</td></tr>`
        : ''
    }
  </tbody>
</table>
<div class="mentions">${garantie(vue)}</div>
</body>
</html>
`;
}
