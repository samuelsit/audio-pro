import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { FakeBoiteFactures } from './fake-boite';
import { FakeExtracteurFacture } from './fake-extracteur';
import { FakePlateformeFactures } from './fake-plateforme';
import { PdfTexteExtracteurFacture } from './pdf-texte-extracteur';

async function facturePdf(lignes: readonly string[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage();
  lignes.forEach((texte, rang) => {
    page.drawText(texte, { x: 40, y: 780 - rang * 18, size: 10, font: police });
  });
  return document.save();
}

describe('PdfTexteExtracteurFacture', () => {
  const extracteur = new PdfTexteExtracteurFacture();

  it('lit la couche texte d’un vrai PDF', async () => {
    const pdf = await facturePdf([
      'Facture n° FA-2030-117',
      'Date : 07/01/2030',
      'SIRET 123 456 789 00011',
      'Commande CMD-2030-000012',
      'REF-001 Aurore Essentiel 2 600,00 1 200,00',
      'S/N SN1001, SN1002',
      'Total HT 1 200,00',
      'TVA 240,00',
      'Total TTC 1 440,00',
    ]);
    expect(await extracteur.extraire(pdf)).toEqual({
      numero: 'FA-2030-117',
      dateFacture: '2030-01-07',
      montantHtCentimes: 120_000,
      montantTvaCentimes: 24_000,
      montantTtcCentimes: 144_000,
      sirets: ['12345678900011'],
      numerosClient: [],
      numerosCommande: ['CMD-2030-000012'],
      lignes: [
        {
          reference: 'REF-001',
          designation: 'Aurore Essentiel',
          quantite: 2,
          prixUnitaireCentimes: 60_000,
          numerosSerie: ['SN1001', 'SN1002'],
        },
      ],
    });
  });

  it('rassemble en une ligne des morceaux placés à la même hauteur', async () => {
    const document = await PDFDocument.create();
    const police = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage();
    page.drawText('1 200,00', { x: 300, y: 700, size: 10, font: police });
    page.drawText('Total HT', { x: 40, y: 700, size: 10, font: police });
    const { montantHtCentimes } = await extracteur.extraire(await document.save());
    expect(montantHtCentimes).toBe(120_000);
  });

  it('un fichier illisible rend une facture vide', async () => {
    const facture = await extracteur.extraire(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]));
    expect(facture.numero).toBeNull();
    expect(facture.lignes).toEqual([]);
  });
});

describe('adaptateurs simulés', () => {
  it('FakeExtracteurFacture rend ce qu’on lui a confié', async () => {
    expect((await new FakeExtracteurFacture().extraire()).numero).toBeNull();
  });

  it('FakePlateformeFactures garde les factures jusqu’à l’acquittement', async () => {
    const plateforme = new FakePlateformeFactures();
    plateforme.deposer({ identifiant: 'f1', pdf: null });
    expect(await plateforme.relever()).toHaveLength(1);
    await plateforme.acquitter('f1');
    expect(await plateforme.relever()).toEqual([]);
  });

  it('FakeBoiteFactures garde les messages jusqu’à l’acquittement', async () => {
    const boite = new FakeBoiteFactures();
    expect(await boite.relever('a@exemple.test')).toEqual([]);
    boite.deposer('a@exemple.test', { identifiant: 'm1', expediteur: 'x', pieces: [] });
    expect(await boite.relever('a@exemple.test')).toHaveLength(1);
    await boite.acquitter('a@exemple.test', 'm1');
    await boite.acquitter('b@exemple.test', 'm1');
    expect(await boite.relever('a@exemple.test')).toEqual([]);
  });
});
