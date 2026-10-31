import path from 'node:path';

import type { FakeDocumentStore } from '@ha/adapters';
import { prisma } from '@ha/db/admin';
import { ajouterJours } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  creerCatalogueDevis,
  dossierJusquAchat,
  identifierCentreA,
  offre100,
  saisieDevis,
  SCAN,
  type CatalogueDevis,
  type Parcours,
} from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import {
  confirmerCouvertureAmo,
  enregistrerPec,
  lireJustificatifPec,
  listerAFacturer,
  modifierDateDelivrance,
  obtenirFacture,
} from './factures';
import { aujourdhui } from './patients';

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const VIDE = new Uint8Array(0);

let d: JeuDeDonnees;
let audio: UtilisateurConnecte;
let assistantA: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let catalogue: CatalogueDevis;

const stockage = () => stockageBrut() as FakeDocumentStore;
const centreA = () => ({ type: 'centre', centreId: d.centres.a.id }) as const;
const codes = (constats: readonly { code: string }[]) => constats.map((c) => c.code);

const dossierAFacturer = (parcours?: Parcours) => dossierJusquAchat(d, audio, catalogue, parcours);

const accord = (surcharge: Record<string, unknown> = {}) => ({
  statut: 'ACCORDEE',
  organisme: 'Mutuelle fictive',
  plateforme: 'Plateforme fictive',
  numeroAccord: 'ACC-001',
  montantAccorde: '712,40',
  datePec: aujourdhui(),
  ...surcharge,
});

async function detail(dossierId: string) {
  const facture = await obtenirFacture(audio, dossierId);
  if (!facture) {
    throw new Error('Facture attendue.');
  }
  return facture;
}

const erreursDe = async (dossierId: string) => codes((await detail(dossierId)).controle.erreurs);

beforeEach(async () => {
  await viderBase();
  stockage().objets.clear();
  d = await creerJeuDeDonnees();
  ({ audioAB: audio, assistantA, assistantB } = d.acteurs);
  await identifierCentreA(d);
  await importerLpp(V908);
  catalogue = await creerCatalogueDevis(d);
});

describe('préparation à l’achat', () => {
  it('ouvre la préparation sans vente, sans délivrance et sans numéro', async () => {
    const { dossierId, numeroSerie } = await dossierAFacturer();

    const ligne = await prisma().facturePreparee.findUniqueOrThrow({ where: { dossierId } });
    expect(ligne.dateDelivrance.toISOString().slice(0, 10)).toBe(aujourdhui());
    expect(Object.keys(ligne).filter((c) => /numero|encaiss|paiement/i.test(c))).toEqual([]);
    expect(await prisma().delivrance.count({ where: { dossierId } })).toBe(0);
    const appareil = await prisma().appareil.findFirstOrThrow({ where: { numeroSerie } });
    expect(appareil.statut).toBe('RESERVE');
    const journal = await prisma().journalAudit.count({
      where: { entiteType: 'FACTURE_PREPAREE', action: 'CREATE', entiteId: ligne.id },
    });
    expect(journal).toBe(1);
  });

  it('détaille l’aide et les piles de l’offre retenue', async () => {
    const { dossierId, numeroSerie } = await dossierAFacturer();
    const { facture } = await detail(dossierId);

    expect(facture?.lignes).toMatchObject([
      {
        nature: 'AIDE_AUDITIVE',
        oreille: 'DROITE',
        codePrestation: 'P1D',
        codeLpp: '2351057',
        codeLppGenerique: true,
        numeroSerie,
        prixTTC: 95_000,
        baseRemboursement: 40_000,
        amo: 24_000,
        amc: 0,
        resteACharge: 71_000,
      },
      {
        nature: 'PILE',
        oreille: null,
        codePrestation: 'PIL',
        numeroSerie: null,
        prixTTC: 600,
        baseRemboursement: 600,
        amo: 360,
        amc: 0,
        resteACharge: 240,
      },
    ]);
  });

  it('préfère le code spécifique relié au modèle', async () => {
    const tarif = await prisma().lppTarif.findFirstOrThrow({
      where: { naturePrestation: 'P1D', baseRemboursementCentimes: 40_000, finValidite: null },
      select: { code: true },
    });
    await prisma().modeleCodeLpp.create({
      data: { modeleId: catalogue.classeI, code: tarif.code },
    });
    const { dossierId } = await dossierAFacturer();

    const { facture, controle } = await detail(dossierId);
    expect(facture?.lignes[0]).toMatchObject({ codeLpp: tarif.code, codeLppGenerique: false });
    expect(controle.avertissements).not.toContainEqual({
      code: 'CODE_LPP_GENERIQUE',
      oreille: 'DROITE',
    });
  });

  it('calcule la C2S sans PEC, sur les codes de classe II', async () => {
    const { dossierId } = await dossierAFacturer({
      patient: { c2s: true },
      devis: {
        offres: [
          offre100(catalogue, {
            aideDroite: { modeleId: catalogue.classeI, prixAvantRemise: '800', prix: '800' },
            amcDroite: null,
            amcConsommables: null,
          }),
        ],
      },
    });
    const { facture, controle } = await detail(dossierId);

    expect(facture?.lignes[0]).toMatchObject({
      codePrestation: 'P2D',
      codeLpp: '2392530',
      amo: 24_000,
      amc: 56_000,
      resteACharge: 0,
    });
    expect(codes(controle.erreurs)).not.toContain('PEC_MANQUANTE');
  });
});

