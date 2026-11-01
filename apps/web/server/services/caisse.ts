import { randomUUID } from 'node:crypto';

import {
  archiverCentre,
  cloturerCentre,
  dernierEchec,
  journaliserEchec,
  verifierArchiveStockee,
  verrouillerTete,
  type ResultatClotures,
} from '@ha/caisse';
import {
  chargeComptage,
  chargeOuverture,
  comptageSaisieSchema,
  ecartDeCaisse,
  especesTheoriques,
  fondAttendu,
  justificationManquante,
  ouvertureSaisieSchema,
  peutEncaisser,
  peutGererCaisse,
  parametresComptablesSchema,
  PARAMETRES_COMPTABLES_DEFAUT,
  PROFIL_ECRITURES_DEFAUT,
  profilExportSchema,
  serialiserCanonique,
  type ParametresComptables,
  type ProfilExport,
  type ResultatArchive,
  type ResultatChaine,
} from '@ha/domain';
import type { Prisma } from '@ha/db';
import { z } from 'zod';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, enTransaction, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider } from '../erreurs';
import {
  ajouterMaillon,
  contexteChaine,
  depsCaisse,
  hacheur,
  signatureCaisse,
  txCaisse,
  verifierChaineCaisse,
} from './chaine-caisse';
import { depuisDate, versDate } from './dossiers';
import { mouvementsDuJour } from './encaissements';
import { aujourdhui, type Client } from './patients';

const MESSAGE_FOND = 'Expliquez la différence avec le fond attendu.';
const MESSAGE_ECART = 'Justifiez l’écart de caisse.';
const MESSAGE_FERMEE = 'Ouvrez la caisse avant de compter.';
const MESSAGE_OUVERTE = 'La caisse de ce centre est déjà ouverte aujourd’hui.';

function exigerGestion(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutGererCaisse(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

function exigerGuichet(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutEncaisser(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

function evenementCaisse(
  action: EvenementAudit['action'],
  centreId: string,
  details: Readonly<Record<string, unknown>>,
): EvenementAudit {
  return { action, entiteType: 'CAISSE', entiteId: centreId, centreId, details };
}

async function dernierComptage(
  client: Pick<ClientTransaction, 'comptageCaisse'>,
  centreId: string,
) {
  return client.comptageCaisse.findFirst({
    where: { centreId },
    orderBy: { rang: 'desc' },
    select: { compteesCentimes: true, remiseCentimes: true },
  });
}

/** Ouvre la caisse du jour. Le fond attendu est ce qui restait au tiroir : un autre montant se justifie. */
export async function ouvrirCaisse(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  exigerGuichet(acteur, centreId);
  const { fondCentimes, justification } = valider(ouvertureSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      await verrouillerTete(txCaisse(tx), acteur.organisationId, centreId);
      const journee = aujourdhui();
      const deja = await tx.sessionCaisse.findUnique({
        where: { centreId_journee: { centreId, journee: versDate(journee) } },
        select: { id: true },
      });
      if (deja) {
        throw new ErreurSaisie({}, MESSAGE_OUVERTE);
      }
      const precedent = await dernierComptage(tx, centreId);
      // Première ouverture : rien n'a été compté, il n'y a pas de fond attendu.
      const attendu = precedent ? fondAttendu(precedent) : fondCentimes;
      if (justificationManquante(fondCentimes - attendu, justification)) {
        throw ErreurSaisie.surChamp('justification', MESSAGE_FOND);
      }
      const id = randomUUID();
      const { rang, empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
        centreId,
        type: 'CAISSE_OUVERTE',
        charge: chargeOuverture(
          { id, journee, fondCentimes, fondAttenduCentimes: attendu, justification },
          hacheur,
        ),
      });
      await tx.sessionCaisse.create({
        data: {
          id,
          organisationId: acteur.organisationId,
          centreId,
          journee: versDate(journee),
          fondCentimes,
          fondAttenduCentimes: attendu,
          justification,
          rang,
          empreinte,
          acteurId: acteur.id,
          createdAt: horodatage,
        },
      });
    },
    evenementCaisse('CREATE', centreId, { operation: 'OUVERTURE', fondCentimes }),
  );
}

async function theoriqueDuJour(
  client: Client,
  centreId: string,
  jour: string,
  fond: number,
): Promise<number> {
  const mouvements = await mouvementsDuJour(client, centreId, jour);
  return especesTheoriques(
    fond,
    mouvements.filter((m) => m.mode === 'ESPECES'),
  );
}

/** Compte les espèces. On peut recompter : chaque comptage reste, le dernier fait foi. */
export async function compterCaisse(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  exigerGuichet(acteur, centreId);
  const { compteesCentimes, remiseCentimes, justification } = valider(comptageSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      await verrouillerTete(txCaisse(tx), acteur.organisationId, centreId);
      const journee = aujourdhui();
      const session = await tx.sessionCaisse.findUnique({
        where: { centreId_journee: { centreId, journee: versDate(journee) } },
        select: { id: true, fondCentimes: true },
      });
      if (!session) {
        throw new ErreurSaisie({}, MESSAGE_FERMEE);
      }
      const theoriqueCentimes = await theoriqueDuJour(
        tx as unknown as Client,
        centreId,
        journee,
        session.fondCentimes,
      );
      const ecartCentimes = ecartDeCaisse(theoriqueCentimes, compteesCentimes);
      if (justificationManquante(ecartCentimes, justification)) {
        throw ErreurSaisie.surChamp('justification', MESSAGE_ECART);
      }
      const comptage = {
        id: randomUUID(),
        sessionId: session.id,
        compteesCentimes,
        theoriqueCentimes,
        ecartCentimes,
        remiseCentimes,
        justification,
      };
      const { rang, empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
        centreId,
        type: 'CAISSE_COMPTEE',
        charge: chargeComptage({ ...comptage, journee }, hacheur),
      });
      await tx.comptageCaisse.create({
        data: {
          ...comptage,
          organisationId: acteur.organisationId,
          centreId,
          rang,
          empreinte,
          acteurId: acteur.id,
          createdAt: horodatage,
        },
      });
      return ecartCentimes;
    },
    (ecartCentimes) =>
      evenementCaisse('UPDATE', centreId, { operation: 'COMPTAGE', ecartCentimes }),
  );
}

