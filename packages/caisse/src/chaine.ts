import type { Prisma } from '@ha/db';
import {
  chargePiece,
  centimes,
  EMPREINTE_INITIALE,
  enchainer,
  type Clock,
  type Hacheur,
  type Maillon,
  type NaturePiece,
  type PieceAChainer,
  type TypeEvenementCaisse,
} from '@ha/domain';

/** Transaction interactive, contexte client posé. Web et travaux y passent leur propre client chiffré. */
export type TxCaisse = Prisma.TransactionClient;

export interface ContexteChaine {
  readonly organisationId: string;
  /** Nul pour un travail planifié, sur les seuls `TYPES_EVENEMENT_SYSTEME`. */
  readonly acteurId: string | null;
  readonly horloge: Clock;
  readonly hacheur: Hacheur;
}

export interface MaillonAAjouter {
  readonly centreId: string;
  readonly type: TypeEvenementCaisse;
  readonly factureId?: string | null;
  readonly charge: unknown;
}

export interface MaillonEcrit {
  readonly rang: number;
  readonly empreinte: string;
  readonly horodatage: Date;
}

interface Tete {
  readonly dernier_rang: number;
  readonly derniere_empreinte: string;
}

/**
 * Verrouille la tête de chaîne du centre jusqu'au commit : un rollback la rend intacte, deux ajouts s'attendent.
 * `INSERT … ON CONFLICT` couvre la course du tout premier maillon.
 */
export async function verrouillerTete(
  tx: TxCaisse,
  organisationId: string,
  centreId: string,
): Promise<Tete> {
  const [tete] = await tx.$queryRaw<Tete[]>`
    INSERT INTO "chaine_caisse" ("centre_id", "organisation_id", "dernier_rang", "derniere_empreinte", "updated_at")
    VALUES (${centreId}, ${organisationId}, 0, ${EMPREINTE_INITIALE}, now())
    ON CONFLICT ("centre_id") DO UPDATE SET "updated_at" = now()
    RETURNING "dernier_rang", "derniere_empreinte"`;
  if (!tete) {
    throw new Error('Tête de chaîne introuvable.');
  }
  return tete;
}

/** Sous le verrou, et jamais en arrière : une clôture découpe la chaîne par instants, un recul d'horloge la tromperait. */
async function horodatageSuivant(
  tx: TxCaisse,
  { horloge }: ContexteChaine,
  centreId: string,
  dernierRang: number,
): Promise<Date> {
  const maintenant = new Date(horloge.now());
  const precedent = await tx.evenementCaisse.findUnique({
    where: { centreId_rang: { centreId, rang: dernierRang } },
    select: { createdAt: true },
  });
  return precedent && precedent.createdAt > maintenant ? precedent.createdAt : maintenant;
}

/** Ajoute un maillon de format 2 à la chaîne du centre, dans la transaction de l'opération qu'il prouve. */
export async function ajouterMaillon(
  tx: TxCaisse,
  contexte: ContexteChaine,
  { centreId, type, factureId, charge }: MaillonAAjouter,
): Promise<MaillonEcrit> {
  const { organisationId, acteurId, hacheur } = contexte;
  const tete = await verrouillerTete(tx, organisationId, centreId);
  const rang = tete.dernier_rang + 1;
  const empreintePrecedente = tete.derniere_empreinte;
  const horodatage = await horodatageSuivant(tx, contexte, centreId, tete.dernier_rang);
  const empreinte = enchainer(
    {
      format: 2,
      rang,
      type,
      charge,
      empreintePrecedente,
      centreId,
      acteurId,
      horodatage: horodatage.toISOString(),
    },
    hacheur,
  );
  await tx.evenementCaisse.create({
    data: {
      organisationId,
      centreId,
      rang,
      format: 2,
      type,
      factureId: factureId ?? null,
      charge: charge as Prisma.InputJsonValue,
      empreintePrecedente,
      empreinte,
      acteurId,
      createdAt: horodatage,
    },
  });
  await tx.chaineCaisse.update({
    where: { centreId },
    data: { dernierRang: rang, derniereEmpreinte: empreinte },
  });
  return { rang, empreinte, horodatage };
}

