import { ChromiumPdfRenderer, FakePdfRenderer } from '@ha/adapters';
import type { PdfRenderer } from '@ha/domain';

function creerRendu(): PdfRenderer {
  if (process.env.PDF_RENDU === 'simulation' && process.env.NODE_ENV !== 'production') {
    return new FakePdfRenderer();
  }
  return new ChromiumPdfRenderer(process.env.PDF_CHROMIUM_CHEMIN);
}

let instanceRendu: PdfRenderer | undefined;

/** Rendu PDF : Chromium, ou simulation hors production. */
export function rendeurPdf(): PdfRenderer {
  instanceRendu ??= creerRendu();
  return instanceRendu;
}
