import path from 'node:path';

import { prisma } from '@ha/db/admin';
import { ajouterMois, PARAMETRES_SAV_DEFAUT } from '@ha/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  creerAppareil,
  creerCatalogueDevis,
  identifierCentreA,
  type CatalogueDevis,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { approvisionner } from '@/test/facturation';
import { appareilVendu } from '@/test/sav';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { importerLpp } from '../lpp/importer';
import { emettreAvoir } from './avoirs';
import {
  appareilsDuPatient,
  enregistrerAssurance,
  enregistrerParametresSav,
  lireParametresSav,
} from './garanties';
import { aujourdhui } from './patients';
import { obtenirFicheAppareil } from './stock';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let catalogue: CatalogueDevis;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(d.centres.a.id, catalogue.piles, 100);
});

const SAISIE = {
  dureeGarantieMois: '60',
  suiviMois: '3, 6, 12',
  suiviParAn: '2',
  pretDureeJours: '15',
};

describe('paramètres', () => {
  it('défauts, puis saisie réservée à l’ADMIN_CLIENT', async () => {
    expect(await lireParametresSav(audio)).toEqual(PARAMETRES_SAV_DEFAUT);
    await expect(enregistrerParametresSav(audio, SAISIE)).rejects.toBeInstanceOf(AccesRefuseError);
    await enregistrerParametresSav(admin, SAISIE);
    expect(await lireParametresSav(audio)).toMatchObject({
      dureeGarantieMois: 60,
      pretDureeJours: 15,
    });
    await expect(
      enregistrerParametresSav(admin, { ...SAISIE, dureeGarantieMois: '36' }),
    ).rejects.toMatchObject({ erreurs: { dureeGarantieMois: [expect.any(String)] } });
  });
});

describe('garantie d’un appareil vendu', () => {
  it('commence à la délivrance, sur 4 ans par défaut', async () => {
    const { appareilId } = await appareilVendu(d, audio, catalogue);
    const { garantie } = await obtenirFicheAppareil(audio, appareilId);
    expect(garantie).toMatchObject({
      dateDebut: aujourdhui(),
      dateFin: ajouterMois(aujourdhui(), 48),
      enCours: true,
      assuranceEnCours: false,
    });
  });

  it('suit la durée paramétrée à la vente', async () => {
    await enregistrerParametresSav(admin, SAISIE);
    const { appareilId } = await appareilVendu(d, audio, catalogue);
    const { garantie } = await obtenirFicheAppareil(audio, appareilId);
    expect(garantie?.dateFin).toBe(ajouterMois(aujourdhui(), 60));
  });

  it('une garantie échue se lit comme terminée', async () => {
    const { appareilId, patientId } = await appareilVendu(d, audio, catalogue);
    await prisma().garantieAppareil.update({
      where: { appareilId },
      data: { dateDebut: new Date('2016-01-01'), dateFin: new Date('2020-01-01') },
    });
    const [appareil] = await appareilsDuPatient(audio, patientId);
    expect(appareil?.garantie).toMatchObject({ dateFin: '2020-01-01', enCours: false });
  });

  it('un avoir total retire la garantie', async () => {
    const { appareilId, factureId } = await appareilVendu(d, audio, catalogue);
    await emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'Erreur' });
    expect(await prisma().garantieAppareil.count({ where: { appareilId } })).toBe(0);
  });
});

describe('assurance', () => {
  it('se saisit, se retire et se journalise', async () => {
    const { appareilId, patientId } = await appareilVendu(d, audio, catalogue);
    const saisie = { assureur: 'Assureur fictif', contrat: 'C-1', assuranceFin: '2099-12-31' };
    await enregistrerAssurance(d.acteurs.assistantA, appareilId, saisie);
    const fiche = await obtenirFicheAppareil(audio, appareilId);
    expect(fiche.garantie).toMatchObject({ assureur: 'Assureur fictif', assuranceEnCours: true });
    expect(
      await prisma().journalAudit.count({
        where: { entiteType: 'GARANTIE_APPAREIL', patientId, action: 'UPDATE' },
      }),
    ).toBe(1);
    await enregistrerAssurance(audio, appareilId, { assureur: '', contrat: '', assuranceFin: '' });
    const apres = await obtenirFicheAppareil(audio, appareilId);
    expect(apres.garantie).toMatchObject({ assureur: null, assuranceFin: null });
  });

  it('refuse un appareil non vendu', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-LIBRE');
    await expect(
      enregistrerAssurance(audio, id, { assureur: '', contrat: '', assuranceFin: '' }),
    ).rejects.toThrow('n’a pas de garantie');
  });
});