export interface EvenementLu {
  readonly rang: number;
  readonly format: number;
  readonly type: TypeEvenementCaisse;
  readonly charge: unknown;
  readonly empreintePrecedente: string;
  readonly empreinte: string;
  readonly centreId: string;
  readonly acteurId: string | null;
  readonly createdAt: Date;
}

/** Un maillon de format 1 n'a haché ni horodatage, ni acteur, ni centre. */
export function maillonDepuisBase(evenement: EvenementLu): Maillon {
  const { rang, type, charge, empreintePrecedente, empreinte } = evenement;
  if (evenement.format !== 2) {
    return { rang, type, charge, empreintePrecedente, empreinte };
  }
  const { centreId, acteurId, createdAt } = evenement;
  return {
    format: 2,
    rang,
    type,
    charge,
    empreintePrecedente,
    empreinte,
    centreId,
    acteurId,
    horodatage: createdAt.toISOString(),
  };
}

/** Ligne telle qu'en base : la charge se calcule de la même façon à la validation et à la vérification. */
export interface LigneChainee {
  readonly nature: string;
  readonly codeLpp: string | null;
  readonly codePrestation: string | null;
  readonly numeroSerie: string | null;
  readonly quantite: number;
  readonly prixTtcCentimes: number;
  readonly tauxTva: number | null;
  readonly montantHtCentimes: number;
  readonly montantTvaCentimes: number;
  readonly amoCentimes: number;
  readonly amcCentimes: number;
  readonly resteAChargeCentimes: number;
}

export interface PieceChainee {
  readonly id: string;
  readonly nature: NaturePiece;
  readonly numero: string;
  readonly numeroSequence: number;
  readonly dateFacture: string;
  readonly patientId: string;
  readonly dossierId: string | null;
  readonly factureOrigineId: string | null;
  readonly acomptesDeduitsCentimes?: number;
  readonly tiersPayantAmo?: boolean;
  readonly totalTtcCentimes: number;
  readonly totalHtCentimes: number;
  readonly totalTvaCentimes: number;
  readonly totalAmoCentimes: number;
  readonly totalAmcCentimes: number;
  readonly totalResteCentimes: number;
}

export function chargeDepuisBase(piece: PieceChainee, lignes: readonly LigneChainee[]): unknown {
  const entree: PieceAChainer = {
    id: piece.id,
    nature: piece.nature,
    numero: piece.numero,
    numeroSequence: piece.numeroSequence,
    dateFacture: piece.dateFacture,
    patientId: piece.patientId,
    dossierId: piece.dossierId,
    factureOrigineId: piece.factureOrigineId,
    acomptesDeduits: centimes(piece.acomptesDeduitsCentimes ?? 0),
    ...(piece.tiersPayantAmo === undefined ? {} : { tiersPayantAmo: piece.tiersPayantAmo }),
    totaux: {
      prixTTC: centimes(piece.totalTtcCentimes),
      ht: centimes(piece.totalHtCentimes),
      tva: centimes(piece.totalTvaCentimes),
      amo: centimes(piece.totalAmoCentimes),
      amc: centimes(piece.totalAmcCentimes),
      resteACharge: centimes(piece.totalResteCentimes),
    },
    lignes: lignes.map((l) => ({
      nature: l.nature,
      codeLpp: l.codeLpp,
      codePrestation: l.codePrestation,
      numeroSerie: l.numeroSerie,
      quantite: l.quantite,
      prixTTC: centimes(l.prixTtcCentimes),
      tauxTva: l.tauxTva,
      montantHT: centimes(l.montantHtCentimes),
      montantTva: centimes(l.montantTvaCentimes),
      amo: centimes(l.amoCentimes),
      amc: centimes(l.amcCentimes),
      resteACharge: centimes(l.resteAChargeCentimes),
    })),
  };
  return chargePiece(entree);
}
