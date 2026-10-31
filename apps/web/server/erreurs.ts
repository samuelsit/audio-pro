import { estBloquant, LIBELLES_CONFLITS, type CodeConflit } from '@ha/domain';
import type { z } from 'zod';

/** Erreurs de saisie par champ, affichables dans un formulaire. */
export type ErreursChamps = Readonly<Record<string, readonly string[]>>;

export class ErreurSaisie extends Error {
  constructor(
    readonly erreurs: ErreursChamps,
    message = 'Le formulaire contient des erreurs.',
  ) {
    super(message);
    this.name = 'ErreurSaisie';
  }

  static depuisZod(erreur: z.ZodError): ErreurSaisie {
    const erreurs: Record<string, string[]> = {};
    for (const issue of erreur.issues) {
      const champ = String(issue.path[0] ?? '_');
      (erreurs[champ] ??= []).push(issue.message);
    }
    return new ErreurSaisie(erreurs);
  }

  static surChamp(champ: string, message: string): ErreurSaisie {
    return new ErreurSaisie({ [champ]: [message] }, message);
  }
}

/** Valide `donnees` avec `schema` ; lève une ErreurSaisie lisible sinon. */
export function valider<S extends z.ZodType>(schema: S, donnees: unknown): z.output<S> {
  const resultat = schema.safeParse(donnees);
  if (!resultat.success) {
    throw ErreurSaisie.depuisZod(resultat.error);
  }
  return resultat.data;
}

/**
 * Nom de la contrainte d'unicité violée (erreur Prisma P2002), sinon `null`.
 * Avec le driver adapter PostgreSQL (Prisma 7), seul le nom de l'index est fourni
 * (ex. « praticien_rpps_key »), pas la liste des champs.
 */
export function contrainteEnDoublon(erreur: unknown): string | null {
  if (typeof erreur !== 'object' || erreur === null || !('code' in erreur)) {
    return null;
  }
  if (erreur.code !== 'P2002') {
    return null;
  }
  const meta = (
    erreur as { meta?: { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } } }
  ).meta;
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  return typeof index === 'string' ? index : '';
}

/**
 * Traduit une violation d'unicité en ErreurSaisie sur le bon champ ; relance toute autre erreur.
 * `messages` associe un nom de contrainte à [champ, message].
 */
export function traduireDoublon(
  erreur: unknown,
  messages: Readonly<Record<string, readonly [string, string]>>,
  messageParDefaut: string,
): never {
  const contrainte = contrainteEnDoublon(erreur);
  if (contrainte === null) {
    throw erreur;
  }
  const connu = messages[contrainte];
  throw connu ? ErreurSaisie.surChamp(...connu) : new ErreurSaisie({}, messageParDefaut);
}

/**
 * Créneau refusé. `confirmable` : rien de bloquant, l'utilisateur peut passer outre et l'action est tracée
 * (ADR-020). Une ressource déjà prise ne se force pas.
 */
export class ErreurConflitAgenda extends ErreurSaisie {
  readonly confirmable: boolean;

  constructor(
    readonly codes: readonly CodeConflit[],
    message = codes.map((code) => LIBELLES_CONFLITS[code]).join(' '),
  ) {
    super({}, message);
    this.name = 'ErreurConflitAgenda';
    this.confirmable = !codes.some(estBloquant);
  }
}

/** Détail d'une erreur PostgreSQL que le driver adapter de Prisma 7 n'expose que dans `meta`. */
interface CausePostgres {
  readonly originalCode?: unknown;
  readonly originalMessage?: unknown;
}

function causePostgres(erreur: object): CausePostgres | undefined {
  return (erreur as { meta?: { driverAdapterError?: { cause?: CausePostgres } } }).meta
    ?.driverAdapterError?.cause;
}

/**
 * Ressource perdue d'une réservation simultanée, sinon `null` : la contrainte d'exclusion (23P01) a tranché,
 * ou deux insertions se sont interbloquées (40P01), ce qui revient au même pour le perdant.
 */
export function ressourcePerdue(erreur: unknown): CodeConflit | null {
  if (typeof erreur !== 'object' || erreur === null) {
    return null;
  }
  const { originalCode, originalMessage } = causePostgres(erreur) ?? {};
  if (originalCode !== '23P01' && originalCode !== '40P01') {
    return null;
  }
  return typeof originalMessage === 'string' && originalMessage.includes('rendez_vous_cabine')
    ? 'CABINE_PRISE'
    : 'PRATICIEN_PRIS';
}
