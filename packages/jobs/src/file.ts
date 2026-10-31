import { FUSEAU_HORAIRE } from '@ha/domain';
import { PgBoss } from 'pg-boss';
import type { z } from 'zod';

import { enveloppeSchema, executerEnveloppe, type Enveloppe, type Travail } from './travail';

/** File de travaux sur PostgreSQL (pg-boss), dans le schéma `pgboss` du rôle ha_jobs (ADR-018). */
export class FileTravaux {
  private readonly boss: PgBoss;

  constructor(connectionString: string) {
    // Le schéma est créé par la migration `roles_connexion` : ha_jobs n'a pas à créer de schéma.
    this.boss = new PgBoss({ connectionString, schema: 'pgboss', createSchema: false });
    this.boss.on('error', (erreur: Error) => {
      console.error(`File de travaux : ${erreur.message}`);
    });
  }

  async demarrer(): Promise<void> {
    await this.boss.start();
  }

  async arreter(): Promise<void> {
    await this.boss.stop({ graceful: true });
  }

  /** `stately` : une seule occurrence de chaque clé en attente à la fois. */
  async declarer<S extends z.ZodType>(travail: Travail<S>): Promise<void> {
    await this.boss.createQueue(travail.nom, { policy: 'stately' });
  }

  /** Met un travail en file ; `null` si ce client y a déjà la même `cleIdempotence`. */
  async envoyer<S extends z.ZodType>(
    travail: Travail<S>,
    enveloppe: Enveloppe,
  ): Promise<string | null> {
    const valide = enveloppeSchema.parse(enveloppe);
    travail.charge.parse(valide.charge);
    // La clé est portée par client : deux clients peuvent utiliser la même sans se gêner.
    const singletonKey = `${valide.organisationId}:${valide.cleIdempotence}`;
    return this.boss.send(travail.nom, valide, { singletonKey });
  }

  /**
   * Tâche planifiée sans client : elle ne touche à aucune donnée métier, et sert à mettre en file des travaux
   * par organisation (ADR-020). Au-delà, tout passe par l'enveloppe.
   */
  async planifierTransverse(
    nom: string,
    cron: string,
    executer: () => Promise<void>,
  ): Promise<void> {
    await this.boss.createQueue(nom, { policy: 'stately' });
    await this.boss.schedule(nom, cron, null, { tz: FUSEAU_HORAIRE });
    await this.boss.work(nom, async () => {
      await executer();
    });
  }

  async ecouter<S extends z.ZodType>(
    travail: Travail<S>,
    options: { readonly intervalleSecondes?: number } = {},
  ): Promise<void> {
    await this.boss.work(
      travail.nom,
      { pollingIntervalSeconds: options.intervalleSecondes ?? 2 },
      async (lot) => {
        for (const job of lot) {
          await executerEnveloppe(travail, job.data);
        }
      },
    );
  }
}
