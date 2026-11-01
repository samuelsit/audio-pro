import path from 'node:path';

import { prisma } from '@ha/db/admin';
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
import { abandonnerBrouillon } from './facturation';
import { enregistrerAssurance } from './garanties';
import { valeurDuStock } from './inventaires';
import { changerStatut, obtenirFicheAppareil } from './stock';
import {
  annulerTicket,
  diagnostiquerTicket,
  facturerTicket,
  listerTickets,
  obtenirTicket,
  ouvrirTicket,
  restituerAppareil,
  terminerReparation,
} from './tickets-sav';

vi.setConfig({ testTimeout: 30_000 });

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const PERIMETRE_TOUS = { type: 'tous' } as const;

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let admin: UtilisateurConnecte;
let assistant: UtilisateurConnecte;
let catalogue: CatalogueDevis;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, admin, assistantA: assistant } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
  await approvisionner(d.centres.a.id, catalogue.piles, 100);
});

const appareil = (id: string) => prisma().appareil.findUniqueOrThrow({ where: { id } });
const ticketEnBase = (id: string) => prisma().ticketSav.findUniqueOrThrow({ where: { id } });

async function ticketSur(motif: string = 'PANNE') {
  const vente = await appareilVendu(d, audio, catalogue);
  const ticketId = await ouvrirTicket(assistant, {
    numeroSerie: vente.numeroSerie,
    motif,
    description: 'Ne s’allume plus',
  });
  return { ...vente, ticketId };
}

const DIAGNOSTIC = {
  motif: 'PANNE',
  diagnostic: 'Écouteur HS',
  action: 'REPARATION_CENTRE',
  cout: '',
};

describe('ouverture', () => {
  it('appareil sous garantie : ticket couvert, appareil au SAV, patient conservé', async () => {
    const { ticketId, appareilId, patientId } = await ticketSur();
    expect(await ticketEnBase(ticketId)).toMatchObject({
      numero: expect.stringMatching(/^SAV-\d{4}-000001$/) as string,
      statut: 'OUVERT',
      couverture: 'GARANTIE',
      patientId,
      centreId: d.centres.a.id,
    });
    expect(await appareil(appareilId)).toMatchObject({ statut: 'SAV', patientId });
    const mouvement = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId, ticketSavId: ticketId },
    });
    expect(mouvement).toMatchObject({ statutAvant: 'VENDU', statutApres: 'SAV', patientId });
  });

  it('appareil hors garantie : aucune couverture', async () => {
    const vente = await appareilVendu(d, audio, catalogue);
    await prisma().garantieAppareil.update({
      where: { appareilId: vente.appareilId },
      data: { dateDebut: new Date('2016-01-01'), dateFin: new Date('2020-01-01') },
    });
    const ticketId = await ouvrirTicket(audio, {
      numeroSerie: vente.numeroSerie,
      motif: 'PANNE',
      description: '',
    });
    expect((await ticketEnBase(ticketId)).couverture).toBe('AUCUNE');
  });

  it('casse assurée : l’assurance couvre', async () => {
    const vente = await appareilVendu(d, audio, catalogue);
    await enregistrerAssurance(audio, vente.appareilId, {
      assureur: 'Assureur fictif',
      contrat: '',
      assuranceFin: '2099-12-31',
    });
    const ticketId = await ouvrirTicket(audio, {
      numeroSerie: vente.numeroSerie,
      motif: 'CASSE',
      description: '',
    });
    expect((await ticketEnBase(ticketId)).couverture).toBe('ASSURANCE');
  });

  it('chiffre la description et la relit en clair', async () => {
    const { ticketId } = await ticketSur();
    expect((await ticketEnBase(ticketId)).description).toMatch(/^v1\./);
    expect((await obtenirTicket(audio, ticketId)).description).toBe('Ne s’allume plus');
  });

  it.each([
    { cas: 'série inconnue', serie: 'INCONNU', message: 'Numéro de série inconnu.' },
    { cas: 'appareil en stock', serie: 'SN-LIBRE', message: 'appareil vendu ou déjà au SAV' },
  ])('refuse : $cas', async ({ serie, message }) => {
    await creerAppareil(d, catalogue.classeI, 'SN-LIBRE');
    await expect(
      ouvrirTicket(audio, { numeroSerie: serie, motif: 'PANNE', description: '' }),
    ).rejects.toThrow(message);
  });

  it('un seul ticket ouvert par appareil', async () => {
    const { numeroSerie } = await ticketSur();
    await expect(
      ouvrirTicket(audio, { numeroSerie, motif: 'PANNE', description: '' }),
    ).rejects.toThrow();
  });

  it('reprend un appareil déjà au SAV, sans patient, et le rend au stock', async () => {
    const id = await creerAppareil(d, catalogue.classeI, 'SN-LIBRE');
    await prisma().appareil.update({ where: { id }, data: { statut: 'SAV' } });
    const ticketId = await ouvrirTicket(audio, {
      numeroSerie: 'SN-LIBRE',
      motif: 'PANNE',
      description: '',
    });
    expect((await ticketEnBase(ticketId)).couverture).toBe('AUCUNE');
    await diagnostiquerTicket(audio, ticketId, DIAGNOSTIC);
    await terminerReparation(audio, ticketId);
    await restituerAppareil(audio, ticketId);
    expect(await appareil(id)).toMatchObject({ statut: 'EN_STOCK', patientId: null });
  });
});

