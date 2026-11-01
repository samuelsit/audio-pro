import path from 'node:path';

import { prisma } from '@ha/db/admin';
import { ajouterJours } from '@ha/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerAppareil,
  creerCatalogueDevis,
  creerPatientDevis,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { base } from '../chiffrement';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { enregistrerParametresSav } from './garanties';
import { aujourdhui } from './patients';
import {
  affecterAuParc,
  compterPretsEnRetard,
  listerParc,
  listerPrets,
  preterAppareil,
  rendrePret,
} from './prets';
import { changerStatut } from './stock';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const PERIMETRE_TOUS = { type: 'tous' } as const;

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;
let appareilId: string;
let patientId: string;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  appareilId = await creerAppareil(d, catalogue.classeI, 'SN-PRET');
  await affecterAuParc(admin, appareilId, { parcPret: true });
  patientId = await creerPatientDevis(d);
});

const saisiePret = (surcharge = {}) => ({
  appareilId,
  patientId,
  dateRetourPrevue: '',
  ticketId: '',
  ...surcharge,
});
const appareil = (id = appareilId) => prisma().appareil.findUniqueOrThrow({ where: { id } });

/** Avance un prêt dans le passé, comme si la date prévue était dépassée. */
async function retarder(pretId: string, jours: number) {
  await prisma().pretAppareil.update({
    where: { id: pretId },
    data: {
      dateDebut: new Date(ajouterJours(aujourdhui(), -jours - 30)),
      dateRetourPrevue: new Date(ajouterJours(aujourdhui(), -jours)),
    },
  });
}

describe('parc', () => {
  it('liste le parc du périmètre', async () => {
    expect(await listerParc(admin, PERIMETRE_TOUS)).toMatchObject([
      { id: appareilId, numeroSerie: 'SN-PRET', statut: 'EN_STOCK' },
    ]);
  });

  it('l’affectation relève de la gestion et d’un appareil en stock', async () => {
    await expect(affecterAuParc(audio, appareilId, { parcPret: false })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await preterAppareil(audio, saisiePret());
    await expect(affecterAuParc(admin, appareilId, { parcPret: false })).rejects.toThrow(
      'en stock',
    );
  });

  it('un appareil du parc ne se réserve pas', async () => {
    await expect(
      changerStatut(admin, appareilId, {
        statut: 'RESERVE',
        statutAttendu: 'EN_STOCK',
        patientId,
        motif: 'x',
      }),
    ).rejects.toThrow('parc de prêt');
  });

  it('un appareil hors du parc ne se prête pas', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-VENTE');
    await expect(preterAppareil(audio, saisiePret({ appareilId: id }))).rejects.toThrow(
      'parc de prêt',
    );
  });
});

describe('prêt et retour', () => {
  it('rattache le patient, trace le mouvement et applique la durée paramétrée', async () => {
    await enregistrerParametresSav(admin, {
      dureeGarantieMois: '48',
      suiviMois: '3, 6, 12',
      suiviParAn: '2',
      pretDureeJours: '15',
    });
    const pretId = await preterAppareil(audio, saisiePret());
    expect(await appareil()).toMatchObject({ statut: 'PRET', patientId });
    const pret = await prisma().pretAppareil.findUniqueOrThrow({ where: { id: pretId } });
    expect(pret.dateRetourPrevue.toISOString().slice(0, 10)).toBe(ajouterJours(aujourdhui(), 15));
    expect(
      await prisma().journalAudit.count({
        where: { entiteType: 'PRET_APPAREIL', entiteId: pretId, patientId },
      }),
    ).toBe(1);
  });

  it('une date choisie remplace la durée, une date passée est refusée', async () => {
    const dateRetourPrevue = ajouterJours(aujourdhui(), 5);
    await expect(
      preterAppareil(audio, saisiePret({ dateRetourPrevue: '2020-01-01' })),
    ).rejects.toMatchObject({ erreurs: { dateRetourPrevue: [expect.any(String)] } });
    const pretId = await preterAppareil(audio, saisiePret({ dateRetourPrevue }));
    const pret = await prisma().pretAppareil.findUniqueOrThrow({ where: { id: pretId } });
    expect(pret.dateRetourPrevue.toISOString().slice(0, 10)).toBe(dateRetourPrevue);
  });

  it('le retour remet l’appareil en stock, patient détaché, état chiffré', async () => {
    const pretId = await preterAppareil(audio, saisiePret());
    await rendrePret(audio, pretId, { etatRetour: 'Rayure sur la coque' });
    expect(await appareil()).toMatchObject({ statut: 'EN_STOCK', patientId: null, parcPret: true });
    const brut = await prisma().pretAppareil.findUniqueOrThrow({ where: { id: pretId } });
    expect(brut.etatRetour).toMatch(/^v1\./);
    const lu = await base(audio).pretAppareil.findUniqueOrThrow({ where: { id: pretId } });
    expect(lu.etatRetour).toBe('Rayure sur la coque');
    const dernier = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId, statutApres: 'EN_STOCK', statutAvant: 'PRET' },
    });
    expect(dernier.patientId).toBe(patientId);
    await expect(rendrePret(audio, pretId, { etatRetour: '' })).rejects.toThrow('déjà rendu');
  });

  it('refuse un double prêt', async () => {
    await preterAppareil(audio, saisiePret());
    await expect(preterAppareil(audio, saisiePret())).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await prisma().pretAppareil.count()).toBe(1);
  });

  it('un patient hors périmètre est refusé', async () => {
    const autre = await creerPatientDevis(d);
    await prisma().patient.update({ where: { id: autre }, data: { centreId: d.centres.b.id } });
    await expect(
      preterAppareil(d.acteurs.assistantA, saisiePret({ patientId: autre })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('un ticket d’un autre patient est refusé', async () => {
    await expect(
      preterAppareil(audio, saisiePret({ ticketId: '018f0000-0000-7000-8000-000000000001' })),
    ).rejects.toMatchObject({ erreurs: { ticketId: [expect.any(String)] } });
  });
});

describe('alertes de retard', () => {
  it('prêt en retard : compté et signalé dès le lendemain de l’échéance', async () => {
    const pretId = await preterAppareil(audio, saisiePret());
    expect(await compterPretsEnRetard(admin, PERIMETRE_TOUS)).toBe(0);
    await retarder(pretId, 0);
    expect(await compterPretsEnRetard(admin, PERIMETRE_TOUS)).toBe(0);
    expect((await listerPrets(admin, PERIMETRE_TOUS, {})).lignes[0]?.etat).toBe('A_ECHEANCE');
    await retarder(pretId, 1);
    expect(await compterPretsEnRetard(admin, PERIMETRE_TOUS)).toBe(1);
    expect((await listerPrets(admin, PERIMETRE_TOUS, {})).lignes[0]).toMatchObject({
      etat: 'EN_RETARD',
      patient: { id: patientId },
    });
  });

  it('un prêt rendu sort de l’alerte', async () => {
    const pretId = await preterAppareil(audio, saisiePret());
    await retarder(pretId, 3);
    await rendrePret(audio, pretId, { etatRetour: '' });
    expect(await compterPretsEnRetard(admin, PERIMETRE_TOUS)).toBe(0);
    expect((await listerPrets(admin, PERIMETRE_TOUS, {})).lignes[0]?.etat).toBe('RENDU');
  });

  it('le retard reste borné au périmètre', async () => {
    const pretId = await preterAppareil(audio, saisiePret());
    await retarder(pretId, 3);
    const centreB = { type: 'centre', centreId: d.centres.b.id } as const;
    expect(await compterPretsEnRetard(admin, centreB)).toBe(0);
  });
});
