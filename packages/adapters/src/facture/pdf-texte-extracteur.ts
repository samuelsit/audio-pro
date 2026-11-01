import {
  extraireDepuisTexte,
  FACTURE_VIDE,
  type ExtracteurFacture,
  type FactureExtraite,
} from '@ha/domain';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const TOLERANCE_LIGNE = 2;

interface Morceau {
  readonly texte: string;
  readonly x: number;
  readonly y: number;
}

/** Rassemble les morceaux de texte par ligne visuelle : un PDF ne connaît que des positions. */
function enLignes(morceaux: readonly Morceau[]): string[] {
  const lignes: { y: number; morceaux: Morceau[] }[] = [];
  for (const morceau of [...morceaux].sort((a, b) => b.y - a.y)) {
    const ligne = lignes.find((l) => Math.abs(l.y - morceau.y) <= TOLERANCE_LIGNE);
    if (ligne) {
      ligne.morceaux.push(morceau);
    } else {
      lignes.push({ y: morceau.y, morceaux: [morceau] });
    }
  }
  return lignes.map((l) =>
    l.morceaux
      .sort((a, b) => a.x - b.x)
      .map((m) => m.texte)
      .join(' '),
  );
}

async function lireTexte(pdf: Uint8Array): Promise<string> {
  // Fichier reçu de l'extérieur : ni police du système, ni ressource distante. Copie : pdf.js détache le tampon.
  const chargement = getDocument({
    data: pdf.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const document = await chargement.promise;
  const pages: string[] = [];
  for (let rang = 1; rang <= document.numPages; rang += 1) {
    const page = await document.getPage(rang);
    const { items } = await page.getTextContent();
    const morceaux = items.flatMap((item) =>
      'str' in item && item.str.trim() !== ''
        ? [
            {
              texte: item.str.trim(),
              x: item.transform[4] as number,
              y: item.transform[5] as number,
            },
          ]
        : [],
    );
    pages.push(...enLignes(morceaux));
  }
  await chargement.destroy();
  return pages.join('\n');
}

/**
 * Extraction locale : le fichier ne quitte pas l'infrastructure. Lit la couche texte d'un PDF. Un scan n'en a pas,
 * un fichier illisible non plus : la facture revient vide, et la saisie reste manuelle. Le texte n'est pas conservé.
 */
export class PdfTexteExtracteurFacture implements ExtracteurFacture {
  async extraire(pdf: Uint8Array): Promise<FactureExtraite> {
    try {
      return extraireDepuisTexte(await lireTexte(pdf));
    } catch {
      return FACTURE_VIDE;
    }
  }
}