export interface ComptageVue {
  readonly compteesCentimes: number;
  readonly theoriqueCentimes: number;
  readonly ecartCentimes: number;
  readonly remiseCentimes: number;
  readonly justification: string | null;
  readonly createdAt: Date;
}

export async function caisseDuJour(acteur: UtilisateurConnecte, centreId: string) {
  exigerGuichet(acteur, centreId);
  const client = base(acteur);
  const jour = aujourdhui();
  const [session, mouvements, comptageVeille, echec] = await Promise.all([
    client.sessionCaisse.findUnique({
      where: { centreId_journee: { centreId, journee: versDate(jour) } },
    }),
    mouvementsDuJour(client, centreId, jour),
    dernierComptage(client, centreId),
    dernierEchec(client as never, centreId),
  ]);
  const especes = mouvements.filter((m) => m.mode === 'ESPECES');
  // Requête à part : le déchiffrement ne descend pas dans un `include`.
  const comptages = session
    ? await client.comptageCaisse.findMany({
        where: { sessionId: session.id },
        orderBy: { rang: 'asc' },
      })
    : [];
  return {
    jour,
    session,
    comptages,
    mouvements,
    fondPropose: fondAttendu(comptageVeille),
    theorique: session ? especesTheoriques(session.fondCentimes, especes) : null,
    echec,
  };
}

const CLOTURES_PAR_PAGE = 50;

export async function listerClotures(acteur: UtilisateurConnecte, centreId: string) {
  exigerGestion(acteur, centreId);
  const lignes = await base(acteur).clotureCaisse.findMany({
    where: { centreId },
    orderBy: { rang: 'desc' },
    take: CLOTURES_PAR_PAGE,
  });
  return lignes;
}

export async function listerArchives(acteur: UtilisateurConnecte, centreId: string) {
  exigerGestion(acteur, centreId);
  return base(acteur).archiveCaisse.findMany({ where: { centreId }, orderBy: { rang: 'desc' } });
}

export const JOURNAL_PAR_PAGE = 100;

/** Le journal des événements de caisse, du plus récent au plus ancien. */
export async function listerJournalCaisse(acteur: UtilisateurConnecte, centreId: string) {
  exigerGestion(acteur, centreId);
  return base(acteur).evenementCaisse.findMany({
    where: { centreId },
    orderBy: { rang: 'desc' },
    take: JOURNAL_PAR_PAGE,
    select: {
      rang: true,
      type: true,
      charge: true,
      empreinte: true,
      createdAt: true,
      acteur: { select: { prenom: true, nom: true } },
    },
  });
}