describe('contrôles', () => {
  it('bloque tant que la couverture et la PEC manquent, puis le dossier est prêt', async () => {
    const { dossierId } = await dossierAFacturer();

    expect(await erreursDe(dossierId)).toEqual(['COUVERTURE_AMO_A_CONFIRMER', 'PEC_MANQUANTE']);

    await enregistrerPec(assistantA, dossierId, { ...accord(), statut: 'DEMANDEE' }, VIDE);
    expect(await erreursDe(dossierId)).toContain('PEC_EN_ATTENTE');

    await confirmerCouvertureAmo(assistantA, dossierId);
    await enregistrerPec(assistantA, dossierId, accord(), SCAN);

    const facture = await detail(dossierId);
    expect(facture.etat).toBe('PRET');
    expect(facture.controle.erreurs).toEqual([]);
    expect(facture.facture?.totaux).toEqual({
      prixTTC: 95_600,
      amo: 24_360,
      amc: 71_240,
      resteACharge: 0,
    });
    expect(codes(facture.controle.avertissements)).not.toContain('ECART_AMO_DEVIS');
  });

  it('fait tomber la confirmation si la couverture change', async () => {
    const { dossierId, patientId } = await dossierAFacturer();
    await confirmerCouvertureAmo(audio, dossierId);
    expect(await erreursDe(dossierId)).not.toContain('COUVERTURE_AMO_A_CONFIRMER');

    await prisma().couvertureAmo.update({
      where: { patientId },
      data: { caisse: '751' },
    });

    expect(await erreursDe(dossierId)).toContain('COUVERTURE_AMO_A_CONFIRMER');
  });

  it('accepte une lecture Vitale récente, pas une lecture suivie d’une retouche', async () => {
    const { dossierId, patientId } = await dossierAFacturer();
    await prisma().couvertureAmo.update({
      where: { patientId },
      data: { origine: 'VITALE', derniereLectureVitale: new Date() },
    });
    expect(await erreursDe(dossierId)).not.toContain('COUVERTURE_AMO_A_CONFIRMER');

    await prisma().couvertureAmo.update({ where: { patientId }, data: { origine: 'SAISIE' } });
    expect(await erreursDe(dossierId)).toContain('COUVERTURE_AMO_A_CONFIRMER');
  });

  it('apprécie les droits à la date de délivrance', async () => {
    const { dossierId, patientId } = await dossierAFacturer();
    await prisma().couvertureAmo.update({
      where: { patientId },
      data: { finDroits: new Date('2020-01-01T00:00:00.000Z') },
    });
    expect(await erreursDe(dossierId)).toContain('DROITS_AMO_NON_OUVERTS');
  });

  it('relance le délai de renouvellement sur une délivrance reprise', async () => {
    const { dossierId, patientId } = await dossierAFacturer();
    await prisma().delivrance.create({
      data: {
        organisationId: d.organisation.id,
        patientId,
        oreille: 'DROITE',
        dateDelivrance: new Date(`${aujourdhui()}T00:00:00.000Z`),
        origine: 'REPRISE',
      },
    });
    expect(await erreursDe(dossierId)).toContain('RENOUVELLEMENT_AVANT_DELAI');
  });

  it('bloque un appareil sans numéro de série', async () => {
    const { dossierId } = await dossierAFacturer();
    await prisma().essaiAppareil.updateMany({
      where: { essai: { dossierId } },
      data: { retireLe: new Date(), retireParId: audio.id },
    });
    expect(await erreursDe(dossierId)).toContain('NUMERO_SERIE_MANQUANT');
  });

  it('bloque si la base LPP ne couvre pas la date de délivrance', async () => {
    const { dossierId } = await dossierAFacturer();
    await prisma().facturePreparee.update({
      where: { dossierId },
      data: { dateDelivrance: new Date('2020-01-01T00:00:00.000Z') },
    });
    const facture = await detail(dossierId);
    expect(facture.facture).toBeNull();
    expect(codes(facture.controle.erreurs)).toEqual(['TARIF_LPP_INDISPONIBLE']);
  });
});

