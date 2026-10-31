import { chargerTrousseau, ChiffreurAesGcm } from '@ha/adapters';

import type { PrismaClient } from '../src/generated/prisma/client';
import type { NatureAccessoire } from '../src/generated/prisma/enums';
import { CODES_PILES } from './seed-catalogue';

// Stock fictif : numéros de série inventés (préfixe DEMO), appareils en stock et un appareil prêté.
// Le seed écrit sans l'extension Prisma de l'application : il chiffre lui-même, avec le même contexte que
// apps/web/server/chiffrement.ts. Les mouvements sont en ajout seul : un nouveau seed ne les modifie pas.

const CONTEXTE_MOTIF = 'mouvement_accessoire.motif';
const APPAREILS_PAR_CENTRE = 4;

const ACCESSOIRES: readonly {
  id: string;
  nom: string;
  nature: NatureAccessoire;
  prixCentimes: number;
  prixAchatCentimes: number;
  codeLpp: string | null;
  marque: string;
  referenceCommerciale: string;
}[] = [
  {
    id: '019a5000-0000-7000-8000-000000000001',
    nom: 'Piles 312 Démo (6)',
    nature: 'PILE',
    prixCentimes: 150,
    prixAchatCentimes: 60,
    codeLpp: CODES_PILES.PILES_312,
    marque: 'Énergie Démo',
    referenceCommerciale: 'ED-312-6',
  },
  {
    id: '019a5000-0000-7000-8000-000000000002',
    nom: 'Piles 13 Démo (6)',
    nature: 'PILE',
    prixCentimes: 150,
    prixAchatCentimes: 60,
    codeLpp: CODES_PILES.PILES_13,
    marque: 'Énergie Démo',
    referenceCommerciale: 'ED-13-6',
  },
  {
    id: '019a5000-0000-7000-8000-000000000003',
    nom: 'Kit d’entretien Démo',
    nature: 'ACCESSOIRE',
    prixCentimes: 1500,
    prixAchatCentimes: 700,
    codeLpp: null,
    marque: 'Soin Démo',
    referenceCommerciale: 'SD-KIT-1',
  },
];

/** Identifiant stable, pour un seed rejouable : `prefixe` tient sur un chiffre hexadécimal. */
function idFixe(prefixe: string, rang: number): string {
  return `019a6${prefixe}00-0000-7000-8000-${String(rang).padStart(12, '0')}`;
}

export function nombreAppareilsDemo(centres: number): number {
  return centres * APPAREILS_PAR_CENTRE;
}

/** Dernier appareil du dernier centre : loin de ceux qu'utilisent les dossiers de démonstration. */
async function seedAppareilPrete(
  db: PrismaClient,
  organisationId: string,
  centreIds: readonly string[],
  utilisateurId: string,
  appareils: readonly { id: string; centreId: string }[],
): Promise<void> {
  const appareil = appareils.at(-1);
  const centreId = centreIds.at(-1);
  const patient = await db.patient.findFirst({
    where: { organisationId, centreId: centreId ?? '' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (!appareil || !patient) {
    return;
  }
  const { count } = await db.appareil.updateMany({
    where: { id: appareil.id, statut: 'EN_STOCK' },
    data: { statut: 'PRET', patientId: patient.id },
  });
  if (count === 1) {
    const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
    await db.mouvementAppareil.create({
      data: {
        id: idFixe('b', appareils.length + 1),
        organisationId,
        appareilId: appareil.id,
        type: 'CHANGEMENT_STATUT',
        utilisateurId,
        statutAvant: 'EN_STOCK',
        statutApres: 'PRET',
        centreAvantId: appareil.centreId,
        centreApresId: appareil.centreId,
        patientId: patient.id,
        motif: chiffreur.chiffrer('Prêt de démonstration', 'mouvement_appareil.motif'),
      },
    });
  }
}

export async function seedStock(
  db: PrismaClient,
  organisationId: string,
  centreIds: readonly string[],
  utilisateurId: string,
): Promise<void> {
  const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
  const modeles = await db.modeleAideAuditive.findMany({
    where: { organisationId },
    select: { id: true, fabricantId: true },
    orderBy: { nom: 'asc' },
  });

  const appareils = centreIds.flatMap((centreId, c) =>
    Array.from({ length: APPAREILS_PAR_CENTRE }, (_, a) => {
      const rang = c * APPAREILS_PAR_CENTRE + a + 1;
      const modele = modeles[rang % modeles.length];
      if (!modele) {
        throw new Error('Le catalogue doit être amorcé avant le stock.');
      }
      return {
        id: idFixe('a', rang),
        organisationId,
        centreId,
        modeleId: modele.id,
        fabricantId: modele.fabricantId,
        numeroSerie: `DEMO${String(rang).padStart(6, '0')}`,
        dateReception: new Date('2026-10-01T00:00:00.000Z'),
        referenceBonLivraison: `BL-DEMO-${c + 1}`,
        prixAchatCentimes: a === 0 ? null : 60_000 + 5_000 * a,
        enConsignation: a === 0,
      };
    }),
  );
  // Sans mise à jour : un appareil déjà déplacé en démonstration garde son état.
  await db.appareil.createMany({ data: appareils, skipDuplicates: true });
  await db.mouvementAppareil.createMany({
    data: appareils.map((a, i) => ({
      id: idFixe('b', i + 1),
      organisationId,
      appareilId: a.id,
      type: 'RECEPTION' as const,
      utilisateurId,
      statutApres: 'EN_STOCK' as const,
      centreApresId: a.centreId,
    })),
    skipDuplicates: true,
  });
  await seedAppareilPrete(db, organisationId, centreIds, utilisateurId, appareils);

  for (const accessoire of ACCESSOIRES) {
    const donnees = { ...accessoire, organisationId };
    await db.accessoire.upsert({
      where: { id: accessoire.id },
      create: donnees,
      update: donnees,
    });
  }
  const lignes = centreIds.flatMap((centreId) =>
    ACCESSOIRES.map((a) => ({ centreId, accessoireId: a.id, quantite: 24 })),
  );
  await db.stockAccessoire.createMany({ data: lignes, skipDuplicates: true });
  await db.mouvementAccessoire.createMany({
    data: lignes.map((l, i) => ({
      ...l,
      id: idFixe('c', i + 1),
      organisationId,
      type: 'ENTREE' as const,
      quantiteApres: l.quantite,
      utilisateurId,
      motif: chiffreur.chiffrer('Stock initial de démonstration', CONTEXTE_MOTIF),
    })),
    skipDuplicates: true,
  });
}
