import { clientOrganisation } from '@ha/db';
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

export interface ContexteTravail {
  readonly organisationId: string;
  /** Client soumis à la RLS, dans le contexte de l'organisation. */
  readonly client: ReturnType<typeof clientOrganisation>;
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
    { organisationId, client: clientOrganisation(organisationId) },
    travail.charge.parse(charge),
  );
}
