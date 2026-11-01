import { dateFr, echapperHtml } from '../devis/rendu';
import { centimes, formatEuros } from '../money';
import type { OreilleCommande } from './saisie';

export interface LigneBon {
  readonly reference: string | null;
  readonly designation: string;
  readonly quantite: number;
  readonly prixUnitaireCentimes: number | null;
  /** Code aléatoire d'une ligne nominative. */
  readonly referencePatient: string | null;
  readonly oreille: OreilleCommande | null;
}

/**
 * Tout ce qui sort vers le fabricant. Aucun champ d'identité ni texte libre : le nom d'un patient, son NIR ou une
 * donnée de santé ne peuvent pas y entrer, faute de place où les mettre.
 */
export interface BonCommandeVue {
  readonly numero: string;
  readonly dateCommande: string;
  readonly client: { readonly raisonSociale: string; readonly siret: string | null };
  readonly livraison: {
    readonly nom: string;
    readonly adresse: readonly string[];
    readonly telephone: string;
    readonly email: string;
  };
  readonly fournisseur: {
    readonly nom: string;
    readonly adresse: string | null;
    readonly numeroClient: string | null;
  };
  readonly lignes: readonly LigneBon[];
}

const LIBELLES_OREILLE: Readonly<Record<OreilleCommande, string>> = {
  DROITE: 'droite',
  GAUCHE: 'gauche',
};

const STYLE = `
@page { size: A4; margin: 15mm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #111; }
h1 { font-size: 16pt; margin: 0 0 4mm; }
.identites { display: flex; justify-content: space-between; gap: 10mm; margin: 6mm 0; }
.identites > div { flex: 1; }
table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
th, td { border-bottom: 0.2mm solid #999; padding: 1.5mm; text-align: left; vertical-align: top; }
.n { text-align: right; }
.total { font-weight: bold; }
.mention { margin-top: 6mm; font-size: 9pt; color: #444; }
`;

function euros(valeur: number): string {
  return echapperHtml(formatEuros(centimes(valeur)));
}

function montant(lignes: readonly LigneBon[]): number | null {
  let total = 0;
  for (const { quantite, prixUnitaireCentimes } of lignes) {
    if (prixUnitaireCentimes === null) {
      return null;
    }
    total += quantite * prixUnitaireCentimes;
  }
  return total;
}

function ligneHtml(ligne: LigneBon): string {
  const { reference, designation, quantite, prixUnitaireCentimes, referencePatient, oreille } =
    ligne;
  const nominative =
    referencePatient === null
      ? ''
      : `<br>Réf. interne ${echapperHtml(referencePatient)}${oreille === null ? '' : `, oreille ${LIBELLES_OREILLE[oreille]}`}`;
  const prix = prixUnitaireCentimes;
  return `<tr><td>${echapperHtml(reference ?? '')}</td><td>${echapperHtml(designation)}${nominative}</td><td class="n">${String(quantite)}</td><td class="n">${prix === null ? '—' : euros(prix)}</td><td class="n">${prix === null ? '—' : euros(prix * quantite)}</td></tr>`;
}

/** Bon de commande en HTML autonome. Toute donnée variable est échappée. */
export function rendreBonCommandeHtml(vue: BonCommandeVue): string {
  const { numero, dateCommande, client, livraison, fournisseur, lignes } = vue;
  const total = montant(lignes);
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Bon de commande ${echapperHtml(numero)}</title><style>${STYLE}</style></head>
<body>
<h1>Bon de commande n° ${echapperHtml(numero)}</h1>
<p>Date : ${dateFr(dateCommande)}</p>
<div class="identites">
  <div><strong>Client</strong><br>${echapperHtml(client.raisonSociale)}${client.siret === null ? '' : `<br>SIRET ${echapperHtml(client.siret)}`}${fournisseur.numeroClient === null ? '' : `<br>N° client ${echapperHtml(fournisseur.numeroClient)}`}</div>
  <div><strong>Fournisseur</strong><br>${echapperHtml(fournisseur.nom)}${fournisseur.adresse === null ? '' : `<br>${echapperHtml(fournisseur.adresse)}`}</div>
  <div><strong>Livraison</strong><br>${[livraison.nom, ...livraison.adresse, livraison.telephone, livraison.email].map(echapperHtml).join('<br>')}</div>
</div>
<table>
  <thead><tr><th>Référence</th><th>Désignation</th><th class="n">Qté</th><th class="n">Prix unitaire</th><th class="n">Total</th></tr></thead>
  <tbody>${lignes.map(ligneHtml).join('\n')}</tbody>
</table>
${total === null ? '' : `<p class="n total">Total commandé : ${euros(total)}</p>`}
<p class="mention">Merci de rappeler ce numéro sur le bon de livraison et sur la facture.</p>
</body>
</html>
`;
}
