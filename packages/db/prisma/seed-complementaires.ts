import type { PrismaClient } from '../src/generated/prisma/client';

// Référentiel fictif : organismes et plateformes inventés. Les identifiants reprennent ceux des couvertures du seed,
// pour que la préselection fonctionne. Les créances naissent à la validation : la vente du seed n'a pas de part AMO.

const COMPLEMENTAIRES = [
  {
    id: '019a8000-0000-7000-8000-000000000001',
    nom: 'Mutuelle Démo Avenir',
    identifiant: '99999991',
    plateformeTiersPayant: 'Plateforme Démo Santé',
    telephone: '0100000001',
    email: 'pec@mutuelle-demo.exemple.test',
    adresse: '1 rue de l’Exemple, 75000 Paris',
    delaiPaiementJours: 30,
  },
  {
    id: '019a8000-0000-7000-8000-000000000002',
    nom: 'Prévoyance Fictive',
    identifiant: '99999992',
    plateformeTiersPayant: 'Plateforme Démo Santé',
    telephone: '0100000002',
    email: 'pec@prevoyance-fictive.exemple.test',
    adresse: '2 rue de l’Exemple, 75000 Paris',
    delaiPaiementJours: 45,
  },
  {
    id: '019a8000-0000-7000-8000-000000000003',
    nom: 'Assurance Santé Exemple',
    identifiant: '99999993',
    plateformeTiersPayant: null,
    telephone: null,
    email: null,
    adresse: null,
    delaiPaiementJours: 30,
  },
] as const;

export const NOMBRE_COMPLEMENTAIRES_DEMO = COMPLEMENTAIRES.length;

export async function seedComplementaires(db: PrismaClient, organisationId: string): Promise<void> {
  for (const complementaire of COMPLEMENTAIRES) {
    await db.complementaire.upsert({
      where: { id: complementaire.id },
      create: { ...complementaire, organisationId },
      update: complementaire,
    });
  }
}
