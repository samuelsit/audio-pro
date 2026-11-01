import { randomUUID } from 'node:crypto';

import {
  chargeArchive,
  contenuArchive,
  VERSION_CAISSE,
  verifierArchive,
  type DocumentStore,
  type MaillonArchive,
  type ResultatArchive,
} from '@ha/domain';

import { ajouterMaillon, verrouillerTete, type TxCaisse } from './chaine';
import type { DepsCaisse } from './cloture';
import { depuisDate, versDate } from './dates';

/** Dates et champs `BigInt` en JSON : l'archive se lit sans Prisma. */
function enJson(valeur: unknown): unknown {
  return JSON.parse(
    JSON.stringify(valeur, (_, v: unknown) => (typeof v === 'bigint' ? Number(v) : v)),
  );
}

interface Plage {
  readonly rangDebut: number;
  readonly rangFin: number;
  readonly debut: string;
  readonly fin: string;
}

async function lireContenu(
  tx: TxCaisse,
  centreId: string,
  { rangDebut, rangFin, debut, fin }: Plage,
  clePublique: string,
): Promise<string> {
  const plage = { centreId, rang: { gte: rangDebut, lte: rangFin } };
  const centre = await tx.centre.findUniqueOrThrow({
    where: { id: centreId },
    select: { id: true, nom: true, siret: true },
  });
  const evenements = await tx.evenementCaisse.findMany({ where: plage, orderBy: { rang: 'asc' } });
  const factureIds = evenements.flatMap((e) =>
    e.factureId && (e.type === 'FACTURE_VALIDEE' || e.type === 'AVOIR_VALIDE') ? [e.factureId] : [],
  );
  const [pieces, lignes, mouvements, reglements, regularisations, sessions, comptages, clotures] =
    await Promise.all([
      tx.facture.findMany({
        where: { id: { in: factureIds } },
        orderBy: { numeroSequence: 'asc' },
      }),
      tx.ligneFacture.findMany({
        where: { factureId: { in: factureIds } },
        orderBy: [{ factureId: 'asc' }, { rang: 'asc' }],
      }),
      tx.encaissement.findMany({ where: plage, orderBy: { rang: 'asc' } }),
      tx.reglementOrganisme.findMany({ where: plage, orderBy: { rang: 'asc' } }),
      tx.regularisationCreance.findMany({ where: plage, orderBy: { rang: 'asc' } }),
      tx.sessionCaisse.findMany({ where: plage, orderBy: { rang: 'asc' } }),
      tx.comptageCaisse.findMany({ where: plage, orderBy: { rang: 'asc' } }),
      tx.clotureCaisse.findMany({ where: plage, orderBy: { rang: 'asc' } }),
    ]);
  const maillons: MaillonArchive[] = evenements.map((e) => ({
    rang: e.rang,
    type: e.type,
    format: e.format,
    centreId: e.centreId,
    acteurId: e.acteurId,
    horodatage: e.createdAt.toISOString(),
    charge: e.charge,
    empreintePrecedente: e.empreintePrecedente,
    empreinte: e.empreinte,
  }));
  return contenuArchive({
    debut,
    fin,
    versionCaisse: VERSION_CAISSE,
    centre,
    clePublique,
    maillons,
    pieces: enJson(pieces) as unknown[],
    lignes: enJson(lignes) as unknown[],
    mouvements: enJson(mouvements) as unknown[],
    reglements: enJson(reglements) as unknown[],
    regularisations: enJson(regularisations) as unknown[],
    sessions: enJson(sessions) as unknown[],
    comptages: enJson(comptages) as unknown[],
    clotures: enJson(clotures) as unknown[],
  });
}

async function archiverMois(
  deps: DepsCaisse,
  documents: DocumentStore,
  centreId: string,
  moisId: string,
): Promise<boolean> {
  const { organisationId, acteurId, horloge, hacheur, signature } = deps;
  const lecture = await deps.transaction(async (tx) => {
    const mois = await tx.clotureCaisse.findUniqueOrThrow({ where: { id: moisId } });
    const precedente = await tx.archiveCaisse.findFirst({
      where: { centreId },
      orderBy: { rangFin: 'desc' },
      select: { rangFin: true },
    });
    const plage = {
      rangDebut: (precedente?.rangFin ?? 0) + 1,
      rangFin: mois.rang,
      debut: depuisDate(mois.debut),
      fin: depuisDate(mois.fin),
    };
    return { plage, contenu: await lireContenu(tx, centreId, plage, signature.clePublique) };
  });
  const { plage, contenu } = lecture;
  const octets = new TextEncoder().encode(contenu);
  const empreinteContenu = hacheur.sha256(contenu);
  const id = randomUUID();
  const cle = `archives-caisse/${id}`;
  // Avant la transaction : un échec laisse au pire un fichier orphelin, jamais une ligne sans fichier.
  await documents.put(cle, octets, 'application/json');
  return deps.transaction(async (tx) => {
    await verrouillerTete(tx, organisationId, centreId);
    const deja = await tx.archiveCaisse.findFirst({
      where: { centreId, rangFin: { gte: plage.rangFin } },
      select: { id: true },
    });
    if (deja) {
      return false;
    }
    const charge = chargeArchive({
      ...plage,
      id,
      empreinteContenu,
      tailleOctets: octets.length,
      versionCaisse: VERSION_CAISSE,
    });
    const { rang, empreinte, horodatage } = await ajouterMaillon(
      tx,
      { organisationId, acteurId, horloge, hacheur },
      { centreId, type: 'ARCHIVAGE', charge },
    );
    await tx.archiveCaisse.create({
      data: {
        id,
        organisationId,
        centreId,
        debut: versDate(plage.debut),
        fin: versDate(plage.fin),
        rangDebut: plage.rangDebut,
        rangFin: plage.rangFin,
        cle,
        tailleOctets: octets.length,
        empreinteContenu,
        versionCaisse: VERSION_CAISSE,
        rang,
        empreinte,
        signature: signature.signer(empreinte),
        cleId: signature.cleId,
        acteurId,
        createdAt: horodatage,
      },
    });
    return true;
  });
}

/**
 * Archive chaque mois clôturé qui ne l'est pas encore, du plus ancien au plus récent. Idempotent.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 220 (périodicité au plus annuelle), § 230 et § 240.
 */
export async function archiverCentre(
  deps: DepsCaisse,
  documents: DocumentStore,
  centreId: string,
): Promise<number> {
  const aArchiver = await deps.transaction(async (tx) => {
    const derniere = await tx.archiveCaisse.findFirst({
      where: { centreId },
      orderBy: { rangFin: 'desc' },
      select: { rangFin: true },
    });
    return tx.clotureCaisse.findMany({
      where: { centreId, portee: 'MOIS', rang: { gt: derniere?.rangFin ?? 0 } },
      orderBy: { rang: 'asc' },
      select: { id: true },
    });
  });
  let archives = 0;
  for (const { id } of aArchiver) {
    if (await archiverMois(deps, documents, centreId, id)) {
      archives += 1;
    }
  }
  return archives;
}

export interface ArchiveAVerifier {
  readonly cle: string;
  readonly empreinteContenu: string;
}

/** Relit le fichier stocké : son empreinte, puis la suite de ses maillons. */
export async function verifierArchiveStockee(
  documents: DocumentStore,
  { cle, empreinteContenu }: ArchiveAVerifier,
  hacheur: DepsCaisse['hacheur'],
): Promise<ResultatArchive> {
  const contenu = new TextDecoder().decode(await documents.get(cle));
  return verifierArchive(contenu, empreinteContenu, hacheur);
}
