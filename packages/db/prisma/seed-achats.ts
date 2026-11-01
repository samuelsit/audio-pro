import type { PrismaClient } from '../src/generated/prisma/client';

// Fiches d'achat fictives, aux adresses en `exemple.test`. Une par fabricant du catalogue, un fournisseur de piles.

const CENTRALE_ID = '019a9000-0000-7000-8000-000000000001';
const FOURNISSEUR_PILES_ID = '019a9000-0000-7000-8000-000000000002';

function idFournisseur(rang: number): string {
  return `019a9100-0000-7000-8000-${String(rang).padStart(12, '0')}`;
}

export async function seedAchats(db: PrismaClient, organisationId: string): Promise<void> {
  const centrale = {
    organisationId,
    nom: 'Centrale Démo Audition',
    email: 'releves@centrale-demo.exemple.test',
  };
  await db.centraleAchat.upsert({
    where: { id: CENTRALE_ID },
    create: { id: CENTRALE_ID, ...centrale },
    update: centrale,
  });

  const fabricants = await db.fabricant.findMany({
    where: { organisationId },
    select: { id: true, nom: true },
    orderBy: { nom: 'asc' },
  });
  for (const [rang, { id: fabricantId, nom }] of fabricants.entries()) {
    const id = idFournisseur(rang + 1);
    const fiche = {
      organisationId,
      type: 'FABRICANT' as const,
      nom,
      fabricantId,
      // Le premier passe par la centrale, pour montrer un relevé.
      centraleAchatId: rang === 0 ? CENTRALE_ID : null,
      emailCommande: `commandes${rang + 1}@fabricant-demo.exemple.test`,
      emailFacturation: `factures${rang + 1}@fabricant-demo.exemple.test`,
      conditions: 'Paiement à 30 jours, franco de port.',
    };
    await db.fournisseur.upsert({ where: { id }, create: { id, ...fiche }, update: fiche });
  }

  const piles = {
    organisationId,
    type: 'FOURNISSEUR' as const,
    nom: 'Piles et Accessoires Démo',
    emailCommande: 'commandes@piles-demo.exemple.test',
    emailFacturation: 'factures@piles-demo.exemple.test',
  };
  await db.fournisseur.upsert({
    where: { id: FOURNISSEUR_PILES_ID },
    create: { id: FOURNISSEUR_PILES_ID, ...piles },
    update: piles,
  });
  await db.accessoire.updateMany({
    where: { organisationId },
    data: { fournisseurId: FOURNISSEUR_PILES_ID },
  });
  await db.modeleAideAuditive.updateMany({
    where: { organisationId, prixAchatCentimes: null },
    data: { prixAchatCentimes: 65_000 },
  });
}
