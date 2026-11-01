import { HacheurSha256 } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  centimes,
  chargePiece,
  EMPREINTE_INITIALE,
  enchainer,
  serialiserCanonique,
  verifierChaine,
  type Maillon,
  type NaturePiece,
  type PieceAChainer,
  type ResultatChaine,
  type TypeEvenementCaisse,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { base, type ClientTransaction } from '../chiffrement';
import { depuisDate } from './dossiers';

const hacheur = new HacheurSha256();

interface MaillonAAjouter {
  readonly centreId: string;
  readonly type: TypeEvenementCaisse;
  readonly factureId: string;
  readonly charge: unknown;
}

/**
 * Ajoute un maillon à la chaîne du centre. La tête se verrouille jusqu'au commit : un rollback la rend
 * intacte, deux ajouts s'attendent. `INSERT … ON CONFLICT` couvre la course du tout premier maillon.
 */
export async function ajouterMaillon(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  { centreId, type, factureId, charge }: MaillonAAjouter,
): Promise<string> {
  const { organisationId } = acteur;
  const [tete] = await tx.$queryRaw<{ dernier_rang: number; derniere_empreinte: string }[]>`
    INSERT INTO "chaine_caisse" ("centre_id", "organisation_id", "dernier_rang", "derniere_empreinte", "updated_at")
    VALUES (${centreId}, ${organisationId}, 0, ${EMPREINTE_INITIALE}, now())
    ON CONFLICT ("centre_id") DO UPDATE SET "updated_at" = now()
    RETURNING "dernier_rang", "derniere_empreinte"`;
  if (!tete) {
    throw new Error('Tête de chaîne introuvable.');
  }
  const rang = tete.dernier_rang + 1;
  const empreintePrecedente = tete.derniere_empreinte;
  const empreinte = enchainer({ rang, type, charge, empreintePrecedente }, hacheur);
  await tx.evenementCaisse.create({
    data: {
      organisationId,
      centreId,
      rang,
      type,
      factureId,
      charge: charge as Prisma.InputJsonValue,
      empreintePrecedente,
      empreinte,
      acteurId: acteur.id,
    },
  });
  await tx.chaineCaisse.update({
    where: { centreId },
    data: { dernierRang: rang, derniereEmpreinte: empreinte },
  });
  return empreinte;
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

/**
 * Vérifie la chaîne d'un centre : suite des empreintes, tête, puis chaque pièce validée recalculée depuis ses
 * lignes. Une ligne de facture modifiée en base rompt donc la vérification, même si le journal est intact.
 */
export async function verifierChaineCaisse(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<ResultatChaine> {
  verifierAccesCentre(acteur, centreId);
  const client = base(acteur);
  // Un centre d'un autre client ne rend aucune ligne sous la RLS : une chaîne vide ne prouverait rien.
  const centre = await client.centre.findUnique({ where: { id: centreId }, select: { id: true } });
  if (!centre) {
    throw new AccesRefuseError();
  }
  const [evenements, tete, pieces] = await Promise.all([
    client.evenementCaisse.findMany({ where: { centreId }, orderBy: { rang: 'asc' } }),
    client.chaineCaisse.findUnique({ where: { centreId } }),
    client.facture.findMany({
      where: { centreId, statut: 'VALIDEE' },
      include: { lignes: { orderBy: { rang: 'asc' } } },
    }),
  ]);
  const maillons: Maillon[] = evenements;
  const suite = verifierChaine(maillons, hacheur);
  if (!suite.valide) {
    return suite;
  }
  const dernier = maillons.at(-1);
  if (
    (dernier?.empreinte ?? EMPREINTE_INITIALE) !== (tete?.derniereEmpreinte ?? EMPREINTE_INITIALE)
  ) {
    return { valide: false, rang: maillons.length };
  }
  for (const evenement of evenements) {
    if (evenement.type !== 'FACTURE_VALIDEE' && evenement.type !== 'AVOIR_VALIDE') {
      continue;
    }
    const piece = pieces.find((p) => p.id === evenement.factureId);
    if (!piece?.numero || !piece.numeroSequence || !piece.dateFacture) {
      return { valide: false, rang: evenement.rang };
    }
    const recalculee = chargeDepuisBase(
      {
        ...piece,
        numero: piece.numero,
        numeroSequence: piece.numeroSequence,
        dateFacture: depuisDate(piece.dateFacture),
      },
      piece.lignes,
    );
    if (serialiserCanonique(recalculee) !== serialiserCanonique(evenement.charge)) {
      return { valide: false, rang: evenement.rang };
    }
  }
  return suite;
}
