import { dateFr, echapperHtml } from './rendu';

export interface VueFeuilleSignature {
  readonly numero: string;
  readonly audioprothesiste: string;
  readonly patient: string;
  readonly offreRetenue: string;
  readonly dateSignature: string;
  /** PNG du tracé, encodé en base 64 : le rendu refuse toute requête. */
  readonly traceBase64: string;
  readonly empreinteDocument: string;
  readonly referencePreuve: string;
}

const STYLE = `
@page { size: A4; margin: 15mm; }
body { font: 11pt Arial, Helvetica, sans-serif; color: #000; }
h1 { font-size: 13pt; }
.trace { display: block; width: 90mm; height: 45mm; border: 1px solid #000; }
.preuve { font-size: 8pt; word-break: break-all; }
`;

/**
 * Page ajoutée au devis émis, resté intact, quand le patient signe à l'écran : elle reprend les éléments du
 * § 5 du modèle. Source : modele-devis-audio.pdf p. 2 § 5.
 */
export function rendreFeuilleSignatureHtml(vue: VueFeuilleSignature): string {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Validation de la commande</title><style>${STYLE}</style></head>
<body>
<h1>5. Validation de la commande et engagement final : devis n° ${echapperHtml(vue.numero)}</h1>
<p>Offre choisie à l’issue de l’essai : ${echapperHtml(vue.offreRetenue)}</p>
<p>Audioprothésiste D.E ayant réalisé le devis : ${echapperHtml(vue.audioprothesiste)}</p>
<p>Signature du patient, ${echapperHtml(vue.patient)}, lors de l’acceptation des conditions du devis à l’issue de la période d’essai, le ${dateFr(vue.dateSignature)} :</p>
<p><em>Bon pour accord</em></p>
<img class="trace" alt="Signature du patient" src="data:image/png;base64,${vue.traceBase64}">
<p class="preuve">Empreinte SHA-256 du devis émis : ${echapperHtml(vue.empreinteDocument)}<br>Référence de la preuve : ${echapperHtml(vue.referencePreuve)}</p>
</body>
</html>
`;
}
