import { prisma } from '@ha/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { modifierModele } from './catalogue';
import { fusionnerPatients } from './patients';
import {
  annulerVente,
  centresDeDestination,
  changerStatut,
  entreeAccessoire,
  ErreurConflitStock,
  exporterStock,
  exporterStockAccessoires,
  historiqueAccessoire,
  listerStock,
  listerStockAccessoires,
  modifierAppareil,
  obtenirFicheAppareil,
  recevoirAppareils,
  rechercherParNumeroSerie,
  sortieAccessoire,
  transfererAccessoire,
  transfererAppareil,
} from './stock';

let d: JeuDeDonnees;
let admin: UtilisateurConnecte;
let audio: UtilisateurConnecte;
let assistantA: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let modeleId: string;
let fabricantId: string;
let patientA: string;
let patientB: string;
let patientC: string;

const PERIMETRE_A = () => ({ type: 'centre', centreId: d.centres.a.id }) as const;
const PERIMETRE_B = () => ({ type: 'centre', centreId: d.centres.b.id }) as const;

async function creerFabricantEtModele(nom: string) {
  const fabricant = await prisma().fabricant.create({
    data: { organisationId: d.organisation.id, nom },
  });
  const modele = await prisma().modeleAideAuditive.create({
    data: {
      organisationId: d.organisation.id,
      fabricantId: fabricant.id,
      gamme: 'Gamme',
      nom: `Modèle ${nom}`,
      type: 'RIC',
      classe: 'CLASSE_II',
      prixConseilleCentimes: 150000,
    },
  });
  return { fabricantId: fabricant.id, modeleId: modele.id };
}

function creerPatient(centreId: string, nom: string): Promise<{ id: string }> {
  return prisma().patient.create({
    data: {
      organisationId: d.organisation.id,
      centreId,
      civilite: 'MME',
      nomNaissance: nom,
      prenoms: 'Fictive',
      dateNaissance: new Date('1950-01-15T00:00:00.000Z'),
      sexe: 'FEMININ',
      nomNaissanceRecherche: nom.toUpperCase(),
      prenomsRecherche: 'FICTIVE',
    },
    select: { id: true },
  });
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  ({ admin, audioAB: audio, assistantA, assistantB } = d.acteurs);
  ({ modeleId, fabricantId } = await creerFabricantEtModele('Fabricant Un'));
  patientA = (await creerPatient(d.centres.a.id, 'Alpha')).id;
  patientB = (await creerPatient(d.centres.b.id, 'Beta')).id;
  patientC = (await creerPatient(d.centres.c.id, 'Gamma')).id;
});

function reception(numerosSerie: string[], autres: Record<string, unknown> = {}) {
  return {
    centreId: d.centres.a.id,
    modeleId,
    numerosSerie,
    referenceBonLivraison: 'BL-2026-001',
    referenceFactureFabricant: '',
    dateReception: '2026-01-15',
    prixAchatCentimes: '',
    enConsignation: false,
    ...autres,
  };
}

async function recevoirUn(numero = 'SN0001'): Promise<string> {
  const [id] = await recevoirAppareils(audio, reception([numero]));
  return id as string;
}

async function amener(id: string, statuts: string[], patientId: string | null = patientA) {
  for (const statut of statuts) {
    const { statut: statutAttendu } = await prisma().appareil.findUniqueOrThrow({ where: { id } });
    await changerStatut(admin, id, { statut, statutAttendu, patientId, motif: 'Préparation' });
  }
}

const etat = (id: string) => prisma().appareil.findUniqueOrThrow({ where: { id } });
const mouvements = (appareilId: string) =>
  prisma().mouvementAppareil.findMany({
    where: { appareilId },
    orderBy: [{ horodatage: 'asc' }, { id: 'asc' }],
  });

async function lire(generateur: Promise<AsyncGenerator<string>>): Promise<string> {
  let texte = '';
  for await (const morceau of await generateur) {
    texte += morceau;
  }
  return texte;
}

