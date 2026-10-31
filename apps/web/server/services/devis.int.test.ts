import path from 'node:path';

import type { FakeDocumentStore, FakePdfRenderer } from '@ha/adapters';
import { prisma } from '@ha/db';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { base } from '../chiffrement';
import { stockageBrut } from '../documents';
import { ErreurSaisie } from '../erreurs';
import { importerLpp } from '../lpp/importer';
import { rendeurPdf } from '../pdf';
import {
  creerDevis,
  creerNouvelleVersion,
  demarrerEssai,
  deposerScanDevis,
  donneesFormulaireDevis,
  emettreDevis,
  enregistrerSignature,
  ErreurDevisBloque,
  imprimerDevis,
  lireScanDevis,
  listerDevisDuDossier,
  modifierDevis,
  obtenirDevis,
  supprimerBrouillon,
} from './devis';
import {
  creerDossier,
  enregistrerPrescription,
  ErreurConflitDossier,
  obtenirDossier,
} from './dossiers';
import { aujourdhui } from './patients';

const V908 = path.join(import.meta.dirname, '../../../../fixtures/lpp/908');
const SCAN = Buffer.from('%PDF-1.7 document fictif', 'utf8');
const NIR = '150037500000042';
const CODE_PILES = '2332976';

let d: JeuDeDonnees;
let admin: UtilisateurConnecte;
let audio: UtilisateurConnecte;
let assistantA: UtilisateurConnecte;
let assistantB: UtilisateurConnecte;
let patientId: string;
let dossierId: string;
let classeI: string;
let classeII: string;
let piles: string;
let kit: string;

const stockage = () => stockageBrut() as FakeDocumentStore;
const rendu = () => rendeurPdf() as FakePdfRenderer;

async function creerCatalogue() {
  const fabricant = await prisma().fabricant.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Acoustia Démo',
      adresse: '1 rue de l’Exemple, 75000 Paris',
    },
  });
  const fiche = {
    organisationId: d.organisation.id,
    fabricantId: fabricant.id,
    gamme: 'Aurore',
    type: 'CONTOUR',
    prixConseilleCentimes: 95_000,
    marque: 'Acoustia',
    referenceCommerciale: 'AU-1',
    nombreCanaux: 12,
    connectivite: 'Bluetooth',
    antiLarsen: true,
    reducteurAcouphenes: true,
    bobineT: true,
  } as const;
  const [i, ii, p, k] = await Promise.all([
    prisma().modeleAideAuditive.create({
      data: {
        ...fiche,
        nom: 'Essentiel',
        classe: 'CLASSE_I',
        options: ['REDUCTEUR_ACOUPHENE', 'CONNECTIVITE_SANS_FIL', 'REDUCTEUR_BRUIT_VENT'],
      },
    }),
    prisma().modeleAideAuditive.create({ data: { ...fiche, nom: 'Premium', classe: 'CLASSE_II' } }),
    prisma().accessoire.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Piles 13',
        nature: 'PILE',
        codeLpp: CODE_PILES,
        prixCentimes: 150,
        marque: 'Rayonac',
        referenceCommerciale: 'RAY-13',
      },
    }),
    prisma().accessoire.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'Kit d’entretien',
        nature: 'ACCESSOIRE',
        prixCentimes: 1_500,
        marque: 'Acoustia',
        referenceCommerciale: 'KIT-1',
      },
    }),
  ]);
  classeI = i.id;
  classeII = ii.id;
  piles = p.id;
  kit = k.id;
}

async function creerPatient(surcharge: { dateNaissance?: string; c2s?: boolean } = {}) {
  const { dateNaissance = '1950-03-15', c2s = false } = surcharge;
  const patient = await prisma().patient.create({
    data: {
      organisationId: d.organisation.id,
      centreId: d.centres.a.id,
      civilite: 'MME',
      nomNaissance: 'Essai',
      prenoms: 'Camille',
      dateNaissance: new Date(`${dateNaissance}T00:00:00.000Z`),
      sexe: 'FEMININ',
      nomNaissanceRecherche: 'ESSAI',
      prenomsRecherche: 'CAMILLE',
    },
  });
  await base().couvertureAmo.create({
    data: {
      patientId: patient.id,
      nir: NIR,
      nirEmpreinte: patient.id.replace(/-/g, '').padEnd(64, '0').slice(0, 64),
      rangNaissance: 1,
      qualite: 'ASSURE',
      c2s,
      ald: 'NON',
      origine: 'SAISIE',
    },
  });
  return patient.id;
}

