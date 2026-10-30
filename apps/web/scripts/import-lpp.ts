import path from 'node:path';

import { ErreurImportLpp } from '@ha/domain';
import { config } from 'dotenv';

import { fermerConnexionsLpp, importerLpp } from '../server/lpp/importer';

// Usage : pnpm import:lpp docs/ref/lpp/908
// `pnpm --filter` change de dossier : le chemin reçu est relatif au dossier de l'appel (INIT_CWD).

const RACINE = path.join(import.meta.dirname, '../../..');
config({ path: path.join(RACINE, '.env'), quiet: true });

async function main(): Promise<void> {
  const argument = process.argv.slice(2).find((a) => a !== '--');
  if (!argument) {
    throw new ErreurImportLpp('Usage : pnpm import:lpp <dossier-version>');
  }
  const dossier = path.resolve(process.env['INIT_CWD'] ?? process.cwd(), argument);
  const r = await importerLpp(dossier);
  console.log(
    [
      `Base LPP ${r.version} ${r.remplacee ? 'réimportée (lignes remplacées)' : 'importée'}, fichiers du ${r.dateFichiers}.`,
      `Titre II chapitre 3 : ${r.codes} codes, ${r.tarifs} lignes de tarif, ${r.codesLies} codes spécifiques reliés à un générique.`,
      `Base entière : ${r.compatibilites} compatibilités, ${r.incompatibilites} incompatibilités.`,
    ].join('\n'),
  );
}

try {
  await main();
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
} finally {
  await fermerConnexionsLpp();
}
