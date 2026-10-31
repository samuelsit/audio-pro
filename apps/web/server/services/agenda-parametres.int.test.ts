import { HORAIRES_VIDES, TYPES_RDV_DEFAUT } from '@ha/domain';
import { prisma } from '@ha/db/admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, creerResponsable, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { creerRdv, lireAgenda } from './agenda';
import {
  changerActivationCabine,
  changerActivationTypeRdv,
  creerCabine,
  creerException,
  creerTypeRdv,
  listerCabines,
  listerExceptions,
  listerHorairesPraticiens,
  listerTypesRdv,
  modifierHorairesPraticien,
  modifierTypeRdv,
  supprimerException,
} from './agenda-parametres';

const TYPE = TYPES_RDV_DEFAUT[4] as (typeof TYPES_RDV_DEFAUT)[number];
const LUNDI = '2030-01-07';
const MATIN = { ...HORAIRES_VIDES, lundi: [{ debut: '09:00', fin: '12:00' }] };

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

describe('cabines', () => {
  it('le responsable en crée, sans doublon de nom, et journalise', async () => {
    const responsable = await creerResponsable(d);
    const id = await creerCabine(responsable, { centreId: d.centres.a.id, nom: 'Cabine 1' });
    expect(await prisma().journalAudit.count({ where: { entiteId: id } })).toBe(1);
    await expect(
      creerCabine(responsable, { centreId: d.centres.a.id, nom: 'Cabine 1' }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await changerActivationCabine(responsable, id, false);
    expect(await listerCabines(responsable, d.centres.a.id)).toEqual([
      { id, nom: 'Cabine 1', actif: false },
    ]);
  });

  it('interdite à un AUDIO et hors périmètre', async () => {
    const saisie = { centreId: d.centres.a.id, nom: 'Cabine' };
    await expect(creerCabine(d.acteurs.audioAB, saisie)).rejects.toBeInstanceOf(AccesRefuseError);
    const responsable = await creerResponsable(d);
    await expect(
      creerCabine(responsable, { ...saisie, centreId: d.centres.c.id }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(changerActivationCabine(responsable, 'inconnue', false)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('types de rendez-vous', () => {
  it('réservés à l’ADMIN_CLIENT', async () => {
    const responsable = await creerResponsable(d);
    await expect(creerTypeRdv(responsable, TYPE)).rejects.toBeInstanceOf(AccesRefuseError);
    const id = await creerTypeRdv(d.acteurs.admin, TYPE);
    await expect(modifierTypeRdv(d.acteurs.audioAB, id, TYPE)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await modifierTypeRdv(d.acteurs.admin, id, { ...TYPE, dureeMinutes: 45 });
    await changerActivationTypeRdv(d.acteurs.admin, id, false);
    const [type] = await listerTypesRdv(d.acteurs.audioAB);
    expect(type).toMatchObject({ dureeMinutes: 45, actif: false });
  });

  it('refuse un doublon de nom et un identifiant inconnu', async () => {
    await creerTypeRdv(d.acteurs.admin, TYPE);
    await expect(creerTypeRdv(d.acteurs.admin, TYPE)).rejects.toBeInstanceOf(ErreurSaisie);
    const autre = await creerTypeRdv(d.acteurs.admin, { ...TYPE, nom: 'Autre' });
    await expect(modifierTypeRdv(d.acteurs.admin, autre, TYPE)).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(modifierTypeRdv(d.acteurs.admin, 'inconnu', TYPE)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(changerActivationTypeRdv(d.acteurs.admin, 'inconnu', true)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('horaires des praticiens', () => {
  it('enregistre et relit, sans perdre les horaires à la modification du praticien', async () => {
    const praticienId = d.praticiens.praticienAB.id;
    await modifierHorairesPraticien(d.acteurs.admin, praticienId, d.centres.a.id, MATIN);
    const [ligne] = await listerHorairesPraticiens(d.acteurs.admin, d.centres.a.id);
    expect(ligne?.horaires.lundi).toEqual(MATIN.lundi);
  });

  it('refuse deux centres à la même heure', async () => {
    const praticienId = d.praticiens.praticienAB.id;
    await modifierHorairesPraticien(d.acteurs.admin, praticienId, d.centres.a.id, MATIN);
    await expect(
      modifierHorairesPraticien(d.acteurs.admin, praticienId, d.centres.b.id, MATIN),
    ).rejects.toThrow('Lundi : ce praticien est déjà attendu sur un autre centre.');
    await modifierHorairesPraticien(d.acteurs.admin, praticienId, d.centres.b.id, {
      ...HORAIRES_VIDES,
      lundi: [{ debut: '14:00', fin: '18:00' }],
    });
  });

  it('refuse un praticien qui n’exerce pas dans ce centre et un AUDIO', async () => {
    await expect(
      modifierHorairesPraticien(d.acteurs.admin, d.praticiens.praticienC.id, d.centres.a.id, MATIN),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(
      modifierHorairesPraticien(
        d.acteurs.audioAB,
        d.praticiens.praticienAB.id,
        d.centres.a.id,
        MATIN,
      ),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });
});

describe('exceptions', () => {
  it('un congé couvre des journées entières et vaut sur tous les centres', async () => {
    const praticienId = d.praticiens.praticienAB.id;
    await modifierHorairesPraticien(d.acteurs.admin, praticienId, d.centres.a.id, MATIN);
    const id = await creerException(d.acteurs.admin, d.centres.a.id, {
      type: 'CONGE',
      praticienId,
      centreId: d.centres.a.id,
      du: LUNDI,
      au: LUNDI,
    });
    const exception = await prisma().exceptionAgenda.findUniqueOrThrow({ where: { id } });
    expect(exception.centreId).toBeNull();
    expect(exception.debut.toISOString()).toBe('2030-01-06T23:00:00.000Z');
    expect(exception.fin.toISOString()).toBe('2030-01-07T23:00:00.000Z');
    const { plages } = await lireAgenda(d.acteurs.admin, d.centres.a.id, LUNDI, LUNDI);
    expect(plages[`${praticienId}:${LUNDI}`]).toEqual([]);
    expect(await listerExceptions(d.acteurs.admin, d.centres.b.id, LUNDI)).toHaveLength(1);
  });

  it('une exception à heures garde ses heures et se supprime', async () => {
    const id = await creerException(d.acteurs.admin, d.centres.a.id, {
      type: 'FERMETURE_CENTRE',
      centreId: d.centres.a.id,
      du: LUNDI,
      au: LUNDI,
      heureDebut: '14:00',
      heureFin: '16:00',
    });
    const [ligne] = await listerExceptions(d.acteurs.admin, d.centres.a.id, LUNDI);
    expect(ligne?.debut).toBe(Date.parse('2030-01-07T13:00:00.000Z'));
    expect(await listerExceptions(d.acteurs.admin, d.centres.c.id, LUNDI)).toEqual([]);
    await expect(supprimerException(d.acteurs.admin, d.centres.c.id, id)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await supprimerException(d.acteurs.admin, d.centres.a.id, id);
    expect(await prisma().exceptionAgenda.count()).toBe(0);
  });

  it('refuse les cibles hors du centre, et les rôles sans gestion', async () => {
    const { admin, audioAB } = d.acteurs;
    const base = { du: LUNDI, au: LUNDI };
    await expect(
      creerException(admin, d.centres.a.id, {
        ...base,
        type: 'CONGE',
        praticienId: d.praticiens.praticienC.id,
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      creerException(admin, d.centres.a.id, {
        ...base,
        type: 'INDISPONIBILITE',
        cabineId: 'inconnue',
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    await expect(
      creerException(audioAB, d.centres.a.id, {
        ...base,
        type: 'FERMETURE_CENTRE',
        centreId: d.centres.a.id,
      }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('une cabine indisponible se note par cabine', async () => {
    const cabineId = await creerCabine(d.acteurs.admin, { centreId: d.centres.a.id, nom: 'C' });
    await creerException(d.acteurs.admin, d.centres.a.id, {
      type: 'INDISPONIBILITE',
      cabineId,
      du: LUNDI,
      au: LUNDI,
    });
    const [ligne] = await listerExceptions(d.acteurs.admin, d.centres.a.id, LUNDI);
    expect(ligne?.cabine).toBe('C');
  });
});

describe('praticien retiré d’un centre', () => {
  it('refusé tant qu’il y a des rendez-vous à venir', async () => {
    const type = await prisma().typeRdv.create({
      data: { ...TYPE, organisationId: d.organisation.id },
    });
    await creerRdv(d.acteurs.audioAB, {
      centreId: d.centres.b.id,
      typeRdvId: type.id,
      prospectNom: 'Prospect',
      prospectTelephone: '0123456789',
      date: LUNDI,
      heure: '09:00',
      dureeMinutes: 30,
      praticienId: d.praticiens.praticienAB.id,
      origine: 'INTERNE',
      confirmerHorsDisponibilites: true,
    });
    const { modifierPraticien } = await import('./praticiens');
    await expect(
      modifierPraticien(d.acteurs.admin, d.praticiens.praticienAB.id, {
        rpps: d.praticiens.praticienAB.rpps,
        adeli: '',
        centreIds: [d.centres.a.id],
      }),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });
});