async function creerDossierPret(id: string, oreilles: 'DROITE' | 'LES_DEUX' = 'DROITE') {
  const dossier = await creerDossier(audio, id, {
    centreId: d.centres.a.id,
    praticienId: d.praticiens.praticienAB.id,
    oreilles,
    typeDroite: 'PRIMO',
    typeGauche: oreilles === 'LES_DEUX' ? 'PRIMO' : '',
    surdicecite: false,
  });
  const prescripteur = await prisma().prescripteur.create({
    data: {
      organisationId: d.organisation.id,
      nom: 'Démo',
      prenom: 'Agathe',
      specialite: 'ORL',
      nomRecherche: 'DEMO',
      prenomRecherche: 'AGATHE',
    },
  });
  await enregistrerPrescription(
    audio,
    dossier,
    {
      prescripteurId: prescripteur.id,
      datePrescription: aujourdhui(),
      oreilles,
      mentionRenouvellement: false,
      statutAttendu: 'BROUILLON',
      forcer: false,
      motifForcage: '',
    },
    SCAN,
  );
  return dossier;
}

function offre100(surcharge: Record<string, unknown> = {}) {
  return {
    rubrique: 'OFFRE_100_SANTE',
    aideDroite: { modeleId: classeI, prixAvantRemise: '950,00', prix: '950,00' },
    aideGauche: null,
    consommables: [{ accessoireId: piles, quantite: 4, prixAvantRemise: '1,50', prix: '1,50' }],
    amcDroite: '710,00',
    amcGauche: null,
    amcConsommables: '2,40',
    ...surcharge,
  };
}

function autreOffre() {
  return {
    rubrique: 'AUTRE_OFFRE',
    aideDroite: { modeleId: classeII, prixAvantRemise: '1 900,00', prix: '1 800,00' },
    aideGauche: null,
    consommables: [{ accessoireId: kit, quantite: 1, prixAvantRemise: '15,00', prix: '15,00' }],
    amcDroite: null,
    amcGauche: null,
    amcConsommables: null,
  };
}

function saisieDevis(surcharge: Record<string, unknown> = {}) {
  return {
    lieuEmission: 'Paris',
    validiteMois: 2,
    tauxAmo: 60,
    refusOffreC2S: false,
    contratResponsable: true,
    bobineTPresentee: true,
    ficheTechniqueJointe: true,
    depotGarantie: '',
    datePrecedentDroite: '',
    datePrecedentGauche: '',
    offres: [offre100(), autreOffre()],
    statutAttendu: 'PRESCRIPTION_OK',
    ...surcharge,
  };
}

async function devisEmis(acteur = audio) {
  const devisId = await creerDevis(acteur, dossierId, saisieDevis());
  await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' });
  return devisId;
}

async function devisSigne() {
  const devisId = await devisEmis();
  await demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'OFFRE_100_SANTE' });
  await deposerScanDevis(assistantA, devisId, { statutAttendu: 'EMIS' }, SCAN);
  await enregistrerSignature(audio, devisId, {
    statutAttendu: 'EMIS',
    offreRetenue: 'OFFRE_100_SANTE',
    dateSignature: aujourdhui(),
    signe: true,
  });
  return devisId;
}

async function statutDossier(id = dossierId) {
  const { statut } = await prisma().dossier.findUniqueOrThrow({ where: { id } });
  return statut;
}

function lignesAudit(action: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'PRINT') {
  return prisma().journalAudit.findMany({
    where: { entiteType: 'DEVIS', action },
    orderBy: { horodatage: 'asc' },
  });
}

beforeAll(async () => {
  await viderBase();
});