describe('date de délivrance', () => {
  it('reste entre la signature et aujourd’hui', async () => {
    const { dossierId } = await dossierAFacturer();
    await expect(
      modifierDateDelivrance(audio, dossierId, {
        dateDelivrance: ajouterJours(aujourdhui(), 1),
      }),
    ).rejects.toThrow('La date de délivrance ne peut pas être future.');
    await expect(
      modifierDateDelivrance(audio, dossierId, { dateDelivrance: '2020-01-01' }),
    ).rejects.toThrow('La date de délivrance ne peut pas précéder la signature du devis.');

    await modifierDateDelivrance(assistantA, dossierId, { dateDelivrance: aujourdhui() });
    expect((await detail(dossierId)).dateDelivrance).toBe(aujourdhui());
  });
});

describe('prise en charge complémentaire', () => {
  it('valide la saisie et refuse un fichier illisible sans rien déposer', async () => {
    const { dossierId } = await dossierAFacturer();
    await expect(
      enregistrerPec(audio, dossierId, accord({ numeroAccord: '' }), VIDE),
    ).rejects.toBeInstanceOf(ErreurSaisie);
    const avant = stockage().objets.size;
    await expect(enregistrerPec(audio, dossierId, accord(), Buffer.from('texte'))).rejects.toThrow(
      'Le fichier doit être un PDF, un JPEG ou un PNG.',
    );
    expect(stockage().objets.size).toBe(avant);
  });

  it('chiffre le justificatif, journalise son ouverture et remplace l’ancien', async () => {
    const { dossierId } = await dossierAFacturer();
    const avant = stockage().objets.size;
    await enregistrerPec(audio, dossierId, accord(), SCAN);
    expect(stockage().objets.size).toBe(avant + 1);

    const { contenu, nomFichier } = await lireJustificatifPec(assistantA, dossierId);
    expect(Buffer.from(contenu).equals(SCAN)).toBe(true);
    expect(nomFichier).toBe('justificatif-pec.pdf');
    const { justificatifCle } = await prisma().priseEnCharge.findUniqueOrThrow({
      where: { dossierId },
    });
    const brut = await stockage().get(justificatifCle ?? '');
    expect(Buffer.from(brut).includes(SCAN)).toBe(false);
    const lectures = await prisma().journalAudit.count({
      where: { entiteType: 'FACTURE_PREPAREE', action: 'READ' },
    });
    expect(lectures).toBe(1);

    await enregistrerPec(audio, dossierId, accord({ montantAccorde: '700,00' }), VIDE);
    expect(stockage().objets.size).toBe(avant + 1);
    await enregistrerPec(audio, dossierId, accord(), SCAN);
    expect(stockage().objets.size).toBe(avant + 1);
  });

  it('retire le fichier déposé si la transaction échoue', async () => {
    const { dossierId } = await dossierAFacturer();
    const avant = stockage().objets.size;
    await prisma().$executeRawUnsafe(
      `CREATE FUNCTION panne_test() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'panne'; END; $$ LANGUAGE plpgsql`,
    );
    await prisma().$executeRawUnsafe(
      `CREATE TRIGGER panne_test BEFORE INSERT ON "prise_en_charge" FOR EACH ROW EXECUTE FUNCTION panne_test()`,
    );
    try {
      await expect(enregistrerPec(audio, dossierId, accord(), SCAN)).rejects.toThrow();
    } finally {
      await prisma().$executeRawUnsafe('DROP TRIGGER panne_test ON "prise_en_charge"');
      await prisma().$executeRawUnsafe('DROP FUNCTION panne_test');
    }
    expect(stockage().objets.size).toBe(avant);
  });

  it('refuse un dossier sorti de la file, et lit un justificatif absent comme un refus', async () => {
    const { dossierId } = await dossierAFacturer();
    await expect(lireJustificatifPec(audio, dossierId)).rejects.toBeInstanceOf(AccesRefuseError);
    await prisma().dossier.update({ where: { id: dossierId }, data: { statut: 'FACTURE' } });

    await expect(enregistrerPec(audio, dossierId, accord(), VIDE)).rejects.toThrow(
      'Ce dossier n’est plus à facturer.',
    );
    expect(await obtenirFacture(audio, dossierId)).toBeNull();
  });
});

