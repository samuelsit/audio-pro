import { randomUUID } from 'node:crypto';

import { verrouillerTete } from '@ha/caisse';
import {
  bornesJourMs,
  calculerSolde,
  devisCalculeSchema,
  encaisseNet,
  encaissementSaisieSchema,
  chargeMouvement,
  formatEuros,
  centimes,
  peutEncaisser,
  peutRembourser,
  remboursementSaisieSchema,
  resteRemboursable,
  TYPE_MAILLON_MOUVEMENT,
  type ModePaiement,
  type MouvementAChainer,
  type NatureMouvement,
  type Solde,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { ajouterMaillon, hacheur, txCaisse } from './chaine-caisse';
import { versDate } from './dossiers';
import { lireFacture, type FactureLue } from './facturation';
import { aujourdhui, type Client } from './patients';

const MESSAGE_FACTURE = 'Seule une facture validée s’encaisse.';
const MESSAGE_DEVIS = 'Un acompte se prend sur un devis signé.';
const MESSAGE_SESSION = 'Ouvrez la caisse avant tout mouvement en espèces.';
const MESSAGE_ORIGINE = 'Seul un encaissement se rembourse.';

function evenementMouvement(
  id: string,
  { centreId, patientId }: { readonly centreId: string; readonly patientId: string },
  details: Readonly<Record<string, unknown>>,
): EvenementAudit {
  return {
    action: 'CREATE',
    entiteType: 'ENCAISSEMENT',
    entiteId: id,
    patientId,
    centreId,
    details,
  };
}

/** Écrit l'opération et son maillon, dans cette transaction : l'une ne va pas sans l'autre. */
async function ecrireMouvement(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  centreId: string,
  mouvement: Omit<MouvementAChainer, 'id'>,
): Promise<string> {
  const id = randomUUID();
  const complet: MouvementAChainer = { ...mouvement, id };
  const { rang, empreinte, horodatage } = await ajouterMaillon(tx, acteur, {
    centreId,
    type: TYPE_MAILLON_MOUVEMENT[mouvement.nature],
    factureId: mouvement.factureId,
    charge: chargeMouvement(complet, hacheur),
  });
  await tx.encaissement.create({
    data: {
      ...complet,
      organisationId: acteur.organisationId,
      centreId,
      rang,
      empreinte,
      acteurId: acteur.id,
      createdAt: horodatage,
    },
  });
  return id;
}

async function exigerSessionOuverte(tx: ClientTransaction, centreId: string): Promise<void> {
  const session = await tx.sessionCaisse.findUnique({
    where: { centreId_journee: { centreId, journee: versDate(aujourdhui()) } },
    select: { id: true },
  });
  if (!session) {
    throw new ErreurSaisie({}, MESSAGE_SESSION);
  }
}

type FacturePourSolde = Pick<FactureLue, 'id' | 'dossierId'>;

/**
 * Solde d'une facture. Avec un dossier, il se lit au dossier : acomptes et paiements suivent la facture suivante
 * après un avoir total. Sur une vente directe, il se lit à la facture et à ses avoirs.
 */
export async function soldeDeFacture(client: Client, facture: FacturePourSolde): Promise<Solde> {
  const { id, dossierId } = facture;
  const [pieces, mouvements] = await Promise.all([
    client.facture.findMany({
      where: {
        statut: 'VALIDEE',
        ...(dossierId ? { dossierId } : { OR: [{ id }, { factureOrigineId: id }] }),
      },
      select: { nature: true, totalTtcCentimes: true, totalResteCentimes: true },
    }),
    client.encaissement.findMany({
      where: dossierId
        ? { OR: [{ facture: { dossierId } }, { devis: { dossierId } }] }
        : { factureId: id },
      select: { nature: true, montantCentimes: true },
    }),
  ]);
  return calculerSolde(pieces, mouvements);
}

/** Encaisse sur une facture validée. Le plafond se lit sous le verrou de tête : deux caisses ne le dépassent pas. */
export async function encaisserFacture(
  acteur: UtilisateurConnecte,
  factureId: string,
  saisie: unknown,
): Promise<string> {
  if (!peutEncaisser(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(encaissementSaisieSchema, saisie);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      const facture = await lireFacture(tx, acteur, factureId);
      if (facture.statut !== 'VALIDEE' || facture.nature !== 'FACTURE') {
        throw new ErreurSaisie({}, MESSAGE_FACTURE);
      }
      await verrouillerTete(txCaisse(tx), acteur.organisationId, facture.centreId);
      if (donnees.mode === 'ESPECES') {
        await exigerSessionOuverte(tx, facture.centreId);
      }
      const { plafond } = await soldeDeFacture(tx as unknown as Client, facture);
      if (donnees.montantCentimes > plafond) {
        throw ErreurSaisie.surChamp(
          'montant',
          `Au plus ${formatEuros(plafond)} sur cette facture.`,
        );
      }
      const id = await ecrireMouvement(tx, acteur, facture.centreId, {
        ...donnees,
        nature: 'ENCAISSEMENT',
        origineId: null,
        factureId,
        devisId: null,
        patientId: facture.patientId,
        motif: null,
      });
      return { id, facture };
    },
    ({ id, facture }) =>
      evenementMouvement(id, facture, {
        factureId,
        mode: donnees.mode,
        montantCentimes: donnees.montantCentimes,
      }),
  );
  return id;
}

/** Prend un acompte sur un devis signé, au plus le TTC de l'offre retenue. */
export async function encaisserAcompte(
  acteur: UtilisateurConnecte,
  devisId: string,
  saisie: unknown,
): Promise<string> {
  if (!peutEncaisser(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(encaissementSaisieSchema, saisie);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      const devis = await tx.devis.findFirst({
        where: { id: devisId, organisationId: acteur.organisationId },
        select: {
          statut: true,
          totaux: true,
          offreRetenue: true,
          dossier: { select: { centreId: true, patientId: true } },
        },
      });
      if (!devis) {
        throw new AccesRefuseError();
      }
      const { centreId, patientId } = devis.dossier;
      verifierAccesCentre(acteur, centreId);
      if (devis.statut !== 'SIGNE') {
        throw new ErreurSaisie({}, MESSAGE_DEVIS);
      }
      await verrouillerTete(txCaisse(tx), acteur.organisationId, centreId);
      if (donnees.mode === 'ESPECES') {
        await exigerSessionOuverte(tx, centreId);
      }
      const offre = devisCalculeSchema
        .parse(devis.totaux)
        .offres.find((o) => o.rubrique === devis.offreRetenue);
      const mouvements = await tx.encaissement.findMany({
        where: { devisId },
        select: { nature: true, montantCentimes: true },
      });
      const plafond = centimes(Math.max((offre?.total.ttc ?? 0) - encaisseNet(mouvements), 0));
      if (donnees.montantCentimes > plafond) {
        throw ErreurSaisie.surChamp('montant', `Au plus ${formatEuros(plafond)} sur ce devis.`);
      }
      const id = await ecrireMouvement(tx, acteur, centreId, {
        ...donnees,
        nature: 'ENCAISSEMENT',
        origineId: null,
        factureId: null,
        devisId,
        patientId,
        motif: null,
      });
      return { id, centreId, patientId };
    },
    ({ id, centreId, patientId }) =>
      evenementMouvement(
        id,
        { centreId, patientId },
        {
          devisId,
          mode: donnees.mode,
          montantCentimes: donnees.montantCentimes,
        },
      ),
  );
  return id;
}

/**
 * Rembourse ou annule un encaissement : une opération inverse, tracée, jamais une suppression. Une annulation
 * reprend tout ce qui reste de l'origine, dans le même mode.
 * Source : fiscal/boi-tva-decla-30-10-30.html § 90 (opérations de « plus » et de « moins »).
 */
export async function rembourserEncaissement(
  acteur: UtilisateurConnecte,
  encaissementId: string,
  saisie: unknown,
): Promise<string> {
  if (!peutRembourser(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(remboursementSaisieSchema, saisie);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      const origine = await tx.encaissement.findFirst({
        where: { id: encaissementId, organisationId: acteur.organisationId },
      });
      if (!origine) {
        throw new AccesRefuseError();
      }
      verifierAccesCentre(acteur, origine.centreId);
      if (origine.nature !== 'ENCAISSEMENT') {
        throw new ErreurSaisie({}, MESSAGE_ORIGINE);
      }
      await verrouillerTete(txCaisse(tx), acteur.organisationId, origine.centreId);
      if (donnees.mode === 'ESPECES') {
        await exigerSessionOuverte(tx, origine.centreId);
      }
      const inverses = await tx.encaissement.findMany({
        where: { origineId: encaissementId },
        select: { montantCentimes: true },
      });
      const reste = resteRemboursable(origine.montantCentimes, inverses);
      if (donnees.montantCentimes > reste) {
        throw ErreurSaisie.surChamp(
          'montant',
          `Au plus ${formatEuros(reste)} sur cet encaissement.`,
        );
      }
      if (
        donnees.nature === 'ANNULATION' &&
        (donnees.mode !== origine.mode || donnees.montantCentimes !== reste)
      ) {
        throw new ErreurSaisie({}, 'Une annulation reprend tout le reste, dans le même mode.');
      }
      const id = await ecrireMouvement(tx, acteur, origine.centreId, {
        nature: donnees.nature,
        origineId: encaissementId,
        factureId: origine.factureId,
        devisId: origine.devisId,
        patientId: origine.patientId,
        mode: donnees.mode,
        montantCentimes: donnees.montantCentimes,
        remisCentimes: null,
        renduCentimes: centimes(0),
        partenaire: null,
        echeances: null,
        reference: donnees.reference,
        motif: donnees.motif,
      });
      return { id, origine };
    },
    ({ id, origine }) =>
      evenementMouvement(id, origine, {
        origineId: encaissementId,
        nature: donnees.nature,
        montantCentimes: donnees.montantCentimes,
      }),
  );
  return id;
}

export interface MouvementVue {
  readonly id: string;
  readonly nature: NatureMouvement;
  readonly mode: ModePaiement;
  readonly montantCentimes: number;
  readonly renduCentimes: number;
  readonly createdAt: Date;
  readonly origineId: string | null;
  readonly remboursable: number;
  readonly reference: string | null;
  readonly partenaire: string | null;
  readonly echeances: number | null;
  readonly motif: string | null;
}

function versVues(
  lignes: readonly (Omit<MouvementVue, 'remboursable'> & { readonly id: string })[],
): MouvementVue[] {
  return lignes.map((ligne) => ({
    ...ligne,
    remboursable:
      ligne.nature === 'ENCAISSEMENT'
        ? resteRemboursable(
            ligne.montantCentimes,
            lignes.filter((l) => l.origineId === ligne.id),
          )
        : 0,
  }));
}

export interface EncaissementsFacture {
  readonly solde: Solde;
  readonly mouvements: readonly MouvementVue[];
}

/** Encaissements d'une pièce validée et solde, affichés avec le détail, dont la lecture est journalisée. */
export async function encaissementsDeFacture(
  acteur: UtilisateurConnecte,
  factureId: string,
): Promise<EncaissementsFacture> {
  const client = base(acteur);
  const facture = await lireFacture(client, acteur, factureId);
  const [solde, mouvements] = await Promise.all([
    soldeDeFacture(client, facture),
    client.encaissement.findMany({
      where: facture.dossierId
        ? {
            OR: [
              { facture: { dossierId: facture.dossierId } },
              { devis: { dossierId: facture.dossierId } },
            ],
          }
        : { factureId },
      orderBy: { rang: 'asc' },
    }),
  ]);
  return { solde, mouvements: versVues(mouvements) };
}

export interface AcomptesDevis {
  readonly mouvements: readonly MouvementVue[];
  readonly net: number;
}

export async function acomptesDuDevis(
  acteur: UtilisateurConnecte,
  devisId: string,
): Promise<AcomptesDevis> {
  const client = base(acteur);
  const devis = await client.devis.findFirst({
    where: { id: devisId, organisationId: acteur.organisationId },
    select: { dossier: { select: { centreId: true } } },
  });
  if (!devis) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, devis.dossier.centreId);
  const mouvements = await client.encaissement.findMany({
    where: { devisId },
    orderBy: { rang: 'asc' },
  });
  return { mouvements: versVues(mouvements), net: encaisseNet(mouvements) };
}

/** Mouvements d'une journée de caisse, pour le comptage et l'écran du jour. */
export function mouvementsDuJour(client: Client, centreId: string, jour: string) {
  const { debut, fin } = bornesJourMs(jour);
  return client.encaissement.findMany({
    where: { centreId, createdAt: { gte: new Date(debut), lt: new Date(fin) } },
    orderBy: { rang: 'asc' },
    include: {
      patient: { select: { id: true, prenoms: true, nomUsage: true, nomNaissance: true } },
      facture: { select: { id: true, numero: true } },
    },
  });
}