beforeEach(async () => {
  await viderBase();
  stockage().objets.clear();
  rendu().rendus.length = 0;
  d = await creerJeuDeDonnees();
  admin = d.acteurs.admin;
  audio = d.acteurs.audioAB;
  assistantA = d.acteurs.assistantA;
  assistantB = d.acteurs.assistantB;
  await prisma().centre.update({
    where: { id: d.centres.a.id },
    data: {
      raisonSociale: 'Audition Démo SAS',
      siret: '00000000000000',
      rcs: 'RCS Démo 000 000 000',
      finess: '000000000',
      tvaIntracommunautaire: 'FR00000000000',
    },
  });
  await importerLpp(V908);
  await creerCatalogue();
  patientId = await creerPatient();
  dossierId = await creerDossierPret(patientId);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rédaction', () => {
  it('crée la première version avec un numéro et un instantané du catalogue', async () => {
    const devisId = await creerDevis(assistantA, dossierId, saisieDevis());

    const devis = await obtenirDevis(assistantA, devisId);
    expect(devis.numero).toMatch(/^\d{4}-000001$/);
    expect(devis).toMatchObject({ version: 1, statut: 'BROUILLON', tarifsAbsents: false });
    expect(devis.offres[0]?.aides[0]?.designation.modele).toBe('Essentiel');
    expect(await lignesAudit('CREATE')).toHaveLength(1);
    expect(await statutDossier()).toBe('PRESCRIPTION_OK');
  });

  it('calcule le brouillon : plafond, base, AMO, AMC, reste et garantie', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    const { calcul, erreurs } = await obtenirDevis(audio, devisId);

    expect(erreurs).toEqual([]);
    expect(calcul?.offres[0]?.droite).toMatchObject({
      plafond: 95_000,
      base: 40_000,
      amo: 24_000,
      amc: 71_000,
      resteACharge: 0,
    });
    expect(calcul?.offres[0]?.consommables).toMatchObject({ ttc: 600, amo: 360, amc: 240 });
    expect(calcul?.offres[1]?.droite).toMatchObject({ plafond: null, amc: null });
    expect(calcul?.finGarantieMinimale).toBeTruthy();
  });

  it('numérote à la suite par organisation', async () => {
    const autre = await creerDossierPret(await creerPatient());
    await creerDevis(audio, dossierId, saisieDevis());
    const devisId = await creerDevis(audio, autre, saisieDevis());
    expect((await obtenirDevis(audio, devisId)).numero).toMatch(/-000002$/);
  });

  it('refuse un second devis sur le dossier : il faut une version', async () => {
    await creerDevis(audio, dossierId, saisieDevis());
    await expect(creerDevis(audio, dossierId, saisieDevis())).rejects.toThrow(/nouvelle version/);
  });

  it('refuse une oreille que le dossier n’appareille pas', async () => {
    const offres = [
      offre100({ aideGauche: { modeleId: classeI, prixAvantRemise: '950', prix: '950' } }),
    ];
    await expect(creerDevis(audio, dossierId, saisieDevis({ offres }))).rejects.toThrow(
      ErreurSaisie,
    );
  });

  it('refuse un modèle ou un article hors catalogue', async () => {
    const inconnu = '019a0000-0000-7000-8000-000000000999';
    await expect(
      creerDevis(
        audio,
        dossierId,
        saisieDevis({
          offres: [
            offre100({ aideDroite: { modeleId: inconnu, prixAvantRemise: '1', prix: '1' } }),
          ],
        }),
      ),
    ).rejects.toThrow('Modèle inconnu.');
    await expect(
      creerDevis(
        audio,
        dossierId,
        saisieDevis({
          offres: [
            offre100({
              consommables: [
                { accessoireId: inconnu, quantite: 1, prixAvantRemise: '1', prix: '1' },
              ],
            }),
          ],
        }),
      ),
    ).rejects.toThrow('Article inconnu.');
  });

  it('refuse un dossier sans prescription', async () => {
    const dossier = await creerDossier(audio, patientId, {
      centreId: d.centres.a.id,
      praticienId: d.praticiens.praticienAB.id,
      oreilles: 'DROITE',
      typeDroite: 'PRIMO',
      typeGauche: '',
      surdicecite: false,
    });
    await expect(
      creerDevis(audio, dossier, saisieDevis({ statutAttendu: 'BROUILLON' })),
    ).rejects.toThrow(/n’accepte pas de devis/);
  });

  it('remplace le contenu d’un brouillon et conserve son numéro', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    const { numero } = await obtenirDevis(audio, devisId);

    await modifierDevis(
      assistantA,
      devisId,
      saisieDevis({ offres: [offre100({ amcDroite: '100,00' })], lieuEmission: 'Lyon' }),
    );

    const devis = await obtenirDevis(audio, devisId);
    expect(devis).toMatchObject({ numero, lieuEmission: 'Lyon' });
    expect(devis.offres).toHaveLength(1);
    expect(devis.offres[0]?.amcDroite).toBe(10_000);
  });

  it('supprime un brouillon, journalisé', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await expect(supprimerBrouillon(audio, devisId, { statutAttendu: 'BROUILLON' })).resolves.toBe(
      dossierId,
    );
    expect(await prisma().devisLigne.count()).toBe(0);
    expect(await lignesAudit('DELETE')).toHaveLength(1);
  });

  it('préremplit le formulaire depuis le catalogue et les délivrances', async () => {
    await prisma().delivrance.createMany({
      data: ['2018-01-10', '2019-05-02'].map((date) => ({
        organisationId: d.organisation.id,
        patientId,
        oreille: 'DROITE' as const,
        dateDelivrance: new Date(`${date}T00:00:00.000Z`),
        origine: 'REPRISE' as const,
      })),
    });
    const donnees = await donneesFormulaireDevis(audio, dossierId);
    expect(donnees).toMatchObject({
      oreilles: ['DROITE'],
      lieuParDefaut: 'Paris',
      datePrecedentDroite: '2019-05-02',
      datePrecedentGauche: null,
      c2s: false,
    });
    expect(donnees.modeles.map((m) => m.classe)).toEqual(['CLASSE_I', 'CLASSE_II']);
    expect(donnees.articles).toHaveLength(2);
  });

  it('signale les tarifs absents sans bloquer la rédaction', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await prisma().lppTarif.deleteMany();

    const devis = await obtenirDevis(audio, devisId);
    expect(devis).toMatchObject({ tarifsAbsents: true, calcul: null });
    await expect(emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' })).rejects.toThrow(
      /importer la base LPP/,
    );
  });
});

