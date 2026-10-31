import { clientPlateforme, type Prisma } from '@ha/db';
import {
  assainirPourAudit,
  contientNir,
  VALEUR_MASQUEE,
  type ActionAudit,
  type ChampModifie,
  type RoleCompte,
  type TypeEntite,
} from '@ha/domain';

import type { CompteConnecte, UtilisateurConnecte } from '../auth/acces';
import { enTransaction, type ClientTransaction } from '../chiffrement';

/** Une ligne du journal à écrire. Les champs et détails sont assainis (NIR masqué) avant écriture. */
export interface EvenementAudit {
  readonly action: ActionAudit;
  readonly entiteType: TypeEntite;
  readonly entiteId?: string | null;
  /** Patient concerné (dossier, devis…) : alimente le filtre « patient » de l'écran d'audit. */
  readonly patientId?: string | null;
  readonly centreId?: string | null;
  /** Différences calculées par `differencesAuditees` (liste blanche du domaine). */
  readonly champs?: readonly ChampModifie[];
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Auteur d'une ligne : figé au moment de l'action (le compte peut changer de nom ensuite). */
export interface AuteurAudit {
  readonly utilisateurId: string | null;
  readonly libelle: string;
  readonly role: RoleCompte | null;
  readonly organisationId: string | null;
}

export function auteurDepuisActeur(acteur: CompteConnecte): AuteurAudit {
  return {
    utilisateurId: acteur.id,
    libelle: `${acteur.prenom} ${acteur.nom} <${acteur.email}>`,
    role: acteur.role,
    organisationId: acteur.organisationId,
  };
}

/** Tout client capable d'écrire le journal : transaction, client du contexte ou rôle plateforme. */
export interface ClientJournal {
  readonly journalAudit: {
    createMany(args: { data: Prisma.JournalAuditCreateManyInput[] }): PromiseLike<unknown>;
  };
}

type Evenements = EvenementAudit | readonly EvenementAudit[];

function enListe(evenements: Evenements): readonly EvenementAudit[] {
  return Array.isArray(evenements) ? evenements : [evenements as EvenementAudit];
}

function json(valeur: unknown): Prisma.InputJsonValue {
  return assainirPourAudit(valeur) as Prisma.InputJsonValue;
}

/**
 * Écrit une ou plusieurs lignes avec le client fourni (transaction en cours, `base(acteur)` ou plateforme).
 * Bas niveau : les services passent par `withAudit` ; seuls les connexions, la console et les exports
 * l'appellent directement.
 */
export async function journaliser(
  client: ClientJournal,
  auteur: AuteurAudit,
  evenements: Evenements,
): Promise<void> {
  const libelle = contientNir(auteur.libelle) ? VALEUR_MASQUEE : auteur.libelle.slice(0, 320);
  await client.journalAudit.createMany({
    data: enListe(evenements).map((e) => ({
      organisationId: auteur.organisationId,
      utilisateurId: auteur.utilisateurId,
      utilisateurLibelle: libelle,
      role: auteur.role,
      centreId: e.centreId ?? null,
      action: e.action,
      entiteType: e.entiteType,
      entiteId: e.entiteId ?? null,
      patientId: e.patientId ?? null,
      ...(e.champs && e.champs.length > 0 ? { champs: json(e.champs) } : {}),
      ...(e.details ? { details: json(e.details) } : {}),
    })),
  });
}

/**
 * `withAudit` pour le rôle plateforme : compte éditeur ou console, sans contexte client.
 * `cible` : client concerné, qui verra la ligne dans son journal ; `null` si aucun.
 * `evenement` peut renvoyer `null` : l'opération n'a rien changé, rien à journaliser.
 */
export async function withAuditPlateforme<T>(
  acteur: CompteConnecte,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  cible: (resultat: T) => string | null,
  evenement: (resultat: T) => Evenements | null,
): Promise<T> {
  return clientPlateforme().$transaction(async (tx) => {
    const resultat = await operation(tx);
    const evenements = evenement(resultat);
    if (evenements !== null) {
      const auteur = { ...auteurDepuisActeur(acteur), organisationId: cible(resultat) };
      await journaliser(tx, auteur, evenements);
    }
    return resultat;
  });
}

/**
 * Exécute `operation` et journalise dans la même transaction : si l'écriture du journal échoue,
 * l'opération est annulée (et inversement, une opération en échec ne laisse aucune ligne).
 * `evenement` peut dépendre du résultat (ex. identifiant créé).
 *
 * Règle : tout service qui lit ou modifie un dossier patient passe par ici
 * (ouvrir un dossier = une ligne READ).
 */
export async function withAudit<T>(
  acteur: UtilisateurConnecte,
  operation: (tx: ClientTransaction) => Promise<T>,
  evenement: Evenements | ((resultat: T) => Evenements),
): Promise<T> {
  return enTransaction(acteur, async (tx) => {
    const resultat = await operation(tx);
    const evenements = typeof evenement === 'function' ? evenement(resultat) : evenement;
    await journaliser(tx, auteurDepuisActeur(acteur), evenements);
    return resultat;
  });
}
