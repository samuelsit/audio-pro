import { dateFr, echapperHtml } from '../devis/rendu';

export interface EnTeteCentre {
  readonly nom: string;
  readonly adresse: readonly string[];
  readonly telephone: string;
  readonly email: string;
  readonly siret: string;
}

const STYLE = `
@page { size: A4; margin: 20mm 20mm; }
body { font: 11pt/1.5 Arial, Helvetica, sans-serif; color: #111; }
.entete p, .destinataire p, .signature p { margin: 0; }
.entete { color: #333; font-size: 9.5pt; }
.entete .nom { font-size: 13pt; font-weight: 700; color: #111; }
.destinataire { margin: 28mm 0 12mm 90mm; }
.objet { font-weight: 700; margin-bottom: 8mm; }
.corps { white-space: pre-wrap; }
.signature { margin-top: 14mm; }
`;

/** En-tête commun des courriers : les coordonnées du centre, qui les envoie. */
export function enTeteCentreHtml(centre: EnTeteCentre): string {
  return `<div class="entete">
<p class="nom">${echapperHtml(centre.nom)}</p>
${centre.adresse.map((ligne) => `<p>${echapperHtml(ligne)}</p>`).join('\n')}
<p>${echapperHtml(centre.telephone)} – ${echapperHtml(centre.email)}</p>
<p>SIRET ${echapperHtml(centre.siret)}</p>
</div>`;
}

export interface VueLettre {
  readonly centre: EnTeteCentre;
  readonly destinataire: { readonly nom: string; readonly adresse: readonly string[] };
  readonly lieu: string;
  readonly date: string;
  readonly objet: string;
  readonly corps: string;
}

/** Lettre d'une page, à glisser dans une enveloppe à fenêtre. */
export function rendreLettreHtml(vue: VueLettre): string {
  const { centre, destinataire, lieu, date, objet, corps } = vue;
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${echapperHtml(objet)}</title><style>${STYLE}</style></head>
<body>
${enTeteCentreHtml(centre)}
<div class="destinataire">
<p><strong>${echapperHtml(destinataire.nom)}</strong></p>
${destinataire.adresse.map((ligne) => `<p>${echapperHtml(ligne)}</p>`).join('\n')}
</div>
<p>${echapperHtml(lieu)}, le ${dateFr(date)}</p>
<p class="objet">Objet : ${echapperHtml(objet)}</p>
<div class="corps">${echapperHtml(corps)}</div>
<div class="signature"><p>${echapperHtml(centre.nom)}</p></div>
</body>
</html>
`;
}
