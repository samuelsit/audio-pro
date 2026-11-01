import {
  CHAMPS_CHIFFRES,
  chargerTrousseau,
  ChiffreurAesGcm,
  extensionChampsChiffres,
} from '@ha/adapters';
import { clientApplication, clientOrganisation, poserContexte, type Prisma } from '@ha/db';
import type { TxCaisse } from '@ha/caisse';
import { z } from 'zod';

/**
 * Enveloppe de tout travail. L'organisation est obligatoire : aucun travail ne s'exécute sans contexte
 * client (ADR-018). `cleIdempotence` : un même travail n'est pas mis deux fois en file.
 */
export const enveloppeSchema = z.object({
  organisationId: z.string().min(1),
  cleIdempotence: z.string().min(1),
  charge: z.unknown(),
});
export type Enveloppe = z.infer<typeof enveloppeSchema>;

let chiffreur: ChiffreurAesGcm | undefined;

function creerClient(organisationId: string) {
  chiffreur ??= new ChiffreurAesGcm(chargerTrousseau(process.env));
  return clientOrganisation(organisationId).$extends(
    extensionChampsChiffres(chiffreur, CHAMPS_CHIFFRES),
  );
}

const clients = new Map<string, ReturnType<typeof creerClient>>();

/** Client soumis à la RLS, avec le même chiffrement que l'application. */
function clientChiffre(organisationId: string): ReturnType<typeof creerClient> {
  let client = clients.get(organisationId);
  if (!client) {
    client = creerClient(organisationId);
    clients.set(organisationId, client);
  }
  return client;
}

function creerClientTransactions(chiffreurActif: ChiffreurAesGcm) {
  return clientApplication().$extends(extensionChampsChiffres(chiffreurActif, CHAMPS_CHIFFRES));
}

let clientTransactions: ReturnType<typeof creerClientTransactions> | undefined;

/** Le travail de caisse enchaîne plusieurs requêtes sous un verrou : il a besoin d'une vraie transaction. */
export function enTransaction<T>(
  organisationId: string,
  operation: (tx: TxCaisse) => Promise<T>,
): Promise<T> {
  chiffreur ??= new ChiffreurAesGcm(chargerTrousseau(process.env));
  clientTransactions ??= creerClientTransactions(chiffreur);
  return clientTransactions.$transaction(async (tx) => {
    await poserContexte(tx, organisationId);
    return operation(tx as unknown as TxCaisse);
  });
}

/** Transaction interactive chiffrée, contexte client posé, pour écrire plusieurs lignes d'un seul tenant. */
export function enTransactionChiffree<T>(
  organisationId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return enTransaction(organisationId, (tx) => operation(tx));
}

export interface ContexteTravail {
  readonly organisationId: string;
  readonly client: ReturnType<typeof clientChiffre>;
}

export interface Travail<S extends z.ZodType> {
  readonly nom: string;
  readonly charge: S;
  /** Toujours idempotent : pg-boss peut rejouer un travail en échec. */
  executer(contexte: ContexteTravail, charge: z.output<S>): Promise<void>;
}

export function definirTravail<S extends z.ZodType>(travail: Travail<S>): Travail<S> {
  return travail;
}

/** Valide l'enveloppe et la charge, puis exécute le travail dans le contexte de son organisation. */
export async function executerEnveloppe<S extends z.ZodType>(
  travail: Travail<S>,
  donnees: unknown,
): Promise<void> {
  const { organisationId, charge } = enveloppeSchema.parse(donnees);
  await travail.executer(
    { organisationId, client: clientChiffre(organisationId) },
    travail.charge.parse(charge),
  );
}
