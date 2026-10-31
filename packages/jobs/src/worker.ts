import path from 'node:path';

import { config } from 'dotenv';

import { FileTravaux } from './file';
import { travailDiagnostic } from './travaux/diagnostic';

// Ouvrier : `pnpm jobs:worker`. Tourne à part de l'application web.
config({ path: path.join(import.meta.dirname, '../../../.env'), quiet: true });

const url = process.env.DATABASE_URL_JOBS;
if (!url) {
  throw new Error('DATABASE_URL_JOBS n’est pas défini (voir .env.example).');
}

const file = new FileTravaux(url);
await file.demarrer();
await file.declarer(travailDiagnostic);
await file.ecouter(travailDiagnostic);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void file.arreter();
  });
}
