import path from 'node:path';

import { prisma } from '@ha/db/admin';
import { ajouterJours, ajouterMois, HORAIRES_VIDES } from '@ha/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { creerCatalogueDevis, identifierCentreA, type CatalogueDevis } from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner } from '@/test/facturation';
import { appareilVendu } from '@/test/sav';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { importerLpp } from '../lpp/importer';
import { annulerRdv } from './agenda';
import { emettreAvoir } from './avoirs';
import { enregistrerParametresSav } from './garanties';
import { aujourdhui } from './patients';
import {
  controlesDuPatient,
  creneauxPourControle,
  ignorerControle,
  listerControles,
  planifierControle,
} from './suivi';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const PERIMETRE_TOUS = { type: 'tous' } as const;

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;
let typeSuivi: string;

const HORAIRES = {
  ...HORAIRES_VIDES,
  ...Object.fromEntries(
    ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'].map((jour) => [
      jour,
      [{ debut: '09:00', fin: '12:00' }],
    ]),
  ),
};

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(d.centres.a.id, catalogue.piles, 100);
  await prisma().centre.update({
    where: { id: d.centres.a.id },
    data: { horairesOuverture: HORAIRES },
  });
  await prisma().praticienCentre.update({
    where: {
      praticienId_centreId: { praticienId: d.praticiens.praticienAB.id, centreId: d.centres.a.id },
    },
    data: { horaires: HORAIRES },
  });
  ({ id: typeSuivi } = await prisma().typeRdv.upsert({
    where: { organisationId_nom: { organisationId: d.organisation.id, nom: 'Suivi' } },
    create: {
      organisationId: d.organisation.id,
      nom: 'Suivi',
      dureeMinutes: 30,
      couleur: '#ca8a04',
      requierePraticien: true,
      requiereCabine: false,
    },
    update: {},
  }));
});

/** Vente, puis délivrance reculée de `mois` : le contrôle du 3e mois arrive à échéance. */
async function venteVieillie(mois = 3) {
  const vente = await appareilVendu(d, audio, catalogue);
  const dateDelivrance = ajouterMois(aujourdhui(), -mois);
  await prisma().delivrance.updateMany({
    where: { patientId: vente.patientId },
    data: { dateDelivrance: new Date(dateDelivrance) },
  });
  return { ...vente, dateDelivrance };
}

async function planifier(vente: { patientId: string; dateDelivrance: string }) {
  const { creneaux } = await creneauxPourControle(audio, vente.patientId, {
    datePrevue: aujourdhui(),
    typeRdvId: undefined,
    centreId: undefined,
  });
  return planifierControle(audio, {
    patientId: vente.patientId,
    dateReference: vente.dateDelivrance,
    rang: '1',
    centreId: d.centres.a.id,
    typeRdvId: typeSuivi,
    creneau: creneaux[0]?.clef,
  });
}

describe('contrôles à planifier', () => {
  it('rien juste après la vente', async () => {
    const { patientId } = await appareilVendu(d, audio, catalogue);
    expect(await controlesDuPatient(audio, patientId)).toEqual([]);
  });

  it('le contrôle du 3e mois apparaît à son échéance', async () => {
    const { patientId, dateDelivrance } = await venteVieillie();
    expect(await controlesDuPatient(audio, patientId)).toMatchObject([
      { rang: 1, mois: 3, dateReference: dateDelivrance, datePrevue: aujourdhui() },
    ]);
    const { lignes } = await listerControles(admin, PERIMETRE_TOUS, {});
    expect(lignes).toMatchObject([{ patientId, rang: 1, centreId: d.centres.a.id }]);
  });

  it('suit le rythme paramétré', async () => {
    await enregistrerParametresSav(admin, {
      dureeGarantieMois: '48',
      suiviMois: '2',
      suiviParAn: '0',
      pretDureeJours: '30',
    });
    const { patientId } = await venteVieillie(2);
    expect(await controlesDuPatient(audio, patientId)).toMatchObject([{ rang: 1, mois: 2 }]);
  });

  it('une vente annulée par un avoir n’a plus de suivi', async () => {
    const { patientId, factureId } = await venteVieillie();
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    expect(await controlesDuPatient(audio, patientId)).toEqual([]);
  });

  it('borne la liste au périmètre', async () => {
    await venteVieillie();
    const centreB = { type: 'centre', centreId: d.centres.b.id } as const;
    expect((await listerControles(admin, centreB, {})).lignes).toEqual([]);
  });
});