describe('droits et file par centre', () => {
  it('refuse un autre centre, côté serveur', async () => {
    const { dossierId } = await dossierAFacturer();
    await expect(obtenirFacture(assistantB, dossierId)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(enregistrerPec(assistantB, dossierId, accord(), VIDE)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(confirmerCouvertureAmo(assistantB, dossierId)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    await expect(
      modifierDateDelivrance(assistantB, dossierId, { dateDelivrance: aujourdhui() }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(lireJustificatifPec(assistantB, dossierId)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('sépare les dossiers prêts et bloqués, avec leur motif, sans ouvrir de dossier', async () => {
    const bloque = await dossierAFacturer();
    const pret = await dossierAFacturer();
    await confirmerCouvertureAmo(audio, pret.dossierId);
    await enregistrerPec(audio, pret.dossierId, { statut: 'SANS_TIERS_PAYANT' }, VIDE);
    const lectures = () => prisma().journalAudit.count({ where: { action: 'READ' } });
    const avant = await lectures();

    const file = await listerAFacturer(assistantA, centreA(), { etat: 'BLOQUE' });
    expect(file.compteurs).toEqual({ PRET: 1, BLOQUE: 1 });
    expect(file.lignes.map((l) => l.dossierId)).toEqual([bloque.dossierId]);
    expect(codes(file.lignes[0]?.erreurs ?? [])).toEqual([
      'COUVERTURE_AMO_A_CONFIRMER',
      'PEC_MANQUANTE',
    ]);

    const prets = await listerAFacturer(assistantA, centreA(), {});
    expect(prets.lignes.map((l) => l.dossierId)).toEqual([pret.dossierId]);
    expect(prets.lignes[0]).toMatchObject({ prixTTC: 95_600, resteACharge: 71_240 });
    expect(await lectures()).toBe(avant);
  });

  it('cloisonne la file : rien pour le centre B, tout pour l’ADMIN_CLIENT', async () => {
    await dossierAFacturer();
    const centreB = { type: 'centre', centreId: d.centres.b.id } as const;

    const b = await listerAFacturer(assistantB, centreB, { etat: 'BLOQUE' });
    expect(b.compteurs).toEqual({ PRET: 0, BLOQUE: 0 });
    await expect(listerAFacturer(assistantB, centreA(), {})).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
    const tous = await listerAFacturer(d.acteurs.admin, { type: 'tous' }, { etat: 'BLOQUE' });
    expect(tous.lignes).toHaveLength(1);
  });
});
