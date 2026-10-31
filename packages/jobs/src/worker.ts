import path from 'node:path';

import { chargerTrousseau } from '@ha/adapters';
import { config } from 'dotenv';

import { FileTravaux } from './file';
import { travailDiagnostic } from './travaux/diagnostic';

// Ouvrier : `pnpm jobs:worker`. Tourne à part de l'application web.
config({ path: path.join(import.meta.dirname, '../../../.env'), quiet: true });

// Sans ces variables, mieux vaut refuser de démarrer qu'échouer sur chaque travail.
const url = process.env.DATABASE_URL_JOBS;
if (!url || !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL_JOBS et DATABASE_URL sont requis (voir .env.example).');
}
chargerTrousseau(process.env);

const file = new FileTravaux(url);
await file.demarrer();
await file.declarer(travailDiagnostic);
await file.ecouter(travailDiagnostic);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void file.arreter();
  });
}