describe('réparation au centre', () => {
  it('va du diagnostic à la restitution', async () => {
    const { ticketId, appareilId, patientId } = await ticketSur();
    await diagnostiquerTicket(audio, ticketId, DIAGNOSTIC);
    expect(await ticketEnBase(ticketId)).toMatchObject({
      statut: 'EN_COURS',
      action: 'REPARATION_CENTRE',
    });
    await terminerReparation(audio, ticketId);
    expect((await ticketEnBase(ticketId)).statut).toBe('A_RESTITUER');
    await restituerAppareil(assistant, ticketId);
    expect((await ticketEnBase(ticketId)).statut).toBe('CLOTURE');
    expect(await appareil(appareilId)).toMatchObject({ statut: 'VENDU', patientId });
  });

  it('le diagnostic est réservé à l’audioprothésiste', async () => {
    const { ticketId } = await ticketSur();
    await expect(diagnostiquerTicket(assistant, ticketId, DIAGNOSTIC)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('un motif corrigé recalcule la couverture', async () => {
    const { ticketId } = await ticketSur();
    await diagnostiquerTicket(audio, ticketId, { ...DIAGNOSTIC, motif: 'CASSE' });
    expect((await ticketEnBase(ticketId)).couverture).toBe('AUCUNE');
  });

  it('une réparation ne se termine que si elle est prévue au centre', async () => {
    const { ticketId } = await ticketSur();
    await diagnostiquerTicket(audio, ticketId, { ...DIAGNOSTIC, action: 'ENVOI_FABRICANT' });
    await expect(terminerReparation(audio, ticketId)).rejects.toThrow('réparation au centre');
  });
});

describe('annulation', () => {
  it('rend l’appareil au patient', async () => {
    const { ticketId, appareilId, patientId } = await ticketSur();
    await annulerTicket(audio, ticketId, { motif: 'Erreur de saisie' });
    expect((await ticketEnBase(ticketId)).statut).toBe('ANNULE');
    expect(await appareil(appareilId)).toMatchObject({ statut: 'VENDU', patientId });
  });

  it('un ticket clos ne s’annule pas', async () => {
    const { ticketId } = await ticketSur();
    await annulerTicket(audio, ticketId, { motif: 'Erreur' });
    await expect(annulerTicket(audio, ticketId, { motif: 'Encore' })).rejects.toThrow(
      'pas possible',
    );
  });
});

describe('facturation', () => {
  async function horsGarantie() {
    const vente = await appareilVendu(d, audio, catalogue);
    await prisma().garantieAppareil.update({
      where: { appareilId: vente.appareilId },
      data: { dateDebut: new Date('2016-01-01'), dateFin: new Date('2020-01-01') },
    });
    const ticketId = await ouvrirTicket(audio, {
      numeroSerie: vente.numeroSerie,
      motif: 'PANNE',
      description: '',
    });
    await diagnostiquerTicket(audio, ticketId, { ...DIAGNOSTIC, cout: '45,00' });
    return ticketId;
  }

  it('sous garantie : refusée', async () => {
    const { ticketId } = await ticketSur();
    await diagnostiquerTicket(audio, ticketId, { ...DIAGNOSTIC, cout: '45,00' });
    await expect(facturerTicket(audio, ticketId, { motif: 'Essai' })).rejects.toThrow(
      'Sous garantie',
    );
    expect(await prisma().facture.count({ where: { statut: 'BROUILLON' } })).toBe(0);
  });

  it('hors garantie : motif exigé, brouillon d’entretien sans LPP', async () => {
    const ticketId = await horsGarantie();
    await expect(facturerTicket(audio, ticketId, { motif: ' ' })).rejects.toMatchObject({
      erreurs: { motif: [expect.any(String)] },
    });
    const factureId = await facturerTicket(audio, ticketId, { motif: 'Hors garantie' });
    const facture = await prisma().facture.findUniqueOrThrow({
      where: { id: factureId },
      include: { lignes: true },
    });
    expect(facture).toMatchObject({ statut: 'BROUILLON', dossierId: null, prescriptionId: null });
    expect(facture.lignes).toMatchObject([
      { nature: 'ENTRETIEN', quantite: 1, prixUnitaireCentimes: 4500, codeLpp: null },
    ]);
    expect((await ticketEnBase(ticketId)).factureId).toBe(factureId);
    await expect(facturerTicket(audio, ticketId, { motif: 'Encore' })).rejects.toThrow(
      'déjà facturé',
    );
  });

  it('un brouillon abandonné libère le ticket', async () => {
    const ticketId = await horsGarantie();
    const factureId = await facturerTicket(audio, ticketId, { motif: 'Hors garantie' });
    await abandonnerBrouillon(audio, factureId);
    expect((await obtenirTicket(audio, ticketId)).peutFacturer).toBe(true);
    expect(await facturerTicket(audio, ticketId, { motif: 'Hors garantie' })).not.toBe(factureId);
  });

  it('réservée aux rôles qui facturent', async () => {
    const ticketId = await horsGarantie();
    await expect(facturerTicket(assistant, ticketId, { motif: 'x' })).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});

describe('stock et avoir', () => {
  it('la fiche ne déplace plus un appareil sous ticket et renvoie au ticket', async () => {
    const { ticketId, appareilId } = await ticketSur();
    await expect(
      changerStatut(audio, appareilId, {
        statut: 'VENDU',
        statutAttendu: 'SAV',
        patientId: '',
        motif: 'x',
      }),
    ).rejects.toMatchObject({ erreurs: { statut: [expect.stringContaining('ticket')] } });
    const fiche = await obtenirFicheAppareil(audio, appareilId);
    expect(fiche).toMatchObject({ ticketId, transitions: [] });
  });

  it('un avoir qui solde est refusé tant que l’appareil est au SAV', async () => {
    const { factureId } = await ticketSur();
    await expect(emettreAvoir(admin, factureId, { mode: 'TOTAL', motif: 'x' })).rejects.toThrow(
      'au SAV',
    );
    const { nature } = await prisma().facture.findUniqueOrThrow({ where: { id: factureId } });
    expect(nature).toBe('FACTURE');
    expect(await prisma().facture.count({ where: { nature: 'AVOIR' } })).toBe(0);
  });

  it('un appareil vendu au SAV ne revient pas dans la valeur du stock', async () => {
    const { appareilId } = await ticketSur();
    await prisma().appareil.update({
      where: { id: appareilId },
      data: { prixAchatCentimes: 50_000 },
    });
    const { valeurCentimes } = await valeurDuStock(admin, PERIMETRE_TOUS);
    expect(valeurCentimes).toBe(0);
  });
});

describe('lecture', () => {
  it('journalise la lecture et filtre la liste', async () => {
    const { ticketId, patientId } = await ticketSur();
    await obtenirTicket(audio, ticketId);
    expect(
      await prisma().journalAudit.count({
        where: { entiteType: 'TICKET_SAV', entiteId: ticketId, action: 'READ', patientId },
      }),
    ).toBe(1);
    const tous = await listerTickets(admin, PERIMETRE_TOUS, {});
    expect(tous.lignes.map((l) => l.id)).toEqual([ticketId]);
    const aucun = await listerTickets(admin, PERIMETRE_TOUS, { statut: 'CLOTURE' });
    expect(aucun.lignes).toEqual([]);
  });

  it('le centre du ticket borne l’accès', async () => {
    const { ticketId } = await ticketSur();
    await expect(obtenirTicket(d.acteurs.assistantB, ticketId)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });
});
