# Adaptateurs pdf

Port : `PdfRenderer`.

- `ChromiumPdfRenderer` : Chromium sans tête via `playwright-core`. `PDF_CHROMIUM_CHEMIN` désigne le binaire en production ; à défaut, celui installé par Playwright.
- `FakePdfRenderer` : rendu simulé, sélectionné par `PDF_RENDU=simulation` hors production.
