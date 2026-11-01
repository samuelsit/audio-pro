import { creerRenduPdfDepuisEnv } from '@ha/adapters';
import type { PdfRenderer } from '@ha/domain';

let instanceRendu: PdfRenderer | undefined;

/** Rendu PDF : Chromium, ou simulation hors production. */
export function rendeurPdf(): PdfRenderer {
  instanceRendu ??= creerRenduPdfDepuisEnv(process.env);
  return instanceRendu;
}