describe('proposition dans l’agenda', () => {
  it('propose des créneaux du type Suivi, à partir de l’échéance', async () => {
    const { patientId } = await venteVieillie();
    const prevue = ajouterJours(aujourdhui(), 10);
    const proposition = await creneauxPourControle(audio, patientId, {
      datePrevue: prevue,
      typeRdvId: undefined,
      centreId: undefined,
    });
    expect(proposition.typeRdvId).toBe(typeSuivi);
    expect(proposition.creneaux[0]?.date.localeCompare(prevue)).toBeGreaterThanOrEqual(0);
  });

  it('crée le rendez-vous du patient et retire le contrôle', async () => {
    const vente = await venteVieillie();
    const rendezVousId = await planifier(vente);
    expect(
      await prisma().rendezVous.findUniqueOrThrow({ where: { id: rendezVousId } }),
    ).toMatchObject({ patientId: vente.patientId, typeRdvId: typeSuivi, origine: 'INTERNE' });
    expect(
      await prisma().evenementDomaine.count({ where: { type: 'RDV_CREE' } }),
    ).toBeGreaterThanOrEqual(1);
    expect(await controlesDuPatient(audio, vente.patientId)).toEqual([]);
  });

  it('un rendez-vous annulé repropose le contrôle, sans doublon', async () => {
    const vente = await venteVieillie();
    const rendezVousId = await planifier(vente);
    const { version } = await prisma().rendezVous.findUniqueOrThrow({
      where: { id: rendezVousId },
    });
    await annulerRdv(audio, rendezVousId, version);
    expect(await controlesDuPatient(audio, vente.patientId)).toHaveLength(1);
    await planifier(vente);
    expect(await prisma().controleSuivi.count()).toBe(1);
    expect(await controlesDuPatient(audio, vente.patientId)).toEqual([]);
  });

  it('un rendez-vous manqué repropose aussi le contrôle', async () => {
    const vente = await venteVieillie();
    const rendezVousId = await planifier(vente);
    await prisma().rendezVous.update({
      where: { id: rendezVousId },
      data: { statut: 'ABSENT' },
    });
    expect(await controlesDuPatient(audio, vente.patientId)).toHaveLength(1);
  });

  it('refuse une date sans délivrance', async () => {
    const vente = await venteVieillie();
    await expect(
      planifierControle(audio, {
        patientId: vente.patientId,
        dateReference: '2020-01-01',
        rang: '1',
        centreId: d.centres.a.id,
        typeRdvId: typeSuivi,
        creneau: `${aujourdhui()}|09:00||`,
      }),
    ).rejects.toThrow('Aucune délivrance');
  });
});

describe('ignorer', () => {
  it('retire le contrôle, avec un motif chiffré', async () => {
    const { patientId, dateDelivrance } = await venteVieillie();
    const saisie = { patientId, dateReference: dateDelivrance, rang: '1' };
    await expect(ignorerControle(audio, { ...saisie, motif: ' ' })).rejects.toMatchObject({
      erreurs: { motif: [expect.any(String)] },
    });
    await ignorerControle(audio, { ...saisie, motif: 'Patient déménagé' });
    expect(await controlesDuPatient(audio, patientId)).toEqual([]);
    const { motif } = await prisma().controleSuivi.findFirstOrThrow();
    expect(motif).toMatch(/^v1\./);
  });

  it('remplace une décision déjà prise', async () => {
    const vente = await venteVieillie();
    await planifier(vente);
    await ignorerControle(audio, {
      patientId: vente.patientId,
      dateReference: vente.dateDelivrance,
      rang: '1',
      motif: 'Finalement non',
    });
    expect(await prisma().controleSuivi.findFirstOrThrow()).toMatchObject({
      statut: 'IGNORE',
      rendezVousId: null,
    });
  });

  it('un patient hors périmètre est refusé', async () => {
    const { patientId, dateDelivrance } = await venteVieillie();
    await expect(
      ignorerControle(d.acteurs.assistantB, {
        patientId,
        dateReference: dateDelivrance,
        rang: '1',
        motif: 'x',
      }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });
});
