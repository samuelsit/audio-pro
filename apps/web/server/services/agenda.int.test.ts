import { HORAIRES_VIDES, type HorairesOuverture } from '@ha/domain';
import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurConflitAgenda, ErreurSaisie, ressourcePerdue } from '../erreurs';
import {
  annulerRdv,
  changerStatutRdv,
  chercherCreneaux,
  creerRdv,
  deplacerRdv,
  ErreurRdvModifie,
  lireAgenda,
  lireRdv,
  lireSalleAttente,
  listerRdvDuPatient,
  marquerArrivee,
  modifierNotesRdv,
  prendreEnCharge,
  rattacherRdvDossier,
} from './agenda';
import { creerPatient, ErreurDoublonPossible, fusionnerPatients } from './patients';

// Dates lointaines : le lundi 7 janvier 2030 et ses voisins, en hiver.
const LUNDI = '2030-01-07';
const MARDI = '2030-01-08';

const HORAIRES: HorairesOuverture = {
  ...HORAIRES_VIDES,
  lundi: [
    { debut: '09:00', fin: '12:00' },
    { debut: '14:00', fin: '18:00' },
  ],
  mardi: [{ debut: '09:00', fin: '12:00' }],
};

const IDENTITE = {
  civilite: 'MME',
  nomNaissance: 'Fictif',
  prenoms: 'Alex',
  dateNaissance: '12/03/1950',
  sexe: 'FEMININ',
};

const PATIENT = {
  ...IDENTITE,
  consentementSms: false,
  consentementEmail: false,
  consentementCourrier: false,
  amoC2s: false,
  amoAld: false,
};

let d: JeuDeDonnees;
let typeBilan: string;
let typeSuivi: string;
let cabine1: string;
let cabine2: string;
let patientId: string;

function rdv(changements: Record<string, unknown> = {}) {
  return {
    centreId: d.centres.a.id,
    typeRdvId: typeSuivi,
    patientId,
    date: LUNDI,
    heure: '09:00',
    dureeMinutes: 30,
    praticienId: d.praticiens.praticienAB.id,
    origine: 'INTERNE',
    ...changements,
  };
}

const prospect = (changements: Record<string, unknown> = {}) =>
  rdv({
    patientId: '',
    prospectNom: 'Prospect Fictif',
    prospectTelephone: '0123456789',
    ...changements,
  });

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  const organisationId = d.organisation.id;
  const { praticienAB } = d.praticiens;
  await prisma().centre.update({
    where: { id: d.centres.a.id },
    data: { horairesOuverture: HORAIRES },
  });
  await prisma().praticienCentre.update({
    where: {
      praticienId_centreId: { praticienId: praticienAB.id, centreId: d.centres.a.id },
    },
    data: { horaires: HORAIRES },
  });
  const [bilan, suivi] = await Promise.all([
    prisma().typeRdv.create({
      data: {
        organisationId,
        nom: 'Bilan',
        dureeMinutes: 60,
        couleur: '#2563eb',
        requierePraticien: true,
        requiereCabine: true,
      },
    }),
    prisma().typeRdv.create({
      data: {
        organisationId,
        nom: 'Suivi',
        dureeMinutes: 30,
        couleur: '#ca8a04',
        requierePraticien: true,
        requiereCabine: false,
      },
    }),
  ]);
  typeBilan = bilan.id;
  typeSuivi = suivi.id;
  const c1 = await prisma().cabine.create({ data: { centreId: d.centres.a.id, nom: 'Cabine 1' } });
  const c2 = await prisma().cabine.create({ data: { centreId: d.centres.a.id, nom: 'Cabine 2' } });
  cabine1 = c1.id;
  cabine2 = c2.id;
  patientId = await creerPatient(d.acteurs.audioAB, { ...PATIENT, centreId: d.centres.a.id });
});

async function ligne(id: string) {
  return prisma().rendezVous.findUniqueOrThrow({ where: { id } });
}

function evenements(type: string) {
  return prisma().evenementDomaine.findMany({ where: { type } });
}

function journal(entiteId: string) {
  return prisma().journalAudit.findMany({ where: { entiteId }, orderBy: { horodatage: 'asc' } });
}

async function refus(promesse: Promise<unknown>): Promise<ErreurConflitAgenda> {
  const erreur: unknown = await promesse.catch((e: unknown) => e);
  expect(erreur).toBeInstanceOf(ErreurConflitAgenda);
  return erreur as ErreurConflitAgenda;
}

