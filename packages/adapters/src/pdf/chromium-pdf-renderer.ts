import type { PdfRenderer } from '@ha/domain';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright-core';

const PIED_DE_PAGE = `<div style="width:100%;padding-right:12mm;font:8px Arial,Helvetica,sans-serif;text-align:right"><span class="pageNumber"></span>/<span class="totalPages"></span></div>`;

/**
 * Chromium sans tête : un navigateur par rendu, JavaScript coupé et toute requête refusée, le document
 * portant des données saisies. Marges et format viennent de la règle `@page` du HTML.
 * `cheminExecutable` : binaire système en production, celui de Playwright sinon.
 */
export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(private readonly cheminExecutable?: string) {}

  async rendre(html: string): Promise<Uint8Array> {
    const navigateur = await chromium.launch(
      this.cheminExecutable === undefined ? {} : { executablePath: this.cheminExecutable },
    );
    try {
      const contexte = await navigateur.newContext({ javaScriptEnabled: false, offline: true });
      await contexte.route('**/*', (route) => route.abort());
      const page = await contexte.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: PIED_DE_PAGE,
      });
    } finally {
      await navigateur.close();
    }
  }

  async assembler(documents: readonly Uint8Array[]): Promise<Uint8Array> {
    const assemble = await PDFDocument.create();
    for (const document of documents) {
      const source = await PDFDocument.load(document);
      const pages = await assemble.copyPages(source, source.getPageIndices());
      pages.forEach((page) => assemble.addPage(page));
    }
    return assemble.save();
  }
}
