import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chargerSignatureCaisse, HacheurSha256 } from '@ha/adapters';
import { verifierArchiveStockee, verifierCentre, type TxCaisse } from '@ha/caisse';
import { clientPlateforme } from '@ha/db';
import { LIBELLES_RAISONS_RUPTURE, verifierArchive } from '@ha/domain';
import { config } from 'dotenv';

import { base } from '../server/chiffrement';
import { documents } from '../server/documents';

// Usage :
//   pnpm caisse:verifier                                  tous les centres de tous les clients
//   pnpm caisse:verifier --centre <id>                    un seul centre
//   pnpm caisse:verifier --fichier <archive> --empreinte <sha256>   une archive téléchargée, hors ligne
// Code de sortie 1 au premier échec constaté. Ne journalise rien : l'écran et le travail de nuit le font.

const RACINE = path.join(import.meta.dirname, '../../..');
config({ path: path.join(RACINE, '.env'), quiet: true });

function option(nom: string): string | undefined {
  const index = process.argv.indexOf(`--${nom}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const hacheur = new HacheurSha256();

async function verifierFichier(fichier: string, empreinte: string): Promise<boolean> {
  const chemin = path.resolve(process.env.INIT_CWD ?? process.cwd(), fichier);
  const resultat = verifierArchive(await readFile(chemin, 'utf8'), empreinte, hacheur);
  console.log(
    resultat.valide
      ? `Archive intègre : ${String(resultat.maillons)} maillons.`
      : `Archive ALTÉRÉE : ${resultat.raison}.`,
  );
  return resultat.valide;
}

async function verifierUnCentre(organisationId: string, centreId: string): Promise<boolean> {
  const client = base({ organisationId });
  const deps = { hacheur, signature: chargerSignatureCaisse(process.env) };
  const resultat = await verifierCentre(client as unknown as TxCaisse, centreId, deps);
  if (!resultat.valide) {
    const raison = LIBELLES_RAISONS_RUPTURE[resultat.raison];
    console.log(`Centre ${centreId} : ROMPUE au rang ${String(resultat.rang)}, ${raison}.`);
    return false;
  }
  let archivesValides = true;
  const archives = await client.archiveCaisse.findMany({ where: { centreId } });
  if (process.env.DOCUMENTS_STOCKAGE !== 'memoire') {
    for (const archive of archives) {
      const lecture = await verifierArchiveStockee(documents(), archive, hacheur);
      if (!lecture.valide) {
        console.log(`Centre ${centreId} : archive ${archive.id} ALTÉRÉE (${lecture.raison}).`);
        archivesValides = false;
      }
    }
  }
  console.log(
    `Centre ${centreId} : ${String(resultat.maillons)} maillons, ${String(archives.length)} archives.`,
  );
  return archivesValides;
}

async function main(): Promise<boolean> {
  const fichier = option('fichier');
  if (fichier) {
    return verifierFichier(fichier, option('empreinte') ?? '');
  }
  const centreVise = option('centre');
  const centres = await clientPlateforme().centre.findMany({
    where: centreVise ? { id: centreVise } : {},
    select: { id: true, organisationId: true },
  });
  if (centreVise && centres.length === 0) {
    console.error(`Centre introuvable : ${centreVise}.`);
    return false;
  }
  let intact = true;
  for (const { id, organisationId } of centres) {
    intact = (await verifierUnCentre(organisationId, id)) && intact;
  }
  console.log(intact ? 'Chaînes intègres.' : 'Altération détectée.');
  return intact;
}

try {
  // Les connexions partagées restent ouvertes : la sortie est explicite.
  process.exit((await main()) ? 0 : 1);
} catch (erreur) {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
}
