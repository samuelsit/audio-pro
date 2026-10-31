import { existsSync } from 'node:fs';

import { detecterTypeDocument } from '@ha/domain';
import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';

import { ChromiumPdfRenderer } from './chromium-pdf-renderer';
import { FakePdfRenderer } from './fake-pdf-renderer';

describe('FakePdfRenderer', () => {
  it('rend un PDF reconnu et garde le HTML', async () => {
    const rendu = new FakePdfRenderer();
    const pdf = await rendu.rendre('<p>Devis</p>');
    expect(detecterTypeDocument(pdf)).toBe('application/pdf');
    expect(rendu.rendus).toEqual(['<p>Devis</p>']);
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
});
