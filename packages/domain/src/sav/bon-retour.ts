import { dateFr, echapperHtml } from '../devis/rendu';
import { LIBELLES_MOTIFS_SAV, type MotifSav } from './garantie';

/**
 * Tout ce qui sort vers le fabricant : aucun champ d'identité. La description, seul texte libre, se saisit pour le
 * fabricant, avec un rappel à l'écran. À VÉRIFIER : numéro de série et date de délivrance, associés à une référence
 * interne, restent-ils hors du champ des données de santé (R50, R54) ?
 */
export interface BonRetourVue {
  readonly numero: string;
  readonly dateBon: string;
  readonly expediteur: {
    readonly raisonSociale: string;
    readonly siret: string | null;
    readonly nom: string;
    readonly adresse: readonly string[];
    readonly telephone: string;
    readonly email: string;
  };
  readonly fournisseur: { readonly nom: string; readonly adresse: string | null };
  /** Numéro du ticket, ou de la commande pour un produit non conforme. */
  readonly reference: string | null;
  readonly designation: string;
  readonly numeroSerie: string | null;
  readonly quantite: number;
  readonly dateDelivrance: string | null;
  /** `null` : l'appareil n'a pas été vendu. */
  readonly sousGarantie: boolean | null;
  readonly motif: MotifSav | null;
  readonly description: string | null;
}

const STYLE = `
@page { size: A4; margin: 15mm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #111; }
h1 { font-size: 16pt; margin: 0 0 4mm; }
.identites { display: flex; justify-content: space-between; gap: 10mm; margin: 6mm 0; }
.identites > div { flex: 1; }
table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
th, td { border-bottom: 0.2mm solid #999; padding: 1.5mm; text-align: left; vertical-align: top; }
.mention { margin-top: 6mm; font-size: 9pt; color: #444; }
`;

function ligne(libelle: string, valeur: string | null): string {
  return valeur === null ? '' : `<tr><th>${libelle}</th><td>${echapperHtml(valeur)}</td></tr>`;
}

function garantie(sousGarantie: boolean | null): string | null {
  if (sousGarantie === null) {
    return null;
  }
  return sousGarantie ? 'Sous garantie' : 'Hors garantie';
}

/** Bon de retour en HTML autonome. Toute donnée variable est échappée. */
export function rendreBonRetourHtml(vue: BonRetourVue): string {
  const { numero, dateBon, expediteur, fournisseur } = vue;
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Bon de retour ${echapperHtml(numero)}</title><style>${STYLE}</style></head>
<body>
<h1>Bon de retour n° ${echapperHtml(numero)}</h1>
<p>Date : ${dateFr(dateBon)}</p>
<div class="identites">
  <div><strong>Expéditeur</strong><br>${[expediteur.raisonSociale, ...(expediteur.siret === null ? [] : [`SIRET ${expediteur.siret}`]), expediteur.nom, ...expediteur.adresse, expediteur.telephone, expediteur.email].map(echapperHtml).join('<br>')}</div>
  <div><strong>Destinataire</strong><br>${echapperHtml(fournisseur.nom)}${fournisseur.adresse === null ? '' : `<br>${echapperHtml(fournisseur.adresse)}`}</div>
</div>
<table>
  <tbody>
    ${ligne('Référence', vue.reference)}
    ${ligne('Produit', vue.designation)}
    ${ligne('Numéro de série', vue.numeroSerie)}
    ${ligne('Quantité', String(vue.quantite))}
    ${ligne('Date de délivrance', vue.dateDelivrance === null ? null : dateFr(vue.dateDelivrance))}
    ${ligne('Garantie', garantie(vue.sousGarantie))}
    ${ligne('Motif', vue.motif === null ? null : LIBELLES_MOTIFS_SAV[vue.motif])}
    ${ligne('Description', vue.description)}
  </tbody>
</table>
<p class="mention">Merci de rappeler ce numéro dans votre réponse et sur le bon de livraison.</p>
</body>
</html>
`;
}
