import { existsSync } from 'node:fs';

import { detecterTypeDocument, rendreFeuilleSignatureHtml } from '@ha/domain';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';

import { ChromiumPdfRenderer } from './chromium-pdf-renderer';
import { FakePdfRenderer } from './fake-pdf-renderer';

/** PNG de 2 × 2 pixels. */
const TRACE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8DAAMQMAAkKAgFh1bj1AAAAAElFTkSuQmCC';

describe('FakePdfRenderer', () => {
  it('rend un PDF reconnu et garde le HTML', async () => {
    const rendu = new FakePdfRenderer();
    const pdf = await rendu.rendre('<p>Devis</p>');
    expect(detecterTypeDocument(pdf)).toBe('application/pdf');
    expect(rendu.rendus).toEqual(['<p>Devis</p>']);
  });

  it('assemble en gardant les octets du premier document', async () => {
    const rendu = new FakePdfRenderer();
    const premier = await rendu.rendre('a');
    const assemble = await rendu.assembler([premier, await rendu.rendre('b')]);
    expect(Buffer.from(assemble).subarray(0, premier.length).equals(Buffer.from(premier))).toBe(
      true,
    );
  });
});

// Le navigateur n'est pas installé en CI : le test ne tourne qu'en local.
describe.skipIf(!existsSync(chromium.executablePath()))('ChromiumPdfRenderer', () => {
  it('produit un PDF sans exécuter de script ni charger de ressource', async () => {
    const pdf = await new ChromiumPdfRenderer().rendre(
      `<!doctype html><title>t</title><script>document.title = 'x'</script><img src="http://exemple.test/a.png"><p>Devis</p>`,
    );
    expect(detecterTypeDocument(pdf)).toBe('application/pdf');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('garde le tracé de la feuille de signature, malgré le refus des requêtes', async () => {
    const pdf = await new ChromiumPdfRenderer().rendre(
      rendreFeuilleSignatureHtml({
        numero: '2026-000001 v1',
        audioprothesiste: 'Camille Audio',
        patient: 'Alex Fictif',
        offreRetenue: 'Offre 100 % santé',
        dateSignature: '2026-11-01',
        traceBase64: TRACE_PNG,
        empreinteDocument: 'abc',
        referencePreuve: 'ref',
      }),
    );
    expect(Buffer.from(pdf).includes('/Subtype /Image')).toBe(true);
  });

  it('assemble deux PDF à la suite, sans perdre de page', async () => {
    const rendu = new ChromiumPdfRenderer();
    const devis = await rendu.rendre(
      '<!doctype html><p>Page 1</p><p style="break-before:page">2</p>',
    );
    const feuille = await rendu.rendre('<!doctype html><p>Feuille</p>');
    const assemble = await rendu.assembler([devis, feuille]);
    expect(detecterTypeDocument(assemble)).toBe('application/pdf');
    expect((await PDFDocument.load(assemble)).getPageCount()).toBe(3);
  });
});
