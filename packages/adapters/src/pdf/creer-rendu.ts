import type { PdfRenderer } from '@ha/domain';

import { ChromiumPdfRenderer } from './chromium-pdf-renderer';
import { FakePdfRenderer } from './fake-pdf-renderer';

/** Même rendu pour l'application et l'ouvrier : Chromium, ou simulation hors production. */
export function creerRenduPdfDepuisEnv(
  env: Readonly<Record<string, string | undefined>>,
): PdfRenderer {
  if (env.PDF_RENDU === 'simulation' && env.NODE_ENV !== 'production') {
    return new FakePdfRenderer();
  }
  return new ChromiumPdfRenderer(env.PDF_CHROMIUM_CHEMIN);
}