describe('droits et cloisonnement', () => {
  it('refuse un utilisateur hors du centre', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await expect(obtenirDevis(assistantB, devisId)).rejects.toThrow(AccesRefuseError);
    await expect(creerDevis(assistantB, dossierId, saisieDevis())).rejects.toThrow(
      AccesRefuseError,
    );
    await expect(listerDevisDuDossier(assistantB, dossierId)).rejects.toThrow(AccesRefuseError);
  });

  it('réserve l’émission et la signature à l’ADMIN et à l’AUDIO', async () => {
    const devisId = await creerDevis(assistantA, dossierId, saisieDevis());
    await expect(emettreDevis(assistantA, devisId, { statutAttendu: 'BROUILLON' })).rejects.toThrow(
      AccesRefuseError,
    );
    expect((await obtenirDevis(assistantA, devisId)).actions).toMatchObject({
      modifier: true,
      emettre: false,
    });

    await emettreDevis(admin, devisId, { statutAttendu: 'BROUILLON' });
    await demarrerEssai(assistantA, devisId, {
      statutAttendu: 'EMIS',
      offreEssai: 'OFFRE_100_SANTE',
    });
    await deposerScanDevis(assistantA, devisId, { statutAttendu: 'EMIS' }, SCAN);
    expect((await obtenirDevis(assistantA, devisId)).actions.signer).toBe(false);
    await expect(
      enregistrerSignature(assistantA, devisId, {
        statutAttendu: 'EMIS',
        offreRetenue: 'OFFRE_100_SANTE',
        dateSignature: aujourdhui(),
        signe: true,
      }),
    ).rejects.toThrow(AccesRefuseError);
  });
});

