import type { PdfRenderer } from '@ha/domain';

/** Rendu simulé pour le développement et les tests : `rendus` garde chaque HTML reçu. */
export class FakePdfRenderer implements PdfRenderer {
  readonly rendus: string[] = [];

  async rendre(html: string): Promise<Uint8Array> {
    this.rendus.push(html);
    return new TextEncoder().encode(`%PDF-1.7 simulation ${String(this.rendus.length)}\n`);
  }

  async assembler(documents: readonly Uint8Array[]): Promise<Uint8Array> {
    return Buffer.concat(documents);
  }
}