/** Rattrape à la main ce que le travail de nuit n'aurait pas fait. Jamais la journée en cours. */
export async function lancerClotures(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<ResultatClotures> {
  exigerGestion(acteur, centreId);
  const resultat = await cloturerCentre(depsCaisse(acteur), centreId);
  await withAudit(
    acteur,
    () => Promise.resolve(),
    evenementCaisse('CREATE', centreId, {
      operation: 'CLOTURES',
      ...resultat,
    }),
  );
  return resultat;
}

/** Vérification à la demande : un échec passe au journal de caisse, une seule fois par rupture. */
export async function lancerVerification(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<ResultatChaine> {
  exigerGestion(acteur, centreId);
  const resultat = await verifierChaineCaisse(acteur, centreId);
  if (!resultat.valide) {
    await enTransaction(acteur, (tx) =>
      journaliserEchec(txCaisse(tx), contexteChaine(acteur), centreId, resultat),
    );
  }
  return resultat;
}

async function lireArchive(acteur: UtilisateurConnecte, archiveId: string) {
  const archive = await base(acteur).archiveCaisse.findFirst({
    where: { id: archiveId, organisationId: acteur.organisationId },
  });
  if (!archive) {
    throw new AccesRefuseError();
  }
  exigerGestion(acteur, archive.centreId);
  return archive;
}

export interface ArchiveTelechargee {
  readonly nom: string;
  readonly contenu: Uint8Array;
}

/** Téléchargement en clair, journalisé : le fichier contient l'identité des patients facturés. */
export async function telechargerArchive(
  acteur: UtilisateurConnecte,
  archiveId: string,
): Promise<ArchiveTelechargee> {
  const archive = await lireArchive(acteur, archiveId);
  const contenu = await documents().get(archive.cle);
  await withAudit(acteur, () => Promise.resolve(), {
    action: 'EXPORT',
    entiteType: 'CAISSE',
    entiteId: archive.id,
    centreId: archive.centreId,
    details: { document: 'ARCHIVE', debut: depuisDate(archive.debut) },
  });
  return {
    nom: `archive-caisse-${depuisDate(archive.debut)}-${depuisDate(archive.fin)}.json`,
    contenu,
  };
}

export type ResultatArchiveVerifiee =
  ResultatArchive | { readonly valide: false; readonly raison: 'SIGNATURE' };

export async function verifierArchiveEnregistree(
  acteur: UtilisateurConnecte,
  archiveId: string,
): Promise<ResultatArchiveVerifiee> {
  const archive = await lireArchive(acteur, archiveId);
  if (!signatureCaisse().verifier(archive.empreinte, archive.signature, archive.cleId)) {
    return { valide: false, raison: 'SIGNATURE' };
  }
  return verifierArchiveStockee(documents(), archive, hacheur);
}

/** Archivage à la demande : le travail de nuit fait le même, après la clôture du mois. */
export async function lancerArchivage(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<number> {
  exigerGestion(acteur, centreId);
  return archiverCentre(depsCaisse(acteur), documents(), centreId);
}

export interface ParametresComptablesVue {
  readonly comptes: ParametresComptables;
  readonly profil: ProfilExport;
  readonly moisClotureExercice: number;
}

export async function lireParametresComptables(
  client: Pick<ClientTransaction, 'parametresComptables'>,
  centreId: string,
): Promise<ParametresComptablesVue> {
  const ligne = await client.parametresComptables.findUnique({ where: { centreId } });
  return ligne
    ? {
        comptes: parametresComptablesSchema.parse(ligne.comptes),
        profil: profilExportSchema.parse(ligne.profil),
        moisClotureExercice: ligne.moisClotureExercice,
      }
    : {
        comptes: PARAMETRES_COMPTABLES_DEFAUT,
        profil: PROFIL_ECRITURES_DEFAUT,
        moisClotureExercice: 12,
      };
}

export async function obtenirParametresComptables(acteur: UtilisateurConnecte, centreId: string) {
  exigerGestion(acteur, centreId);
  return lireParametresComptables(base(acteur), centreId);
}

const parametresSaisieSchema = z.object({
  comptes: parametresComptablesSchema,
  profil: profilExportSchema,
  moisClotureExercice: z.coerce.number().int().min(1).max(12),
});

/** Tout changement passe au journal de caisse, avec l'avant et l'après (R41). */
export async function modifierParametresComptables(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur, centreId);
  const apres = valider(parametresSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      await verrouillerTete(txCaisse(tx), acteur.organisationId, centreId);
      const avant = await lireParametresComptables(tx, centreId);
      if (serialiserCanonique(avant) === serialiserCanonique(apres)) {
        return;
      }
      const donnees = {
        comptes: apres.comptes as unknown as Prisma.InputJsonValue,
        profil: apres.profil as unknown as Prisma.InputJsonValue,
        moisClotureExercice: apres.moisClotureExercice,
      };
      await tx.parametresComptables.upsert({
        where: { centreId },
        create: { ...donnees, centreId, organisationId: acteur.organisationId },
        update: donnees,
      });
      await ajouterMaillon(tx, acteur, {
        centreId,
        type: 'PARAMETRE_MODIFIE',
        charge: { parametre: 'COMPTABILITE', avant, apres },
      });
    },
    {
      action: 'UPDATE',
      entiteType: 'PARAMETRES_COMPTABLES',
      entiteId: centreId,
      centreId,
    },
  );
}