describe('émission', () => {
  it('bloque un dépassement du prix limite : rien n’est écrit', async () => {
    const devisId = await creerDevis(
      audio,
      dossierId,
      saisieDevis({
        offres: [
          offre100({
            aideDroite: { modeleId: classeI, prixAvantRemise: '950,01', prix: '950,01' },
          }),
        ],
      }),
    );

    const erreur = await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' }).catch(
      (e: unknown) => e,
    );

    expect(erreur).toBeInstanceOf(ErreurDevisBloque);
    expect((erreur as ErreurDevisBloque).controle.erreurs).toEqual([
      { code: 'PRIX_SUPERIEUR_PRIX_LIMITE', oreille: 'DROITE' },
    ]);
    expect(stockage().objets.size).toBe(1);
    expect(rendu().rendus).toHaveLength(0);
    expect((await obtenirDevis(audio, devisId)).statut).toBe('BROUILLON');
    expect(await statutDossier()).toBe('PRESCRIPTION_OK');
  });

  it.each([
    {
      cas: 'bobine T',
      surcharge: { bobineTPresentee: false },
      code: 'BOBINE_T_NON_PRESENTEE',
    },
    {
      cas: 'fiche technique',
      surcharge: { ficheTechniqueJointe: false },
      code: 'FICHE_TECHNIQUE_MANQUANTE',
    },
    { cas: 'validité', surcharge: { validiteMois: 1 }, code: 'VALIDITE_DEVIS_INSUFFISANTE' },
  ])('bloque : $cas', async ({ surcharge, code }) => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis(surcharge));
    await expect(
      emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' }),
    ).rejects.toMatchObject({ controle: { erreurs: [expect.objectContaining({ code })] } });
  });

  it('bloque un centre sans raison sociale ni SIRET', async () => {
    await prisma().centre.update({
      where: { id: d.centres.a.id },
      data: { raisonSociale: null, siret: null },
    });
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await expect(
      emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' }),
    ).rejects.toMatchObject({
      controle: { erreurs: [{ code: 'IDENTIFICATION_ENTREPRISE_INCOMPLETE', oreille: null }] },
    });
  });

  it('bloque le C2S au-dessus de 800 €, et accepte le refus de l’offre', async () => {
    const id = await creerDossierPret(await creerPatient({ c2s: true }));
    const devisId = await creerDevis(audio, id, saisieDevis());
    await expect(
      emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' }),
    ).rejects.toMatchObject({
      controle: {
        erreurs: [{ code: 'PRIX_SUPERIEUR_PLAFOND_C2S', oreille: 'DROITE' }],
      },
    });

    await modifierDevis(audio, devisId, saisieDevis({ refusOffreC2S: true }));
    await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' });
    const devis = await obtenirDevis(audio, devisId);
    expect(devis.avertissements).toContainEqual({
      code: 'DEPASSEMENT_C2S_A_MENTIONNER',
      oreille: 'DROITE',
    });
  });

  it('moins de 20 ans : prix limite de 1 400 €', async () => {
    const naissance = `${String(Number(aujourdhui().slice(0, 4)) - 10)}-01-15`;
    const id = await creerDossierPret(await creerPatient({ dateNaissance: naissance }));
    const devisId = await creerDevis(
      audio,
      id,
      saisieDevis({
        offres: [
          offre100({
            aideDroite: { modeleId: classeI, prixAvantRemise: '1 400,00', prix: '1 400,00' },
            amcDroite: '560,00',
          }),
        ],
      }),
    );
    await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' });
    const { calcul } = await obtenirDevis(audio, devisId);
    expect(calcul?.offres[0]?.droite).toMatchObject({
      plafond: 140_000,
      base: 140_000,
      amo: 84_000,
      amc: 56_000,
      resteACharge: 0,
    });
  });

  it('fige le devis, rend le PDF, chiffre le document et passe le dossier en DEVIS_EMIS', async () => {
    const devisId = await devisEmis();

    const devis = await obtenirDevis(audio, devisId);
    expect(devis.statut).toBe('EMIS');
    expect(devis.dateEmission).toBe(aujourdhui());
    expect(devis.actions).toMatchObject({ modifier: false, emettre: false, imprimer: true });
    expect(await statutDossier()).toBe('DEVIS_EMIS');

    const [html] = rendu().rendus;
    expect(html).toContain(NIR);
    expect(html).toContain('Camille Essai');

    const ligne = await prisma().devis.findUniqueOrThrow({ where: { id: devisId } });
    const brut = stockage().objets.get(ligne.pdfCle ?? '');
    expect(Buffer.from(brut ?? []).includes('%PDF')).toBe(false);
    expect(JSON.stringify(ligne.totaux)).not.toContain(NIR);
    expect(JSON.stringify(ligne.controles)).not.toContain(NIR);
  });

  it('ne journalise jamais le NIR', async () => {
    const devisId = await devisEmis();
    await imprimerDevis(audio, devisId);
    const lignes = await prisma().journalAudit.findMany();
    expect(JSON.stringify(lignes)).not.toContain(NIR);
  });

  it('garde les montants émis si la LPP change', async () => {
    const devisId = await devisEmis();
    await prisma().lppTarif.deleteMany();
    const { calcul, tarifsAbsents } = await obtenirDevis(audio, devisId);
    expect(tarifsAbsents).toBe(false);
    expect(calcul?.offres[0]?.droite?.amo).toBe(24_000);
  });

  it('garde l’instantané si le catalogue change', async () => {
    const devisId = await devisEmis();
    await prisma().modeleAideAuditive.update({ where: { id: classeI }, data: { marque: 'Autre' } });
    expect((await obtenirDevis(audio, devisId)).offres[0]?.aides[0]?.designation.marque).toBe(
      'Acoustia',
    );
  });

  it('fige la prescription', async () => {
    await devisEmis();
    const { prescriptionModifiable } = await obtenirDossier(audio, dossierId);
    expect(prescriptionModifiable).toBe(false);
  });

  it('deux émissions simultanées : une seule passe, le PDF perdant est retiré', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    const resultats = await Promise.allSettled([
      emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' }),
      emettreDevis(admin, devisId, { statutAttendu: 'BROUILLON' }),
    ]);

    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const echec = resultats.find((r) => r.status === 'rejected');
    expect(echec?.reason).toBeInstanceOf(ErreurConflitDossier);
    expect(await lignesAudit('UPDATE')).toHaveLength(1);
    const cles = [...stockage().objets.keys()];
    expect(cles.filter((c) => c.startsWith('devis/'))).toHaveLength(1);
  });

  it('refuse d’émettre deux fois', async () => {
    const devisId = await devisEmis();
    await expect(emettreDevis(audio, devisId, { statutAttendu: 'EMIS' })).rejects.toThrow(
      'Ce devis est déjà émis.',
    );
    await expect(emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' })).rejects.toThrow(
      ErreurConflitDossier,
    );
  });

  it('exige la couverture AMO : le devis porte le NIR', async () => {
    await prisma().couvertureAmo.delete({ where: { patientId } });
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await expect(emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' })).rejects.toThrow(
      /couverture AMO/,
    );
  });
});

