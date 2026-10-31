import type { Prisma } from '@ha/db';
import {
  HORAIRES_VIDES,
  horairesOuvertureSchema,
  STATUTS_RDV,
  occupeLeCreneau,
  type ExceptionAgenda,
  type HorairesOuverture,
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