describe('creerRdv', () => {
  it('crée, journalise et publie l’événement', async () => {
    const id = await creerRdv(d.acteurs.assistantA, rdv({ notes: 'Note fictive' }));
    const cree = await ligne(id);
    expect(cree).toMatchObject({ statut: 'PLANIFIE', version: 1, cabineId: null });
    expect(cree.debut.toISOString()).toBe('2030-01-07T08:00:00.000Z');
    expect(cree.fin.toISOString()).toBe('2030-01-07T08:30:00.000Z');
    expect(cree.notes).toMatch(/^v1\./);
    const [ligneJournal] = await journal(id);
    expect(ligneJournal).toMatchObject({ action: 'CREATE', entiteType: 'RENDEZ_VOUS', patientId });
    const [evenement] = await evenements('RDV_CREE');
    expect(evenement?.agregatId).toBe(id);
    expect(evenement?.charge).toMatchObject({ rendezVousId: id, patientId, dossierId: null });
    expect(JSON.stringify(evenement?.charge)).not.toContain('Fictif');
  });

  it('choisit une cabine libre pour un type qui en requiert une', async () => {
    const premier = await creerRdv(
      d.acteurs.audioAB,
      rdv({ typeRdvId: typeBilan, dureeMinutes: 60 }),
    );
    expect((await ligne(premier)).cabineId).toBe(cabine1);
    await prisma().rendezVous.update({
      where: { id: premier },
      data: { praticienId: null },
    });
    const second = await creerRdv(
      d.acteurs.audioAB,
      rdv({ typeRdvId: typeBilan, dureeMinutes: 60 }),
    );
    expect((await ligne(second)).cabineId).toBe(cabine2);
  });

  it('refuse un praticien déjà pris, même sur un autre centre', async () => {
    await creerRdv(d.acteurs.audioAB, rdv());
    await prisma().praticienCentre.update({
      where: {
        praticienId_centreId: {
          praticienId: d.praticiens.praticienAB.id,
          centreId: d.centres.b.id,
        },
      },
      data: { horaires: HORAIRES },
    });
    const erreur = await refus(
      creerRdv(
        d.acteurs.audioAB,
        rdv({ centreId: d.centres.b.id, confirmerHorsDisponibilites: true }),
      ),
    );
    expect(erreur.codes).toContain('PRATICIEN_PRIS');
    expect(erreur.confirmable).toBe(false);
  });

  it('un RDV bout à bout passe', async () => {
    await creerRdv(d.acteurs.audioAB, rdv());
    await expect(creerRdv(d.acteurs.audioAB, rdv({ heure: '09:30' }))).resolves.toBeTruthy();
  });

  it('hors disponibilités : confirmable, tracé, jamais en ligne', async () => {
    const soir = rdv({ heure: '20:00' });
    const erreur = await refus(creerRdv(d.acteurs.audioAB, soir));
    expect(erreur.codes).toEqual(['HORS_DISPONIBILITES']);
    expect(erreur.confirmable).toBe(true);
    const id = await creerRdv(d.acteurs.audioAB, { ...soir, confirmerHorsDisponibilites: true });
    const [ligneJournal] = await journal(id);
    expect(ligneJournal?.details).toEqual({ conflitsConfirmes: ['HORS_DISPONIBILITES'] });
    await refus(
      creerRdv(d.acteurs.audioAB, {
        ...soir,
        heure: '21:00',
        origine: 'EN_LIGNE',
        confirmerHorsDisponibilites: true,
      }),
    );
  });

  it('une heure inexistante au changement d’heure est refusée', async () => {
    await expect(
      creerRdv(d.acteurs.audioAB, rdv({ date: '2030-03-31', heure: '02:30' })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('deux réservations simultanées : un seul gagnant, sur le verdict de la base', async () => {
    const resultats = await Promise.allSettled(
      Array.from({ length: 4 }, () => creerRdv(d.acteurs.audioAB, rdv())),
    );
    const gagnants = resultats.filter((r) => r.status === 'fulfilled');
    const perdants = resultats.filter((r) => r.status === 'rejected');
    expect(gagnants).toHaveLength(1);
    expect(perdants).toHaveLength(3);
    for (const perdant of perdants) {
      expect(perdant.reason).toBeInstanceOf(ErreurConflitAgenda);
    }
    expect(await prisma().rendezVous.count()).toBe(1);
    expect(await evenements('RDV_CREE')).toHaveLength(1);
  });

  it('la base refuse seule une double réservation, et sa réponse se traduit', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv({ typeRdvId: typeBilan, dureeMinutes: 60 }));
    const existant = await ligne(id);
    const doublon = (ressource: { praticienId?: string | null; cabineId?: string | null }) =>
      prisma().rendezVous.create({
        data: {
          centreId: existant.centreId,
          typeRdvId: existant.typeRdvId,
          patientId,
          debut: existant.debut,
          fin: existant.fin,
          origine: 'INTERNE',
          createdById: existant.createdById,
          ...ressource,
        },
      });
    const surPraticien: unknown = await doublon({ praticienId: existant.praticienId }).catch(
      (e: unknown) => e,
    );
    expect(ressourcePerdue(surPraticien)).toBe('PRATICIEN_PRIS');
    const surCabine: unknown = await doublon({ cabineId: existant.cabineId }).catch(
      (e: unknown) => e,
    );
    expect(ressourcePerdue(surCabine)).toBe('CABINE_PRISE');
    expect(ressourcePerdue(new Error('autre'))).toBeNull();
  });

  it('refuse les références invalides', async () => {
    const { audioAB } = d.acteurs;
    await expect(creerRdv(audioAB, rdv({ typeRdvId: 'inconnu' }))).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(creerRdv(audioAB, rdv({ praticienId: '' }))).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(creerRdv(audioAB, rdv({ dossierId: 'inconnu' }))).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(
      creerRdv(audioAB, rdv({ praticienId: d.praticiens.praticienC.id })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(creerRdv(audioAB, rdv({ cabineId: 'inconnue' }))).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(creerRdv(audioAB, rdv({ patientId: 'inconnu' }))).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('une exception annule les disponibilités', async () => {
    await prisma().exceptionAgenda.create({
      data: {
        organisationId: d.organisation.id,
        type: 'FERMETURE_CENTRE',
        centreId: d.centres.a.id,
        debut: new Date('2030-01-07T00:00:00+01:00'),
        fin: new Date('2030-01-08T00:00:00+01:00'),
        createdById: d.utilisateurs.admin.id,
      },
    });
    expect((await refus(creerRdv(d.acteurs.audioAB, rdv()))).codes).toEqual(['CENTRE_FERME']);
  });
});

describe('cloisonnement par centre', () => {
  it('un assistant ne réserve pas sur un centre hors de son périmètre', async () => {
    await expect(creerRdv(d.acteurs.assistantB, rdv())).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('un assistant ne réserve pas pour un patient hors de son périmètre', async () => {
    const patientB = await creerPatient(d.acteurs.audioAB, {
      ...PATIENT,
      nomNaissance: 'Autre',
      centreId: d.centres.b.id,
    });
    await expect(
      creerRdv(d.acteurs.assistantA, rdv({ patientId: patientB })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('un RDV sur mon centre affiche le patient rattaché ailleurs, sans lien vers sa fiche', async () => {
    const patientB = await creerPatient(d.acteurs.audioAB, {
      ...PATIENT,
      nomNaissance: 'Rattachéb',
      centreId: d.centres.b.id,
    });
    await creerRdv(d.acteurs.audioAB, rdv({ patientId: patientB }));
    const { rdv: lignes } = await lireAgenda(d.acteurs.assistantA, d.centres.a.id, LUNDI, LUNDI);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ nom: 'Rattachéb Alex', ficheAccessible: false });
  });

  it('refuse lecture et écriture hors périmètre', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    const { assistantB } = d.acteurs;
    await expect(lireRdv(assistantB, id)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(annulerRdv(assistantB, id, 1)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(lireAgenda(assistantB, d.centres.a.id, LUNDI, LUNDI)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(lireSalleAttente(assistantB, d.centres.a.id, LUNDI)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('deplacerRdv', () => {
  it('déplace, publie l’ancien et le nouvel horaire', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await deplacerRdv(d.acteurs.audioAB, id, {
      version: 1,
      date: MARDI,
      heure: '10:00',
      dureeMinutes: 45,
    });
    const deplace = await ligne(id);
    expect(deplace.debut.toISOString()).toBe('2030-01-08T09:00:00.000Z');
    expect(deplace.fin.toISOString()).toBe('2030-01-08T09:45:00.000Z');
    expect(deplace.version).toBe(2);
    const [evenement] = await evenements('RDV_DEPLACE');
    expect(evenement?.charge).toMatchObject({
      debut: '2030-01-08T09:00:00.000Z',
      ancienDebut: '2030-01-07T08:00:00.000Z',
      ancienFin: '2030-01-07T08:30:00.000Z',
    });
  });

  it('un redimensionnement sur lui-même n’est pas son propre conflit', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await deplacerRdv(d.acteurs.audioAB, id, {
      version: 1,
      date: LUNDI,
      heure: '09:00',
      dureeMinutes: 60,
    });
    expect((await ligne(id)).fin.toISOString()).toBe('2030-01-07T09:00:00.000Z');
  });

  it('refuse un créneau pris et ne publie rien', async () => {
    await creerRdv(d.acteurs.audioAB, rdv({ heure: '10:00' }));
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await refus(
      deplacerRdv(d.acteurs.audioAB, id, {
        version: 1,
        date: LUNDI,
        heure: '10:00',
        dureeMinutes: 30,
      }),
    );
    expect(await evenements('RDV_DEPLACE')).toHaveLength(0);
    expect((await ligne(id)).version).toBe(1);
  });

  it('la cabine prise bascule sur une autre, sinon conflit', async () => {
    const autre = await creerRdv(
      d.acteurs.audioAB,
      rdv({ typeRdvId: typeBilan, dureeMinutes: 60, heure: '10:00' }),
    );
    expect((await ligne(autre)).cabineId).toBe(cabine1);
    await prisma().rendezVous.update({ where: { id: autre }, data: { praticienId: null } });
    const id = await creerRdv(d.acteurs.audioAB, rdv({ typeRdvId: typeBilan, dureeMinutes: 60 }));
    expect((await ligne(id)).cabineId).toBe(cabine1);
    await deplacerRdv(d.acteurs.audioAB, id, {
      version: 1,
      date: LUNDI,
      heure: '10:00',
      dureeMinutes: 60,
    });
    expect((await ligne(id)).cabineId).toBe(cabine2);
    await prisma().cabine.update({ where: { id: cabine2 }, data: { actif: false } });
    const nouveau = await refus(
      creerRdv(d.acteurs.audioAB, rdv({ typeRdvId: typeBilan, dureeMinutes: 60, heure: '10:15' })),
    );
    expect(nouveau.codes).toEqual(['CABINE_PRISE']);
  });

  it('un RDV arrivé ne se déplace plus', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await marquerArrivee(d.acteurs.audioAB, id, { version: 1 });
    await expect(
      deplacerRdv(d.acteurs.audioAB, id, {
        version: 2,
        date: LUNDI,
        heure: '10:00',
        dureeMinutes: 30,
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});

describe('version périmée', () => {
  it.each([
    [
      'déplacement',
      (id: string) =>
        deplacerRdv(d.acteurs.audioAB, id, {
          version: 1,
          date: LUNDI,
          heure: '11:00',
          dureeMinutes: 30,
        }),
    ],
    [
      'statut',
      (id: string) => changerStatutRdv(d.acteurs.audioAB, id, { version: 1, statut: 'ABSENT' }),
    ],
    ['annulation', (id: string) => annulerRdv(d.acteurs.audioAB, id, 1)],
    ['arrivée', (id: string) => marquerArrivee(d.acteurs.audioAB, id, { version: 1 })],
    [
      'notes',
      (id: string) => modifierNotesRdv(d.acteurs.audioAB, id, { version: 1, notes: 'Note' }),
    ],
  ])('%s refusé après une autre écriture', async (_, ecriture) => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await changerStatutRdv(d.acteurs.audioAB, id, { version: 1, statut: 'CONFIRME' });
    await expect(ecriture(id)).rejects.toBeInstanceOf(ErreurRdvModifie);
    expect((await ligne(id)).statut).toBe('CONFIRME');
  });
});

describe('statuts', () => {
  it('parcours complet : confirmé, arrivé, en cours, vu', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await changerStatutRdv(d.acteurs.audioAB, id, { version: 1, statut: 'CONFIRME' });
    await marquerArrivee(d.acteurs.audioAB, id, { version: 2 });
    const salle = () => lireSalleAttente(d.acteurs.assistantA, d.centres.a.id, LUNDI);
    expect((await salle()).ARRIVE.map((r) => r.id)).toEqual([id]);
    await prendreEnCharge(d.acteurs.audioAB, id, 3);
    expect((await salle()).EN_COURS.map((r) => r.id)).toEqual([id]);
    await expect(prendreEnCharge(d.acteurs.audioAB, id, 4)).rejects.toBeInstanceOf(ErreurSaisie);
    await changerStatutRdv(d.acteurs.audioAB, id, { version: 4, statut: 'VU' });
    expect((await salle()).TERMINE.map((r) => r.id)).toEqual([id]);
    const fin = await ligne(id);
    expect(fin.arriveLe).not.toBeNull();
    expect(fin.termineLe).not.toBeNull();
  });

  it('VU direct depuis ARRIVE renseigne la prise en charge', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await marquerArrivee(d.acteurs.audioAB, id, { version: 1 });
    await changerStatutRdv(d.acteurs.audioAB, id, { version: 2, statut: 'VU' });
    expect((await ligne(id)).priseEnChargeLe).not.toBeNull();
  });

  it('refuse une transition impossible', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await expect(
      changerStatutRdv(d.acteurs.audioAB, id, { version: 1, statut: 'VU' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('annuler libère le créneau et publie', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await annulerRdv(d.acteurs.audioAB, id, 1);
    await expect(creerRdv(d.acteurs.audioAB, rdv())).resolves.toBeTruthy();
    expect(await evenements('RDV_ANNULE')).toHaveLength(1);
    await expect(annulerRdv(d.acteurs.audioAB, id, 2)).rejects.toBeInstanceOf(ErreurSaisie);
    const { rdv: lignes } = await lireAgenda(d.acteurs.audioAB, d.centres.a.id, LUNDI, LUNDI);
    expect(lignes).toHaveLength(1);
  });

  it('ABSENT libère le créneau ; ABSENT → ARRIVE sauf si le créneau est repris', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await changerStatutRdv(d.acteurs.audioAB, id, { version: 1, statut: 'ABSENT' });
    await marquerArrivee(d.acteurs.audioAB, id, { version: 2 });
    expect((await ligne(id)).statut).toBe('ARRIVE');

    const autre = await creerRdv(d.acteurs.audioAB, rdv({ heure: '10:00' }));
    await changerStatutRdv(d.acteurs.audioAB, autre, { version: 1, statut: 'ABSENT' });
    await creerRdv(d.acteurs.audioAB, rdv({ heure: '10:00' }));
    const erreur = await refus(marquerArrivee(d.acteurs.audioAB, autre, { version: 2 }));
    expect(erreur.message).toContain('repris');
    expect((await ligne(autre)).statut).toBe('ABSENT');
  });

  it('un RDV annulé ne repasse pas arrivé', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await annulerRdv(d.acteurs.audioAB, id, 1);
    await expect(marquerArrivee(d.acteurs.audioAB, id, { version: 2 })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });
});

describe('arrivée d’un prospect', () => {
  it('crée la fiche dans la même transaction et journalise les deux lignes', async () => {
    const id = await creerRdv(d.acteurs.assistantA, prospect());
    await marquerArrivee(d.acteurs.assistantA, id, {
      version: 1,
      prospect: { mode: 'NOUVEAU', ...IDENTITE, nomNaissance: 'Nouveau' },
    });
    const arrive = await ligne(id);
    expect(arrive).toMatchObject({
      statut: 'ARRIVE',
      prospectNom: null,
      prospectTelephone: null,
    });
    const fiche = await prisma().patient.findUniqueOrThrow({
      where: { id: arrive.patientId ?? '' },
    });
    expect(fiche).toMatchObject({
      nomNaissance: 'Nouveau',
      telephone: '0123456789',
      centreId: d.centres.a.id,
    });
    expect(await prisma().journalAudit.count({ where: { entiteId: fiche.id } })).toBe(1);
  });

  it('exige une identité', async () => {
    const id = await creerRdv(d.acteurs.assistantA, prospect());
    await expect(marquerArrivee(d.acteurs.assistantA, id, { version: 1 })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('s’arrête sur un doublon, puis relie la fiche existante', async () => {
    const id = await creerRdv(d.acteurs.assistantA, prospect());
    const nouveau = { mode: 'NOUVEAU', ...IDENTITE };
    await expect(
      marquerArrivee(d.acteurs.assistantA, id, { version: 1, prospect: nouveau }),
    ).rejects.toBeInstanceOf(ErreurDoublonPossible);
    expect(await prisma().patient.count()).toBe(1);
    await marquerArrivee(d.acteurs.assistantA, id, {
      version: 1,
      prospect: { mode: 'EXISTANT', patientId },
    });
    expect((await ligne(id)).patientId).toBe(patientId);
  });

  it('une version périmée n’écrit pas de fiche', async () => {
    const id = await creerRdv(d.acteurs.assistantA, prospect());
    await modifierNotesRdv(d.acteurs.assistantA, id, { version: 1, notes: 'Note' });
    await expect(
      marquerArrivee(d.acteurs.assistantA, id, {
        version: 1,
        prospect: { mode: 'NOUVEAU', ...IDENTITE, nomNaissance: 'Perdu' },
      }),
    ).rejects.toBeInstanceOf(ErreurRdvModifie);
    expect(await prisma().patient.count({ where: { nomNaissance: 'Perdu' } })).toBe(0);
  });

  it('un prospect ne peut pas être marqué vu sans patient, même par la base', async () => {
    const id = await creerRdv(d.acteurs.assistantA, prospect());
    await expect(
      prisma().rendezVous.update({ where: { id }, data: { statut: 'VU' } }),
    ).rejects.toThrow();
  });
});

describe('lectures', () => {
  it('lireRdv déchiffre les notes et écrit un READ ; la grille ne les charge pas', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv({ notes: 'Note fictive' }));
    const detail = await lireRdv(d.acteurs.audioAB, id);
    expect(detail.notes).toBe('Note fictive');
    const lignes = await journal(id);
    expect(lignes.map((l) => l.action)).toEqual(['CREATE', 'READ']);
    const { rdv: grille } = await lireAgenda(d.acteurs.audioAB, d.centres.a.id, LUNDI, LUNDI);
    expect(JSON.stringify(grille)).not.toContain('Note fictive');
    expect((await journal(id)).map((l) => l.action)).toEqual(['CREATE', 'READ']);
  });

  it('les notes ne vont pas dans le journal', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    await modifierNotesRdv(d.acteurs.audioAB, id, { version: 1, notes: 'Secret fictif' });
    expect(JSON.stringify(await journal(id))).not.toContain('Secret fictif');
    expect((await lireRdv(d.acteurs.audioAB, id)).notes).toBe('Secret fictif');
  });

  it('lireAgenda donne les colonnes, les plages et les occupations ailleurs', async () => {
    await creerRdv(
      d.acteurs.audioAB,
      rdv({ centreId: d.centres.b.id, heure: '15:00', confirmerHorsDisponibilites: true }),
    );
    const agenda = await lireAgenda(d.acteurs.audioAB, d.centres.a.id, LUNDI, MARDI);
    expect(agenda.praticiens.map((p) => p.id)).toEqual([d.praticiens.praticienAB.id]);
    expect(agenda.cabines.map((c) => c.nom)).toEqual(['Cabine 1', 'Cabine 2']);
    expect(agenda.plages[`${d.praticiens.praticienAB.id}:${LUNDI}`]).toHaveLength(2);
    expect(agenda.plages[`${d.praticiens.praticienAB.id}:${MARDI}`]).toHaveLength(1);
    expect(agenda.ouverture[LUNDI]).toHaveLength(2);
    expect(agenda.occupationsAilleurs).toHaveLength(1);
    expect(agenda.rdv).toHaveLength(0);
  });

  it('un prospect s’affiche sous son nom', async () => {
    await creerRdv(d.acteurs.audioAB, prospect());
    const { rdv: lignes } = await lireAgenda(d.acteurs.audioAB, d.centres.a.id, LUNDI, LUNDI);
    expect(lignes[0]).toMatchObject({
      nom: 'Prospect Fictif',
      telephone: '0123456789',
      patientId: null,
      ficheAccessible: false,
    });
  });

  it('la fiche patient liste ses RDV dans le périmètre', async () => {
    await creerRdv(d.acteurs.audioAB, rdv());
    const lignes = await listerRdvDuPatient(d.acteurs.assistantA, patientId);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ type: 'Suivi', centre: 'Centre A' });
    expect(await listerRdvDuPatient(d.acteurs.assistantB, patientId)).toEqual([]);
  });

  it('la salle d’attente garde les attendus à part', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    const salle = await lireSalleAttente(d.acteurs.audioAB, d.centres.a.id, LUNDI);
    expect(salle.attendus.map((r) => r.id)).toEqual([id]);
  });
});

describe('chercherCreneaux', () => {
  const recherche = (changements: Record<string, unknown> = {}) => ({
    centreId: d.centres.a.id,
    typeRdvId: typeSuivi,
    praticienId: '',
    depuis: LUNDI,
    ...changements,
  });

  it('saute un RDV existant', async () => {
    await creerRdv(d.acteurs.audioAB, rdv());
    const [premier] = await chercherCreneaux(d.acteurs.assistantA, recherche());
    expect(premier).toMatchObject({
      date: LUNDI,
      heure: '09:30',
      praticien: 'Audioab Test',
    });
  });

  it('tient compte d’un RDV sur un autre centre', async () => {
    await creerRdv(
      d.acteurs.audioAB,
      rdv({ centreId: d.centres.b.id, dureeMinutes: 180, confirmerHorsDisponibilites: true }),
    );
    const [premier] = await chercherCreneaux(d.acteurs.assistantA, recherche());
    expect(premier).toMatchObject({ date: LUNDI, heure: '14:00' });
  });

  it('propose une cabine libre', async () => {
    const [premier] = await chercherCreneaux(
      d.acteurs.assistantA,
      recherche({ typeRdvId: typeBilan }),
    );
    expect(premier).toMatchObject({ heure: '09:00', cabineId: cabine1 });
  });

  it('refuse un type ou un praticien inconnus, et un centre hors périmètre', async () => {
    const { assistantA, assistantB } = d.acteurs;
    await expect(
      chercherCreneaux(assistantA, recherche({ typeRdvId: 'x' })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      chercherCreneaux(assistantA, recherche({ praticienId: d.praticiens.praticienC.id })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(chercherCreneaux(assistantB, recherche())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('fusion de patients', () => {
  it('les RDV suivent la fiche conservée', async () => {
    const doublon = await creerPatient(
      d.acteurs.audioAB,
      { ...PATIENT, centreId: d.centres.a.id },
      { confirmerDoublon: true },
    );
    const id = await creerRdv(d.acteurs.audioAB, rdv({ patientId: doublon }));
    await fusionnerPatients(d.acteurs.admin, patientId, doublon, {});
    expect((await ligne(id)).patientId).toBe(patientId);
  });
});

describe('rattachement à un dossier', () => {
  async function creerDossierFictif(patient: string): Promise<string> {
    const dossier = await prisma().dossier.create({
      data: {
        organisationId: d.organisation.id,
        patientId: patient,
        centreId: d.centres.a.id,
        praticienId: d.praticiens.praticienAB.id,
        oreilles: 'DROITE',
        typeDroite: 'PRIMO',
        dateOuverture: new Date('2030-01-02T00:00:00.000Z'),
        surdicecite: 'v1.fictif',
      },
    });
    return dossier.id;
  }

  it('rattache un rendez-vous, une seule fois', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    const dossierId = await creerDossierFictif(patientId);
    await rattacherRdvDossier(d.acteurs.audioAB, id, { version: 1, dossierId });
    expect(await ligne(id)).toMatchObject({ dossierId, version: 2 });
    await expect(
      rattacherRdvDossier(d.acteurs.audioAB, id, { version: 2, dossierId }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('refuse le dossier d’un autre patient et une version périmée', async () => {
    const id = await creerRdv(d.acteurs.audioAB, rdv());
    const autre = await creerPatient(d.acteurs.audioAB, {
      ...PATIENT,
      centreId: d.centres.a.id,
      nomNaissance: 'Autre',
    });
    const dossierAutre = await creerDossierFictif(autre);
    await expect(
      rattacherRdvDossier(d.acteurs.audioAB, id, { version: 1, dossierId: dossierAutre }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    const dossierId = await creerDossierFictif(patientId);
    await expect(
      rattacherRdvDossier(d.acteurs.audioAB, id, { version: 9, dossierId }),
    ).rejects.toBeInstanceOf(ErreurRdvModifie);
  });
});
