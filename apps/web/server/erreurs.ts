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
