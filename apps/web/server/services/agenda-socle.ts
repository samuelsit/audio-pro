import type { Prisma } from '@ha/db';
import {
  HORAIRES_VIDES,
  horairesOuvertureSchema,
  STATUTS_RDV,
  occupeLeCreneau,
  type ExceptionAgenda,
  type HorairesOuverture,
  type Occupation,
} from '@ha/domain';

import { AccesRefuseError } from '../auth/acces';
import type { ClientTransaction } from '../chiffrement';

/** Colonnes `Json?` d'horaires : vide ou absente, aucune plage. */
export function horaires(valeur: Prisma.JsonValue | null): HorairesOuverture {
  return horairesOuvertureSchema.parse(valeur ?? HORAIRES_VIDES);
}

/** Centre visible et actif, sinon refus : la RLS rendrait sinon un agenda vide pour le centre d'un autre client. */
export async function centreActif(
  client: Pick<ClientTransaction, 'centre'>,
  centreId: string,
): Promise<{ horairesOuverture: HorairesOuverture }> {
  const centre = await client.centre.findFirst({
    where: { id: centreId, actif: true },
    select: { horairesOuverture: true },
  });
  if (!centre) {
    throw new AccesRefuseError();
  }
  return { horairesOuverture: horaires(centre.horairesOuverture) };
}

/** Statuts qui tiennent un créneau, comme les contraintes d'exclusion de `rendez_vous`. */
export const STATUTS_OCCUPANTS = STATUTS_RDV.filter(occupeLeCreneau);

export const selectionException = {
  type: true,
  praticienId: true,
  cabineId: true,
  centreId: true,
  debut: true,
  fin: true,
} as const;

type LigneException = Prisma.ExceptionAgendaGetPayload<{ select: typeof selectionException }>;

export function versException(e: LigneException): ExceptionAgenda {
  return { ...e, debut: e.debut.getTime(), fin: e.fin.getTime() };
}

/** Exceptions qui touchent la période, tous centres : un congé vaut partout. */
export async function exceptionsDeLaPeriode(
  client: Pick<ClientTransaction, 'exceptionAgenda'>,
  debut: number,
  fin: number,
): Promise<ExceptionAgenda[]> {
  const lignes = await client.exceptionAgenda.findMany({
    where: { debut: { lt: new Date(fin) }, fin: { gt: new Date(debut) } },
    select: selectionException,
  });
  return lignes.map(versException);
}

export interface PeriodeOccupee {
  readonly debut: number;
  readonly fin: number;
  readonly praticienIds: readonly string[];
  readonly cabineIds: readonly string[];
  readonly instant: Date;
  /** Rendez-vous qu'on déplace : il ne se gêne pas lui-même. */
  readonly exclure?: string;
  /** Réservation qu'on finalise : même chose pour son propre verrou. */
  readonly exclureVerrou?: string;
}

/**
 * Rendez-vous et verrous en ligne encore valides sur cette période. Le marqueur `verrou` les distingue : un
 * verrou n'est pas un rendez-vous, et un interne peut passer outre (ADR-021).
 */
export async function occupationsDeLaPeriode(
  client: Pick<ClientTransaction, 'rendezVous' | 'reservationEnLigne'>,
  periode: PeriodeOccupee,
): Promise<Occupation[]> {
  const { debut, fin, praticienIds, cabineIds, instant, exclure, exclureVerrou } = periode;
  const chevauchement = { debut: { lt: new Date(fin) }, fin: { gt: new Date(debut) } };
  const ressources = [
    { praticienId: { in: [...praticienIds] } },
    { cabineId: { in: [...cabineIds] } },
  ];
  const selection = { praticienId: true, cabineId: true, debut: true, fin: true } as const;
  const rendezVous = await client.rendezVous.findMany({
    where: {
      ...(exclure ? { id: { not: exclure } } : {}),
      ...chevauchement,
      statut: { in: STATUTS_OCCUPANTS },
      OR: ressources,
    },
    select: selection,
  });
  const verrous = await client.reservationEnLigne.findMany({
    where: {
      ...(exclureVerrou ? { id: { not: exclureVerrou } } : {}),
      ...chevauchement,
      statut: 'VERROU',
      expireLe: { gt: instant },
      OR: ressources,
    },
    select: selection,
  });
  const versOccupation = (o: (typeof rendezVous)[number]) => ({
    ...o,
    debut: o.debut.getTime(),
    fin: o.fin.getTime(),
  });
  return [
    ...rendezVous.map(versOccupation),
    ...verrous.map((v) => ({ ...versOccupation(v), verrou: true })),
  ];
}