describe('réception', () => {
  it('crée les appareils en stock, un mouvement et une ligne d’audit par appareil', async () => {
    const ids = await recevoirAppareils(
      assistantA,
      reception(['ab 123', 'cd456'], { referenceFactureFabricant: 'F-1', enConsignation: true }),
    );
    expect(ids).toHaveLength(2);
    const appareil = await etat(ids[0] as string);
    expect(appareil).toMatchObject({
      numeroSerie: 'AB123',
      statut: 'EN_STOCK',
      centreId: d.centres.a.id,
      fabricantId,
      referenceBonLivraison: 'BL-2026-001',
      referenceFactureFabricant: 'F-1',
      enConsignation: true,
      patientId: null,
    });
    const [mouvement] = await mouvements(ids[0] as string);
    expect(mouvement).toMatchObject({
      type: 'RECEPTION',
      statutAvant: null,
      statutApres: 'EN_STOCK',
      centreAvantId: null,
      centreApresId: d.centres.a.id,
      utilisateurId: assistantA.id,
      motif: null,
    });
    const audit = await prisma().journalAudit.findMany({
      where: { entiteType: 'APPAREIL', action: 'CREATE' },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]?.centreId).toBe(d.centres.a.id);
  });

  it('refuse un centre hors droits, fermé, un modèle inconnu, une date future', async () => {
    await expect(recevoirAppareils(assistantB, reception(['SN0001']))).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      recevoirAppareils(admin, reception(['SN0001'], { centreId: d.centres.ferme.id })),
    ).rejects.toMatchObject({ erreurs: { centreId: ['Centre inconnu ou fermé.'] } });
    await expect(
      recevoirAppareils(
        audio,
        reception(['SN0001'], { modeleId: '0190a000-0000-7000-8000-000000000001' }),
      ),
    ).rejects.toMatchObject({ erreurs: { modeleId: ['Modèle inconnu.'] } });
    await expect(
      recevoirAppareils(audio, reception(['SN0001'], { dateReception: '2999-01-01' })),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await prisma().appareil.count()).toBe(0);
  });

  it('seul l’ADMIN saisit un prix d’achat', async () => {
    await expect(
      recevoirAppareils(audio, reception(['SN0001'], { prixAchatCentimes: '650,00' })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    const [id] = await recevoirAppareils(
      admin,
      reception(['SN0001'], { prixAchatCentimes: '650,00' }),
    );
    expect((await etat(id as string)).prixAchatCentimes).toBe(65000);
  });
});

describe('unicité des numéros de série', () => {
  it('refuse un numéro déjà connu du fabricant, sous toutes ses formes, et n’écrit rien', async () => {
    await recevoirUn('AB123');
    await expect(
      recevoirAppareils(audio, reception(['NEUF001', ' ab 123 '])),
    ).rejects.toMatchObject({
      erreurs: { numerosSerie: ['Déjà enregistré chez ce fabricant : AB123.'] },
    });
    expect(await prisma().appareil.count()).toBe(1);
    expect(await prisma().mouvementAppareil.count()).toBe(1);
  });

  it('accepte le même numéro chez un autre fabricant', async () => {
    await recevoirUn('AB123');
    const autre = await creerFabricantEtModele('Fabricant Deux');
    await recevoirAppareils(audio, reception(['AB123'], { modeleId: autre.modeleId }));
    expect(await prisma().appareil.count()).toBe(2);
  });

  it('refuse un numéro connu du fabricant même sur un autre modèle ou dans un autre centre', async () => {
    await recevoirUn('AB123');
    const autreModele = await prisma().modeleAideAuditive.create({
      data: {
        organisationId: d.organisation.id,
        fabricantId,
        gamme: 'Autre',
        nom: 'Autre',
        type: 'INTRA',
        classe: 'CLASSE_I',
        prixConseilleCentimes: 95000,
      },
    });
    await expect(
      recevoirAppareils(
        audio,
        reception(['AB123'], { modeleId: autreModele.id, centreId: d.centres.b.id }),
      ),
    ).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('refuse un doublon dans la saisie', async () => {
    await expect(recevoirAppareils(audio, reception(['AB123', 'ab123']))).rejects.toMatchObject({
      erreurs: { numerosSerie: ['Numéro saisi deux fois : AB123.'] },
    });
    expect(await prisma().appareil.count()).toBe(0);
  });

  it('deux réceptions simultanées du même numéro : une seule passe', async () => {
    for (let essai = 0; essai < 10; essai += 1) {
      const numero = `CONCU${essai}`;
      const resultats = await Promise.allSettled([
        recevoirAppareils(audio, reception([numero])),
        recevoirAppareils(admin, reception([numero, `AUTRE${essai}`])),
      ]);
      const refus = resultats.filter((r) => r.status === 'rejected');
      expect(refus).toHaveLength(1);
      expect((refus[0] as PromiseRejectedResult).reason).toBeInstanceOf(ErreurSaisie);
      expect(await prisma().appareil.count({ where: { numeroSerie: numero } })).toBe(1);
    }
    expect(await prisma().mouvementAppareil.count()).toBe(await prisma().appareil.count());
  });

  it('la base garantit l’unicité sans passer par le service', async () => {
    const id = await recevoirUn('AB123');
    const a = await etat(id);
    await expect(
      prisma().appareil.create({
        data: {
          organisationId: a.organisationId,
          modeleId: a.modeleId,
          fabricantId: a.fabricantId,
          centreId: a.centreId,
          numeroSerie: a.numeroSerie,
          dateReception: a.dateReception,
          referenceBonLivraison: a.referenceBonLivraison,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('le fabricant d’un modèle en stock ne peut plus changer, ni par le service ni en base', async () => {
    await recevoirUn();
    const autre = await creerFabricantEtModele('Fabricant Deux');
    await expect(
      modifierModele(admin, modeleId, {
        fabricantId: autre.fabricantId,
        gamme: 'Gamme',
        nom: 'Modèle Fabricant Un',
        type: 'RIC',
        classe: 'CLASSE_II',
        codesLpp: '',
        prixConseilleCentimes: '1500,00',
        actif: true,
      }),
    ).rejects.toMatchObject({
      erreurs: { fabricantId: [expect.stringContaining('ne peut plus')] },
    });
    await expect(
      prisma().modeleAideAuditive.update({
        where: { id: modeleId },
        data: { fabricantId: autre.fabricantId },
      }),
    ).rejects.toThrow();
  });
});

describe('machine à états, par le service', () => {
  it('chaque changement écrit un mouvement chiffré et une ligne d’audit sans le motif', async () => {
    const id = await recevoirUn();
    await changerStatut(audio, id, {
      statut: 'RESERVE',
      statutAttendu: 'EN_STOCK',
      patientId: patientA,
      motif: 'Motif confidentiel',
    });
    expect(await etat(id)).toMatchObject({ statut: 'RESERVE', patientId: patientA });
    const brut = await prisma().mouvementAppareil.findFirstOrThrow({
      where: { appareilId: id, type: 'CHANGEMENT_STATUT' },
    });
    expect(brut).toMatchObject({
      statutAvant: 'EN_STOCK',
      statutApres: 'RESERVE',
      patientId: patientA,
      utilisateurId: audio.id,
      dossierId: null,
    });
    expect(brut.motif).toMatch(/^v1\./);
    const audit = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteId: id, action: 'UPDATE' },
    });
    expect(audit).toMatchObject({ patientId: patientA, centreId: d.centres.a.id });
    expect(JSON.stringify(audit)).not.toContain('confidentiel');
  });

  it('refuse une transition interdite sans rien écrire', async () => {
    const id = await recevoirUn();
    await expect(
      changerStatut(audio, id, { statut: 'VENDU', statutAttendu: 'EN_STOCK', motif: 'x' }),
    ).rejects.toMatchObject({ erreurs: { statut: [expect.stringContaining('pas autorisé')] } });
    expect((await etat(id)).statut).toBe('EN_STOCK');
    expect(await mouvements(id)).toHaveLength(1);
  });

  it('réserver sans patient est refusé sur le champ patient', async () => {
    const id = await recevoirUn();
    await expect(
      changerStatut(audio, id, { statut: 'RESERVE', statutAttendu: 'EN_STOCK', motif: 'x' }),
    ).rejects.toMatchObject({ erreurs: { patientId: ['Choisir un patient.'] } });
  });

  it.each(['hors droits', 'fusionné'])('refuse un patient %s', async (cas) => {
    const id = await recevoirUn();
    const cible = cas === 'hors droits' ? patientC : patientA;
    if (cas === 'fusionné') {
      await prisma().patient.update({
        where: { id: patientA },
        data: { fusionneDansId: patientB },
      });
    }
    await expect(
      changerStatut(audio, id, {
        statut: 'RESERVE',
        statutAttendu: 'EN_STOCK',
        patientId: cible,
        motif: 'x',
      }),
    ).rejects.toMatchObject({ erreurs: { patientId: ['Patient inconnu.'] } });
  });

  it('VENDU → EN_STOCK est refusé hors annulation', async () => {
    const id = await recevoirUn();
    await amener(id, ['EN_ESSAI', 'VENDU']);
    await expect(
      changerStatut(admin, id, { statut: 'EN_STOCK', statutAttendu: 'VENDU', motif: 'x' }),
    ).rejects.toMatchObject({ erreurs: { statut: [expect.stringContaining('annulation')] } });
    expect((await etat(id)).statut).toBe('VENDU');
  });

  it('VENDU → SAV garde le patient et le retour ne peut se faire que vers lui', async () => {
    const id = await recevoirUn();
    await amener(id, ['EN_ESSAI', 'VENDU', 'SAV', 'RETOUR_FABRICANT']);
    expect(await etat(id)).toMatchObject({ statut: 'RETOUR_FABRICANT', patientId: patientA });
    await expect(
      changerStatut(admin, id, {
        statut: 'EN_STOCK',
        statutAttendu: 'RETOUR_FABRICANT',
        motif: 'x',
      }),
    ).rejects.toMatchObject({
      erreurs: { statut: [expect.stringContaining('vendu à un patient')] },
    });
    await amener(id, ['VENDU']);
    expect(await etat(id)).toMatchObject({ statut: 'VENDU', patientId: patientA });
  });

  it('un appareil d’essai en panne quitte le patient en partant au SAV', async () => {
    const id = await recevoirUn();
    await amener(id, ['EN_ESSAI', 'SAV']);
    expect(await etat(id)).toMatchObject({ statut: 'SAV', patientId: null });
    const dernier = (await mouvements(id)).at(-1);
    expect(dernier).toMatchObject({ statutApres: 'SAV', patientId: patientA });
  });

  it('l’état de l’appareil est toujours celui de son dernier mouvement', async () => {
    const id = await recevoirUn();
    await amener(id, ['RESERVE', 'EN_ESSAI', 'EN_STOCK', 'SAV', 'RETOUR_FABRICANT', 'EN_STOCK']);
    await transfererAppareil(audio, id, {
      centreDestinationId: d.centres.b.id,
      centreOrigineId: d.centres.a.id,
      motif: 'Besoin',
    });
    const historique = await mouvements(id);
    expect(historique).toHaveLength(8);
    const appareil = await etat(id);
    expect(historique.at(-1)).toMatchObject({
      statutApres: appareil.statut,
      centreApresId: appareil.centreId,
    });
    for (let i = 1; i < historique.length; i += 1) {
      expect(historique[i]?.statutAvant).toBe(historique[i - 1]?.statutApres);
      expect(historique[i]?.centreAvantId).toBe(historique[i - 1]?.centreApresId);
    }
  });
});

describe('annulation de vente', () => {
  it('réservée à l’ADMIN, motif obligatoire, tracée', async () => {
    const id = await recevoirUn();
    await amener(id, ['EN_ESSAI', 'VENDU']);
    await expect(annulerVente(audio, id, { motif: 'x' })).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(annulerVente(admin, id, { motif: ' ' })).rejects.toBeInstanceOf(ErreurSaisie);
    await annulerVente(admin, id, { motif: 'Rétractation' });
    expect(await etat(id)).toMatchObject({ statut: 'EN_STOCK', patientId: null });
    expect((await mouvements(id)).at(-1)).toMatchObject({
      type: 'ANNULATION_VENTE',
      statutAvant: 'VENDU',
      statutApres: 'EN_STOCK',
      patientId: patientA,
      utilisateurId: admin.id,
    });
  });

  it('refusée pour un appareil qui n’est pas vendu', async () => {
    const id = await recevoirUn();
    await expect(annulerVente(admin, id, { motif: 'x' })).rejects.toMatchObject({
      erreurs: { motif: ['Cet appareil n’est pas vendu.'] },
    });
  });
});

describe('transfert', () => {
  const vers = (centreId: string) => ({
    centreDestinationId: centreId,
    centreOrigineId: d.centres.a.id,
    motif: 'Besoin du centre',
  });

  it('change le centre, écrit le mouvement et une ligne d’audit par centre', async () => {
    const id = await recevoirUn();
    await transfererAppareil(assistantA, id, vers(d.centres.b.id));
    expect(await etat(id)).toMatchObject({ centreId: d.centres.b.id, statut: 'EN_STOCK' });
    expect((await mouvements(id)).at(-1)).toMatchObject({
      type: 'TRANSFERT',
      statutAvant: 'EN_STOCK',
      statutApres: 'EN_STOCK',
      centreAvantId: d.centres.a.id,
      centreApresId: d.centres.b.id,
    });
    const audit = await prisma().journalAudit.findMany({
      where: { entiteId: id, action: 'UPDATE' },
    });
    expect(audit.map((l) => l.centreId).sort()).toEqual([d.centres.a.id, d.centres.b.id].sort());
  });

  it('le centre d’arrivée peut être hors des droits de l’utilisateur', async () => {
    const id = await recevoirUn();
    await transfererAppareil(assistantA, id, vers(d.centres.c.id));
    expect((await etat(id)).centreId).toBe(d.centres.c.id);
    await expect(obtenirFicheAppareil(assistantA, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('refuse un statut autre qu’en stock, le même centre, un centre fermé, un centre source hors droits', async () => {
    const id = await recevoirUn();
    await expect(transfererAppareil(audio, id, vers(d.centres.a.id))).rejects.toMatchObject({
      erreurs: { centreDestinationId: ['Choisir un autre centre.'] },
    });
    await expect(transfererAppareil(audio, id, vers(d.centres.ferme.id))).rejects.toMatchObject({
      erreurs: { centreDestinationId: ['Centre inconnu ou fermé.'] },
    });
    await expect(transfererAppareil(assistantB, id, vers(d.centres.b.id))).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await amener(id, ['RESERVE']);
    await expect(transfererAppareil(audio, id, vers(d.centres.b.id))).rejects.toMatchObject({
      erreurs: { centreDestinationId: ['Seul un appareil en stock peut être transféré.'] },
    });
    expect((await etat(id)).centreId).toBe(d.centres.a.id);
  });

  it('deux transferts simultanés : un seul passe', async () => {
    const id = await recevoirUn();
    const resultats = await Promise.allSettled([
      transfererAppareil(audio, id, vers(d.centres.b.id)),
      transfererAppareil(admin, id, vers(d.centres.c.id)),
    ]);
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refus = resultats.find((r) => r.status === 'rejected');
    expect((refus as PromiseRejectedResult).reason).toBeInstanceOf(ErreurConflitStock);
    expect(await mouvements(id)).toHaveLength(2);
  });

  it('propose les centres actifs, sans le centre de départ', async () => {
    const centres = await centresDeDestination(audio, d.centres.a.id);
    expect(centres.map((c) => c.id).sort()).toEqual([d.centres.b.id, d.centres.c.id].sort());
  });
});

describe('deux réservations simultanées du même appareil', () => {
  it('une seule aboutit, l’autre reçoit un conflit, un seul mouvement est écrit', async () => {
    for (let essai = 0; essai < 20; essai += 1) {
      const id = await recevoirUn(`RESA${essai}`);
      const [premier, second] = await Promise.allSettled([
        changerStatut(audio, id, {
          statut: 'RESERVE',
          statutAttendu: 'EN_STOCK',
          patientId: patientA,
          motif: 'Réservation A',
        }),
        changerStatut(admin, id, {
          statut: 'RESERVE',
          statutAttendu: 'EN_STOCK',
          patientId: patientB,
          motif: 'Réservation B',
        }),
      ]);
      const resultats = [premier, second];
      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refus = resultats.find((r) => r.status === 'rejected');
      expect((refus as PromiseRejectedResult).reason).toBeInstanceOf(ErreurConflitStock);

      const gagnant = premier.status === 'fulfilled' ? patientA : patientB;
      expect(await etat(id)).toMatchObject({ statut: 'RESERVE', patientId: gagnant });
      const historique = await mouvements(id);
      expect(historique).toHaveLength(2);
      expect(historique[1]?.patientId).toBe(gagnant);
      expect(await prisma().journalAudit.count({ where: { entiteId: id, action: 'UPDATE' } })).toBe(
        1,
      );
    }
  });

  it('une fiche restée ouverte ne réserve pas un appareil déjà réservé', async () => {
    const id = await recevoirUn();
    await amener(id, ['RESERVE', 'EN_STOCK', 'SAV']);
    await expect(
      changerStatut(audio, id, {
        statut: 'RESERVE',
        statutAttendu: 'EN_STOCK',
        patientId: patientA,
        motif: 'x',
      }),
    ).rejects.toBeInstanceOf(ErreurConflitStock);
  });
});

describe('atomicité et historique en ajout seul', () => {
  async function avecPanne(table: string, operation: () => Promise<unknown>): Promise<void> {
    await prisma().$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION panne_de_test() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'panne de test'; END; $$ LANGUAGE plpgsql`);
    await prisma().$executeRawUnsafe(
      `CREATE TRIGGER panne_de_test BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION panne_de_test()`,
    );
    try {
      await expect(operation()).rejects.toThrow('panne de test');
    } finally {
      await prisma().$executeRawUnsafe(`DROP TRIGGER panne_de_test ON "${table}"`);
      await prisma().$executeRawUnsafe('DROP FUNCTION panne_de_test');
    }
  }

  it.each(['mouvement_appareil', 'journal_audit'])(
    'si l’écriture dans %s échoue, l’appareil ne change pas',
    async (table) => {
      const id = await recevoirUn();
      await avecPanne(table, () =>
        changerStatut(audio, id, {
          statut: 'RESERVE',
          statutAttendu: 'EN_STOCK',
          patientId: patientA,
          motif: 'x',
        }),
      );
      expect(await etat(id)).toMatchObject({ statut: 'EN_STOCK', patientId: null });
      expect(await mouvements(id)).toHaveLength(1);
    },
  );

  it('si le journal échoue, une réception ne laisse rien', async () => {
    await avecPanne('journal_audit', () => recevoirAppareils(audio, reception(['SN0001'])));
    expect(await prisma().appareil.count()).toBe(0);
    expect(await prisma().mouvementAppareil.count()).toBe(0);
  });

  it('les mouvements ne se modifient ni ne se suppriment', async () => {
    const id = await recevoirUn();
    await expect(
      prisma().mouvementAppareil.updateMany({
        where: { appareilId: id },
        data: { utilisateurId: admin.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma().mouvementAppareil.deleteMany({ where: { appareilId: id } }),
    ).rejects.toThrow();
  });

  it('un appareil avec son historique ne se supprime pas', async () => {
    const id = await recevoirUn();
    await expect(prisma().appareil.delete({ where: { id } })).rejects.toThrow();
  });

  it('un motif en clair est refusé par la base', async () => {
    const id = await recevoirUn();
    await expect(
      prisma().mouvementAppareil.create({
        data: {
          organisationId: d.organisation.id,
          appareilId: id,
          type: 'CHANGEMENT_STATUT',
          utilisateurId: audio.id,
          statutApres: 'SAV',
          centreApresId: d.centres.a.id,
          motif: 'en clair',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('modification de la fiche', () => {
  const modification = (autres: Record<string, unknown> = {}) => ({
    referenceBonLivraison: 'BL-2026-001',
    referenceFactureFabricant: 'F-42',
    prixAchatCentimes: '',
    enConsignation: true,
    ...autres,
  });

  it('la facture se saisit après la réception, par tout rôle du centre, et se journalise', async () => {
    const id = await recevoirUn();
    await modifierAppareil(assistantA, id, modification());
    expect(await etat(id)).toMatchObject({
      referenceFactureFabricant: 'F-42',
      enConsignation: true,
    });
    const audit = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteId: id, action: 'UPDATE' },
    });
    expect(JSON.stringify(audit.champs)).toContain('F-42');
    await expect(modifierAppareil(assistantB, id, modification())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('le prix d’achat : modifié par l’ADMIN, intact sinon, jamais en clair dans le journal', async () => {
    const id = await recevoirUn();
    await modifierAppareil(admin, id, modification({ prixAchatCentimes: '123,45' }));
    expect((await etat(id)).prixAchatCentimes).toBe(12345);
    await modifierAppareil(audio, id, modification());
    expect((await etat(id)).prixAchatCentimes).toBe(12345);
    await expect(
      modifierAppareil(audio, id, modification({ prixAchatCentimes: '1,00' })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    const audit = await prisma().journalAudit.findMany({ where: { entiteId: id } });
    expect(JSON.stringify(audit)).not.toContain('12345');
  });

  it('l’ADMIN corrige numéro et modèle tant que seule la réception existe', async () => {
    const id = await recevoirUn('FAUTE01');
    const autre = await creerFabricantEtModele('Fabricant Deux');
    await expect(
      modifierAppareil(audio, id, modification({ numeroSerie: 'BON0001' })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await modifierAppareil(
      admin,
      id,
      modification({ numeroSerie: 'bon 0001', modeleId: autre.modeleId }),
    );
    expect(await etat(id)).toMatchObject({
      numeroSerie: 'BON0001',
      modeleId: autre.modeleId,
      fabricantId: autre.fabricantId,
    });
  });

  it('un rôle non ADMIN peut renvoyer le numéro et le modèle inchangés', async () => {
    const id = await recevoirUn('AB123');
    await modifierAppareil(audio, id, modification({ numeroSerie: 'ab123', modeleId }));
    expect((await etat(id)).referenceFactureFabricant).toBe('F-42');
  });

  it('une correction est refusée après un premier mouvement ou sur un numéro existant', async () => {
    const id = await recevoirUn('AB123');
    await recevoirUn('CD456');
    await expect(
      modifierAppareil(admin, id, modification({ numeroSerie: 'CD456' })),
    ).rejects.toMatchObject({ erreurs: { numeroSerie: [expect.stringContaining('existe déjà')] } });
    await amener(id, ['SAV']);
    await expect(
      modifierAppareil(admin, id, modification({ numeroSerie: 'XY789' })),
    ).rejects.toMatchObject({ erreurs: { numeroSerie: [expect.stringContaining('déjà bougé')] } });
  });

  it('une correction vers un modèle inconnu est refusée', async () => {
    const id = await recevoirUn();
    await expect(
      modifierAppareil(
        admin,
        id,
        modification({ modeleId: '0190a000-0000-7000-8000-000000000001' }),
      ),
    ).rejects.toMatchObject({ erreurs: { modeleId: ['Modèle inconnu.'] } });
  });
});

describe('recherche et fiche', () => {
  it('trouve un numéro quelle que soit sa forme, chez chaque fabricant', async () => {
    await recevoirUn('AB123');
    const autre = await creerFabricantEtModele('Fabricant Deux');
    await recevoirAppareils(audio, reception(['AB123'], { modeleId: autre.modeleId }));
    const resultats = await rechercherParNumeroSerie(audio, ' ab 123 ');
    expect(resultats.map((r) => r.fabricant)).toEqual(['Fabricant Deux', 'Fabricant Un']);
    expect(await rechercherParNumeroSerie(audio, '  ')).toEqual([]);
    expect(await rechercherParNumeroSerie(audio, 'INCONNU')).toEqual([]);
  });

  it('hors périmètre, seuls le modèle et le centre sont révélés', async () => {
    const id = await recevoirUn('AB123');
    const [resultat] = await rechercherParNumeroSerie(assistantB, 'AB123');
    expect(resultat).toEqual({
      id: null,
      numeroSerie: 'AB123',
      fabricant: 'Fabricant Un',
      modele: 'Gamme Modèle Fabricant Un',
      centre: 'Centre A',
      statut: null,
    });
    expect((await rechercherParNumeroSerie(assistantA, 'AB123'))[0]?.id).toBe(id);
    await expect(obtenirFicheAppareil(assistantB, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('un appareil d’une autre organisation reste invisible', async () => {
    const id = await recevoirUn('AB123');
    const autre = await prisma().organisation.create({ data: { nom: 'Autre réseau' } });
    await prisma().utilisateur.update({
      where: { id: admin.id },
      data: { organisationId: autre.id },
    });
    const etranger = { ...admin, organisationId: autre.id };
    expect(await rechercherParNumeroSerie(etranger, 'AB123')).toEqual([]);
    await expect(obtenirFicheAppareil(etranger, id)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('la fiche donne tout l’historique : centres, patients, utilisateurs, motifs déchiffrés', async () => {
    const id = await recevoirUn();
    await amener(id, ['EN_ESSAI', 'EN_STOCK']);
    await transfererAppareil(audio, id, {
      centreDestinationId: d.centres.b.id,
      centreOrigineId: d.centres.a.id,
      motif: 'Besoin',
    });
    const fiche = await obtenirFicheAppareil(audio, id);
    expect(fiche.centre).toBe('Centre B');
    expect(fiche.mouvements.map((m) => m.type)).toEqual([
      'TRANSFERT',
      'CHANGEMENT_STATUT',
      'CHANGEMENT_STATUT',
      'RECEPTION',
    ]);
    expect(fiche.mouvements[0]).toMatchObject({
      centreAvant: 'Centre A',
      centreApres: 'Centre B',
      motif: 'Besoin',
      utilisateur: 'Audioab Test',
    });
    expect(fiche.mouvements[2]).toMatchObject({
      patient: { id: patientA, libelle: 'Alpha Fictive' },
      motif: 'Préparation',
    });
    expect(fiche.transferable).toBe(true);
    expect(fiche.corrigeable).toBe(false);
    expect(fiche.transitions).toContainEqual({ statut: 'RESERVE', patientAChoisir: true });
    expect(fiche.transitions).toContainEqual({ statut: 'SAV', patientAChoisir: false });
  });

  it('écrit une ligne READ par patient affiché, une seule sans patient', async () => {
    const id = await recevoirUn();
    await obtenirFicheAppareil(audio, id);
    const lecture = { entiteId: id, action: 'READ' } as const;
    expect(await prisma().journalAudit.count({ where: lecture })).toBe(1);

    await amener(id, ['RESERVE', 'EN_STOCK']);
    await amener(id, ['RESERVE'], patientB);
    await prisma().journalAudit.count();
    await obtenirFicheAppareil(audio, id);
    const lignes = await prisma().journalAudit.findMany({
      where: { ...lecture, patientId: { not: null } },
    });
    expect(lignes.map((l) => l.patientId).sort()).toEqual([patientA, patientB].sort());
  });

  it('masque l’identité et le motif d’un patient hors droits, sans ligne READ sur lui', async () => {
    const id = await recevoirUn();
    await amener(id, ['RESERVE'], patientC);
    const fiche = await obtenirFicheAppareil(audio, id);
    expect(fiche).toMatchObject({ patient: null, patientMasque: true });
    expect(fiche.mouvements[0]).toMatchObject({ patient: null, patientMasque: true, motif: null });
    expect(JSON.stringify(fiche)).not.toContain('Gamma');
    expect(
      await prisma().journalAudit.count({ where: { action: 'READ', patientId: patientC } }),
    ).toBe(0);
    const pourAdmin = await obtenirFicheAppareil(admin, id);
    expect(pourAdmin.patient?.libelle).toBe('Gamma Fictive');
  });

  it('le prix d’achat n’apparaît que pour l’ADMIN, l’annulation et la correction aussi', async () => {
    const [id] = await recevoirAppareils(
      admin,
      reception(['SN0001'], { prixAchatCentimes: '650,00' }),
    );
    const parAudio = await obtenirFicheAppareil(audio, id as string);
    expect(parAudio).toMatchObject({
      prixAchatCentimes: null,
      voitPrix: false,
      corrigeable: false,
    });
    const parAdmin = await obtenirFicheAppareil(admin, id as string);
    expect(parAdmin).toMatchObject({
      prixAchatCentimes: 65000,
      voitPrix: true,
      corrigeable: true,
      annulable: false,
    });
    await amener(id as string, ['EN_ESSAI', 'VENDU']);
    expect((await obtenirFicheAppareil(admin, id as string)).annulable).toBe(true);
    expect((await obtenirFicheAppareil(audio, id as string)).annulable).toBe(false);
  });

  it('après une fusion, l’appareil suit la fiche conservée et l’historique l’affiche', async () => {
    const id = await recevoirUn();
    const conservee = await creerPatient(d.centres.a.id, 'Conservée');
    await amener(id, ['EN_ESSAI', 'VENDU']);
    await fusionnerPatients(admin, conservee.id, patientA, {});
    expect((await etat(id)).patientId).toBe(conservee.id);
    const fiche = await obtenirFicheAppareil(admin, id);
    expect(fiche.patient?.id).toBe(conservee.id);
    expect(fiche.mouvements[0]?.patient?.id).toBe(conservee.id);
    expect((await mouvements(id)).at(-1)?.patientId).toBe(patientA);
  });
});

describe('liste et export', () => {
  async function preparerStock() {
    const autre = await creerFabricantEtModele('Fabricant Deux');
    const [sav, stock] = await recevoirAppareils(
      admin,
      reception(['AAA111', 'BBB222'], {
        prixAchatCentimes: '650,50',
      }),
    );
    await recevoirAppareils(audio, reception(['CCC333'], { modeleId: autre.modeleId }));
    await recevoirAppareils(audio, reception(['DDD444'], { centreId: d.centres.b.id }));
    await amener(sav as string, ['SAV']);
    return { autre, stock };
  }

  it('limite la liste au périmètre et applique les filtres', async () => {
    const { autre } = await preparerStock();
    const numeros = async (perimetre: Parameters<typeof listerStock>[1], filtre = {}) =>
      (await listerStock(audio, perimetre, filtre)).lignes.map((l) => l.numeroSerie).sort();
    expect(await numeros(PERIMETRE_A())).toEqual(['AAA111', 'BBB222', 'CCC333']);
    expect(await numeros(PERIMETRE_B())).toEqual(['DDD444']);
    expect(await numeros(PERIMETRE_A(), { statut: 'SAV' })).toEqual(['AAA111']);
    expect(await numeros(PERIMETRE_A(), { modeleId: autre.modeleId })).toEqual(['CCC333']);
    expect(await numeros(PERIMETRE_A(), { fabricantId: autre.fabricantId })).toEqual(['CCC333']);
  });

  it('« tous les centres » est réservé à l’ADMIN, un centre hors droits est refusé', async () => {
    await preparerStock();
    const { lignes } = await listerStock(admin, { type: 'tous' }, {});
    expect(lignes).toHaveLength(4);
    await expect(listerStock(audio, { type: 'tous' }, {})).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(listerStock(assistantB, PERIMETRE_A(), {})).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('refuse un filtre invalide', async () => {
    await expect(listerStock(audio, PERIMETRE_A(), { statut: 'PERDU' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
    await expect(exporterStock(audio, PERIMETRE_A(), { statut: 'PERDU' })).rejects.toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('l’export suit les filtres, se journalise et ne contient le prix que pour l’ADMIN', async () => {
    await preparerStock();
    const pourAudio = await lire(exporterStock(audio, PERIMETRE_A(), { statut: 'EN_STOCK' }));
    expect(pourAudio).toContain('BBB222');
    expect(pourAudio).not.toContain('AAA111');
    expect(pourAudio).not.toContain('Prix');
    expect(pourAudio).not.toContain('650,50');

    const pourAdmin = await lire(exporterStock(admin, { type: 'tous' }, {}));
    expect(pourAdmin).toContain('Prix');
    expect(pourAdmin).toContain('650,50');
    expect(pourAdmin).toContain('DDD444');

    const audit = await prisma().journalAudit.findMany({
      where: { action: 'EXPORT', entiteType: 'APPAREIL' },
      orderBy: { horodatage: 'asc' },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]?.centreId).toBe(d.centres.a.id);
  });

  it('l’export ne contient jamais l’identité d’un patient', async () => {
    const id = await recevoirUn();
    await amener(id, ['RESERVE']);
    const csv = await lire(exporterStock(admin, PERIMETRE_A(), {}));
    expect(csv).not.toContain('Alpha');
  });
});

describe('accessoires et piles', () => {
  let accessoireId: string;

  beforeEach(async () => {
    const accessoire = await prisma().accessoire.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Piles 312',
        nature: 'PILE',
        prixCentimes: 500,
      },
    });
    accessoireId = accessoire.id;
  });

  const mouvement = (quantite: number, autres: Record<string, unknown> = {}) => ({
    centreId: d.centres.a.id,
    accessoireId,
    quantite: String(quantite),
    motif: 'Livraison',
    ...autres,
  });

  const quantite = async (centreId: string) =>
    (
      await prisma().stockAccessoire.findUnique({
        where: { centreId_accessoireId: { centreId, accessoireId } },
      })
    )?.quantite ?? 0;

  it('entrées et sorties suivent la quantité, le mouvement et l’audit', async () => {
    await entreeAccessoire(assistantA, mouvement(10));
    await entreeAccessoire(assistantA, mouvement(5));
    await sortieAccessoire(assistantA, mouvement(3, { motif: 'Remise au patient' }));
    expect(await quantite(d.centres.a.id)).toBe(12);
    const historique = await historiqueAccessoire(assistantA, PERIMETRE_A(), accessoireId);
    expect(historique.map((m) => [m.type, m.quantite, m.quantiteApres])).toEqual([
      ['SORTIE', 3, 12],
      ['ENTREE', 5, 15],
      ['ENTREE', 10, 10],
    ]);
    expect(historique[0]?.motif).toBe('Remise au patient');
    const [brut] = await prisma().mouvementAccessoire.findMany({ take: 1 });
    expect(brut?.motif).toMatch(/^v1\./);
    const audit = await prisma().journalAudit.findMany({
      where: { entiteType: 'STOCK_ACCESSOIRE' },
    });
    expect(audit).toHaveLength(3);
    expect(JSON.stringify(audit)).not.toContain('Remise');
  });

  it('refuse une sortie supérieure au stock, sans rien écrire', async () => {
    await entreeAccessoire(audio, mouvement(2));
    await expect(sortieAccessoire(audio, mouvement(3))).rejects.toMatchObject({
      erreurs: { quantite: ['Stock insuffisant dans ce centre.'] },
    });
    expect(await quantite(d.centres.a.id)).toBe(2);
    expect(await prisma().mouvementAccessoire.count()).toBe(1);
  });

  it('une sortie sans ligne de stock est refusée', async () => {
    await expect(sortieAccessoire(audio, mouvement(1))).rejects.toBeInstanceOf(ErreurSaisie);
  });

  it('des sorties simultanées ne rendent jamais le stock négatif', async () => {
    await entreeAccessoire(audio, mouvement(5));
    const resultats = await Promise.allSettled(
      Array.from({ length: 8 }, () => sortieAccessoire(audio, mouvement(1))),
    );
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(await quantite(d.centres.a.id)).toBe(0);
  });

  it('des entrées simultanées s’additionnent, première ligne comprise', async () => {
    await Promise.all(Array.from({ length: 5 }, () => entreeAccessoire(audio, mouvement(2))));
    expect(await quantite(d.centres.a.id)).toBe(10);
  });

  it('un transfert débite un centre, crédite l’autre, ou n’écrit rien', async () => {
    await entreeAccessoire(audio, mouvement(4));
    const transfert = (n: number) =>
      mouvement(n, { centreDestinationId: d.centres.c.id, motif: 'Dépannage' });
    await transfererAccessoire(audio, transfert(3));
    expect(await quantite(d.centres.a.id)).toBe(1);
    expect(await quantite(d.centres.c.id)).toBe(3);
    await expect(transfererAccessoire(audio, transfert(2))).rejects.toBeInstanceOf(ErreurSaisie);
    expect(await quantite(d.centres.c.id)).toBe(3);
    expect(await prisma().journalAudit.count({ where: { entiteType: 'STOCK_ACCESSOIRE' } })).toBe(
      3,
    );
  });

  it('applique les droits par centre et vérifie les références', async () => {
    await expect(entreeAccessoire(assistantB, mouvement(1))).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(sortieAccessoire(assistantB, mouvement(1))).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      transfererAccessoire(assistantB, mouvement(1, { centreDestinationId: d.centres.b.id })),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(
      entreeAccessoire(
        audio,
        mouvement(1, { accessoireId: '0190a000-0000-7000-8000-000000000001' }),
      ),
    ).rejects.toMatchObject({ erreurs: { accessoireId: ['Accessoire inconnu.'] } });
    await expect(
      transfererAccessoire(audio, mouvement(1, { centreDestinationId: d.centres.ferme.id })),
    ).rejects.toMatchObject({ erreurs: { centreDestinationId: ['Centre inconnu ou fermé.'] } });
  });

  it('la liste et l’export suivent le périmètre, et l’export se journalise', async () => {
    await entreeAccessoire(audio, mouvement(4));
    await entreeAccessoire(audio, mouvement(7, { centreId: d.centres.b.id }));
    expect(await listerStockAccessoires(assistantA, PERIMETRE_A())).toMatchObject([
      { centre: 'Centre A', accessoire: 'Piles 312', nature: 'PILE', quantite: 4 },
    ]);
    expect(await listerStockAccessoires(admin, { type: 'tous' })).toHaveLength(2);
    await expect(listerStockAccessoires(assistantB, PERIMETRE_A())).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    const csv = await lire(exporterStockAccessoires(admin, PERIMETRE_A()));
    expect(csv).toContain('Centre A;Piles 312;Piles;4');
    expect(csv).not.toContain('Centre B');
    expect(
      await prisma().journalAudit.count({
        where: { action: 'EXPORT', entiteType: 'STOCK_ACCESSOIRE' },
      }),
    ).toBe(1);
  });

  it('l’historique se limite aux centres du périmètre', async () => {
    await entreeAccessoire(audio, mouvement(4));
    await entreeAccessoire(audio, mouvement(7, { centreId: d.centres.b.id }));
    expect(await historiqueAccessoire(assistantB, PERIMETRE_B(), accessoireId)).toHaveLength(1);
    await expect(
      historiqueAccessoire(assistantB, PERIMETRE_A(), accessoireId),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });
});