describe('impression', () => {
  it('rend le PDF déposé, une ligne PRINT à chaque ouverture', async () => {
    const devisId = await devisEmis();
    const premier = await imprimerDevis(assistantA, devisId);
    await imprimerDevis(audio, devisId);

    expect(Buffer.from(premier.contenu).toString('latin1')).toMatch(/^%PDF/);
    expect(premier.type).toBe('application/pdf');
    expect(premier.nomFichier).toMatch(/^devis-\d{4}-000001-v1\.pdf$/);
    expect(await lignesAudit('PRINT')).toHaveLength(2);
    expect(rendu().rendus).toHaveLength(1);
  });

  it('refuse un brouillon et un utilisateur hors centre', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await expect(imprimerDevis(audio, devisId)).rejects.toThrow(/Émettre le devis/);
    await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' });
    await expect(imprimerDevis(assistantB, devisId)).rejects.toThrow(AccesRefuseError);
  });
});

describe('gel en base', () => {
  it('refuse de changer le contenu d’un devis émis', async () => {
    const devisId = await devisEmis();
    await expect(
      prisma().devis.update({ where: { id: devisId }, data: { tauxAmo: 85 } }),
    ).rejects.toThrow(/figé/);
    await expect(prisma().devis.delete({ where: { id: devisId } })).rejects.toThrow(/figé/);
    await expect(
      prisma().devisLigne.updateMany({ data: { prixUnitaireCentimes: 1 } }),
    ).rejects.toThrow(/figé/);
    await expect(prisma().devisLigne.deleteMany()).rejects.toThrow(/figé/);
    await expect(prisma().devisOffre.deleteMany()).rejects.toThrow(/figé/);
  });

  it('refuse toute modification d’un devis signé, signature comprise', async () => {
    const devisId = await devisSigne();
    await expect(
      prisma().devis.update({ where: { id: devisId }, data: { offreRetenue: 'AUTRE_OFFRE' } }),
    ).rejects.toThrow(/figé/);
    await expect(prisma().signatureDevis.deleteMany()).rejects.toThrow(/ajout seul/);
  });

  it('un brouillon reste modifiable', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis());
    await prisma().devis.update({ where: { id: devisId }, data: { tauxAmo: 85 } });
    expect((await obtenirDevis(audio, devisId)).tauxAmo).toBe(85);
  });

  it('une seule version en vigueur, un seul brouillon', async () => {
    const devisId = await devisEmis();
    await creerNouvelleVersion(audio, devisId, { statutAttendu: 'EMIS' });
    await expect(creerNouvelleVersion(audio, devisId, { statutAttendu: 'EMIS' })).rejects.toThrow(
      /déjà en cours/,
    );
  });
});

