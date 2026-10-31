import {
  ajouterJours,
  jourSemaine,
  JOURS_SEMAINE,
  localDepuisInstant,
  instantSaisi,
  PARAMETRES_RESERVATION_DEFAUT,
  TYPES_RDV_DEFAUT,
  type HorairesOuverture,
  type JourSemaine,
} from '@ha/domain';

import type { PrismaClient } from '../src/generated/prisma/client';

// Agenda de démonstration : données fictives, dates relatives au jour du seed.

const JOURS_RDV = 14;

export interface OptionsAgenda {
  centres: readonly string[];
  centrePrincipal: string;
  praticiens: readonly { id: string; centreId: string; jours: readonly JourSemaine[] }[];
  horaires: HorairesOuverture;
  creePar: string;
}

export async function seedTypesRdv(db: PrismaClient, organisationId: string): Promise<void> {
  for (const type of TYPES_RDV_DEFAUT) {
    await db.typeRdv.upsert({
      where: { organisationId_nom: { organisationId, nom: type.nom } },
      create: { ...type, organisationId },
      update: {},
    });
  }
}

/** Instant de cette heure de Paris, à une date dont les heures de démonstration existent toujours. */
function instantParis(date: string, heure: string): Date {
  return new Date(instantSaisi(date, heure) ?? 0);
}

/** Cabines, horaires et deux semaines de rendez-vous. Rejoué sans purge, le seed heurterait l'exclusion. */
export async function seedAgenda(
  db: PrismaClient,
  organisationId: string,
  { centres, centrePrincipal, praticiens, horaires, creePar }: OptionsAgenda,
): Promise<void> {
  await seedTypesRdv(db, organisationId);
  await db.notification.deleteMany({ where: { organisationId } });
  await db.reservationEnLigne.deleteMany({ where: { organisationId } });
  await db.rendezVous.deleteMany({ where: { organisationId } });

  const cabines = new Map<string, string>();
  for (const centreId of centres) {
    for (const nom of ['Cabine 1', 'Cabine 2']) {
      const { id } = await db.cabine.upsert({
        where: { centreId_nom: { centreId, nom } },
        create: { centreId, nom },
        update: {},
      });
      if (nom === 'Cabine 1') {
        cabines.set(centreId, id);
      }
    }
  }

  for (const { id: praticienId, centreId, jours } of praticiens) {
    await db.praticienCentre.update({
      where: { praticienId_centreId: { praticienId, centreId } },
      data: {
        horaires: Object.fromEntries(
          JOURS_SEMAINE.map((jour) => [jour, jours.includes(jour) ? horaires[jour] : []]),
        ),
      },
    });
  }

  const types = await db.typeRdv.findMany({ where: { organisationId } });
  const type = (nom: string) => {
    const trouve = types.find((t) => t.nom === nom);
    if (!trouve) {
      throw new Error(`Type de rendez-vous manquant : ${nom}.`);
    }
    return trouve;
  };

  const patients = await db.patient.findMany({
    where: { organisationId, fusionneDansId: null },
    select: { id: true, centreId: true },
    orderBy: { id: 'asc' },
  });
  const patientsDe = (centreId: string) => patients.filter((p) => p.centreId === centreId);

  const aujourdhui = localDepuisInstant(Date.now()).date;
  for (let rang = 0; rang < JOURS_RDV; rang += 1) {
    const date = ajouterJours(aujourdhui, rang);
    const jour = jourSemaine(date);
    for (const { id: praticienId, centreId, jours } of praticiens) {
      if (!jours.includes(jour)) {
        continue;
      }
      const clientele = patientsDe(centreId);
      const bilan = type('Bilan');
      const suivi = type('Suivi');
      const creneaux = [
        { heure: '09:00', typeRdv: bilan, cabineId: cabines.get(centreId) ?? null, indice: rang },
        { heure: '10:30', typeRdv: suivi, cabineId: null, indice: rang + 1 },
      ];
      for (const { heure, typeRdv, cabineId, indice } of creneaux) {
        const patient = clientele[indice % clientele.length];
        // Une seule cabine par créneau : le premier praticien du centre la prend, l'autre reçoit sans.
        const dejaPrise =
          cabineId !== null &&
          (await db.rendezVous.count({
            where: { cabineId, debut: instantParis(date, heure) },
          })) > 0;
        const debut = instantParis(date, heure);
        await db.rendezVous.create({
          data: {
            centreId,
            typeRdvId: typeRdv.id,
            patientId: patient?.id ?? null,
            ...(patient ? {} : { prospectNom: 'Prospect Démo', prospectTelephone: '0600000000' }),
            praticienId,
            cabineId: dejaPrise ? null : cabineId,
            debut,
            fin: new Date(debut.getTime() + typeRdv.dureeMinutes * 60_000),
            statut: rang === 0 && heure === '09:00' ? 'CONFIRME' : 'PLANIFIE',
            origine: 'INTERNE',
            createdById: creePar,
          },
        });
      }
    }
  }

  // Un prospect aujourd'hui ou au prochain jour ouvert, pour montrer sa conversion à l'arrivée.
  const jourOuvert =
    jourSemaine(aujourdhui) === 'dimanche' ? ajouterJours(aujourdhui, 1) : aujourdhui;
  const debut = instantParis(jourOuvert, '11:30');
  await db.rendezVous.create({
    data: {
      centreId: centrePrincipal,
      typeRdvId: type('Dépistage').id,
      prospectNom: 'Prospect Démo',
      prospectTelephone: '0600000000',
      cabineId: cabines.get(centrePrincipal) ?? null,
      debut,
      fin: new Date(debut.getTime() + 30 * 60_000),
      origine: 'TELEPHONE',
      createdById: creePar,
    },
  });
}

/** Ouvre la réservation en ligne d'un centre de démonstration, avec les types réservables du client. */
export async function seedReservationEnLigne(
  db: PrismaClient,
  organisationId: string,
  centreId: string,
): Promise<void> {
  const reglages = { ...PARAMETRES_RESERVATION_DEFAUT, actif: true, delaiMinimalMinutes: 60 };
  await db.parametresReservation.upsert({
    where: { centreId },
    create: { ...reglages, organisationId, centreId },
    update: reglages,
  });
  const types = await db.typeRdv.findMany({
    where: { organisationId, reservableEnLigne: true },
    select: { id: true },
  });
  await db.typeRdvEnLigne.createMany({
    data: types.map(({ id }) => ({ organisationId, centreId, typeRdvId: id })),
    skipDuplicates: true,
  });
}
