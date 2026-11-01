import type { PrismaClient } from '../src/generated/prisma/client';

// SAV de démonstration : le parc de prêt d'un centre, et l'appareil prêté de seed-stock.ts, en retard.

const PRET_ID = '019a9200-0000-7000-8000-000000000001';

function ilYA(jours: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - jours);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function seedSav(
  db: PrismaClient,
  organisationId: string,
  centrePret: string,
  creePar: string,
): Promise<void> {
  const prete = await db.appareil.findFirst({
    where: { organisationId, statut: 'PRET', patientId: { not: null } },
    select: { id: true, centreId: true, patientId: true },
    orderBy: { id: 'asc' },
  });
  if (prete?.patientId) {
    await db.appareil.update({ where: { id: prete.id }, data: { parcPret: true } });
    const pret = {
      organisationId,
      appareilId: prete.id,
      centreId: prete.centreId,
      patientId: prete.patientId,
      dateDebut: ilYA(40),
      dateRetourPrevue: ilYA(10),
      createdById: creePar,
    };
    await db.pretAppareil.upsert({
      where: { id: PRET_ID },
      create: { id: PRET_ID, ...pret },
      update: pret,
    });
  }
  const libre = await db.appareil.findFirst({
    where: { organisationId, centreId: centrePret, statut: 'EN_STOCK', parcPret: false },
    select: { id: true },
    orderBy: { id: 'desc' },
  });
  if (libre) {
    await db.appareil.update({ where: { id: libre.id }, data: { parcPret: true } });
  }
}