describe('versions', () => {
  it('une modification d’un devis émis crée v2, v1 reste en vigueur jusqu’à l’émission', async () => {
    const v1 = await devisEmis();
    const v2 = await creerNouvelleVersion(audio, v1, { statutAttendu: 'EMIS' });

    const brouillon = await obtenirDevis(audio, v2);
    expect(brouillon).toMatchObject({ version: 2, statut: 'BROUILLON' });
    expect(brouillon.numero).toBe((await obtenirDevis(audio, v1)).numero);
    expect((await obtenirDevis(audio, v1)).statut).toBe('EMIS');

    await modifierDevis(
      audio,
      v2,
      saisieDevis({ statutAttendu: 'DEVIS_EMIS', lieuEmission: 'Lyon' }),
    );
    await emettreDevis(audio, v2, { statutAttendu: 'BROUILLON' });

    expect((await obtenirDevis(audio, v1)).statut).toBe('REMPLACE');
    expect((await obtenirDevis(audio, v2)).statut).toBe('EMIS');
    expect(await statutDossier()).toBe('DEVIS_EMIS');
    expect((await listerDevisDuDossier(audio, dossierId)).map((v) => v.version)).toEqual([2, 1]);
  });

  it('modifier directement un devis émis est refusé', async () => {
    const v1 = await devisEmis();
    await expect(
      modifierDevis(audio, v1, saisieDevis({ statutAttendu: 'DEVIS_EMIS' })),
    ).rejects.toThrow(/nouvelle version/);
    await expect(supprimerBrouillon(audio, v1, { statutAttendu: 'EMIS' })).rejects.toThrow(
      /ne se supprime pas/,
    );
  });

  it('une version après signature rouvre l’essai, et la signature reste à recueillir', async () => {
    const v1 = await devisSigne();
    expect(await statutDossier()).toBe('DEVIS_SIGNE');

    const v2 = await creerNouvelleVersion(audio, v1, { statutAttendu: 'SIGNE' });
    expect(await statutDossier()).toBe('DEVIS_SIGNE');
    expect((await obtenirDevis(audio, v2)).offreEssai).toBe('OFFRE_100_SANTE');

    await emettreDevis(audio, v2, { statutAttendu: 'BROUILLON' });

    expect(await statutDossier()).toBe('EN_ESSAI');
    expect((await obtenirDevis(audio, v1)).statut).toBe('REMPLACE');
    expect((await obtenirDevis(audio, v1)).signature).not.toBeNull();
    expect((await obtenirDevis(audio, v2)).signature).toBeNull();
    expect((await obtenirDevis(audio, v2)).actions.deposerScan).toBe(true);
  });

  it('plus de nouvelle version une fois le dossier à facturer', async () => {
    const v1 = await devisSigne();
    await prisma().dossier.update({ where: { id: dossierId }, data: { statut: 'A_FACTURER' } });
    await expect(creerNouvelleVersion(audio, v1, { statutAttendu: 'SIGNE' })).rejects.toThrow(
      /ne peut plus changer/,
    );
  });

  it('un brouillon v2 se supprime, v1 reste', async () => {
    const v1 = await devisEmis();
    const v2 = await creerNouvelleVersion(audio, v1, { statutAttendu: 'EMIS' });
    await supprimerBrouillon(audio, v2, { statutAttendu: 'BROUILLON' });
    expect((await listerDevisDuDossier(audio, dossierId)).map((v) => v.version)).toEqual([1]);
  });
});

describe('essai et signature', () => {
  it('l’essai précède la signature : pas de dépôt ni de signature avant', async () => {
    const devisId = await devisEmis();
    await expect(deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN)).rejects.toThrow(
      /issue de l’essai/,
    );
    await expect(
      enregistrerSignature(audio, devisId, {
        statutAttendu: 'EMIS',
        offreRetenue: 'OFFRE_100_SANTE',
        dateSignature: aujourdhui(),
        signe: true,
      }),
    ).rejects.toThrow(/issue de l’essai/);
  });

  it('démarre l’essai sur l’offre choisie', async () => {
    const devisId = await devisEmis();
    await demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'AUTRE_OFFRE' });

    expect(await statutDossier()).toBe('EN_ESSAI');
    expect((await obtenirDevis(audio, devisId)).offreEssai).toBe('AUTRE_OFFRE');
    await expect(
      demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'AUTRE_OFFRE' }),
    ).rejects.toThrow(/devis émis/);
  });

  it('refuse une offre absente du devis', async () => {
    const devisId = await creerDevis(audio, dossierId, saisieDevis({ offres: [offre100()] }));
    await emettreDevis(audio, devisId, { statutAttendu: 'BROUILLON' });
    await expect(
      demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'AUTRE_OFFRE' }),
    ).rejects.toThrow('Cette offre ne figure pas au devis.');
  });

  it('exige le scan, la case signé et une date cohérente', async () => {
    const devisId = await devisEmis();
    await demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'OFFRE_100_SANTE' });
    const saisie = {
      statutAttendu: 'EMIS',
      offreRetenue: 'OFFRE_100_SANTE',
      dateSignature: aujourdhui(),
      signe: true,
    };

    await expect(enregistrerSignature(audio, devisId, saisie)).rejects.toThrow(/Déposer d’abord/);
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);
    await expect(enregistrerSignature(audio, devisId, { ...saisie, signe: false })).rejects.toThrow(
      ErreurSaisie,
    );
    await expect(
      enregistrerSignature(audio, devisId, { ...saisie, dateSignature: '2000-01-01' }),
    ).rejects.toThrow(/entre l’émission et aujourd’hui/);
    await expect(
      enregistrerSignature(audio, devisId, { ...saisie, dateSignature: '2999-01-01' }),
    ).rejects.toThrow(/entre l’émission et aujourd’hui/);
  });

  it('un nouveau dépôt remplace le scan précédent', async () => {
    const devisId = await devisEmis();
    await demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'OFFRE_100_SANTE' });
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);
    const cles = [...stockage().objets.keys()].filter((c) => c.startsWith('devis-signes/'));
    expect(cles).toHaveLength(1);
  });

  it('refuse un fichier qui n’est pas un scan', async () => {
    const devisId = await devisEmis();
    await demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'OFFRE_100_SANTE' });
    await expect(
      deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, new Uint8Array(0)),
    ).rejects.toThrow('Joindre le devis signé scanné.');
    await expect(
      deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, Buffer.from('texte')),
    ).rejects.toThrow(/PDF, un JPEG ou un PNG/);
  });

  it('fige le devis signé, garde le scan chiffré et passe le dossier en DEVIS_SIGNE', async () => {
    const devisId = await devisSigne();

    const devis = await obtenirDevis(audio, devisId);
    expect(devis).toMatchObject({
      statut: 'SIGNE',
      offreRetenue: 'OFFRE_100_SANTE',
      scanDepose: true,
    });
    expect(devis.signature?.dateSignature).toBe(aujourdhui());
    expect(devis.actions).toMatchObject({ signer: false, nouvelleVersion: true });
    expect(await statutDossier()).toBe('DEVIS_SIGNE');

    const signature = await prisma().signatureDevis.findUniqueOrThrow({ where: { devisId } });
    expect(signature).toMatchObject({ mode: 'SCAN', preuve: null });
    const brut = stockage().objets.get(signature.scanCle ?? '');
    expect(Buffer.from(brut ?? []).includes('%PDF')).toBe(false);

    const scan = await lireScanDevis(audio, devisId);
    expect(Buffer.from(scan.contenu).equals(SCAN)).toBe(true);
    expect(scan.nomFichier).toBe('devis-signe.pdf');
  });

  it('refuse la signature d’un devis échu : il faut une nouvelle version', async () => {
    const devisId = await devisEmis();
    await demarrerEssai(audio, devisId, { statutAttendu: 'EMIS', offreEssai: 'OFFRE_100_SANTE' });
    await deposerScanDevis(audio, devisId, { statutAttendu: 'EMIS' }, SCAN);
    const { dateFinValidite } = await obtenirDevis(audio, devisId);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${dateFinValidite ?? ''}T12:00:00.000Z`).getTime() + 86_400_000);

    await expect(
      enregistrerSignature(audio, devisId, {
        statutAttendu: 'EMIS',
        offreRetenue: 'OFFRE_100_SANTE',
        dateSignature: aujourdhui(),
        signe: true,
      }),
    ).rejects.toThrow(/échu/);
  });

  it('refuse d’ouvrir un scan absent', async () => {
    const devisId = await devisEmis();
    await expect(lireScanDevis(audio, devisId)).rejects.toThrow(AccesRefuseError);
  });
});

describe('journal', () => {
  it('trace la lecture et les étapes, avec le patient', async () => {
    const devisId = await devisSigne();
    await obtenirDevis(audio, devisId);

    const lectures = await lignesAudit('READ');
    expect(lectures).toHaveLength(1);
    expect(lectures[0]).toMatchObject({ entiteId: devisId, patientId, centreId: d.centres.a.id });
    const transitions = await prisma().journalAudit.findMany({
      where: { entiteType: 'DOSSIER', action: 'UPDATE', entiteId: dossierId },
    });
    expect(transitions.map((t) => (t.details as { statutApres: string }).statutApres)).toEqual(
      expect.arrayContaining(['DEVIS_EMIS', 'EN_ESSAI', 'DEVIS_SIGNE']),
    );
  });
});
