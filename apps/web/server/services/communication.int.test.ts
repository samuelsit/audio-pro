import { prisma } from '@ha/db/admin';
import { MODELES_DEFAUT } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { identifierCentreA } from '@/test/devis';
import { creerJeuDeDonnees, creerResponsable, viderBase, type JeuDeDonnees } from '@/test/donnees';
import { AccesRefuseError } from '@/server/auth/acces';
import { base } from '@/server/chiffrement';
import { empreinteAdresse, signatureLienDesinscription } from '@/server/reservation-empreintes';

import { annulerCampagne, compterSegment, creerCampagne, listerCampagnes } from './campagnes';
import {
  enregistrerModele,
  enregistrerParametresCommunication,
  enregistrerScenario,
  listerScenarios,
} from './communication';
import { exigerSansOpposition, noterConsentement } from './consentements';
import { desinscrire, lireDesinscription, suivreLien } from './liens-patient';
import { creerPatient, fusionnerPatients, modifierPatient, obtenirPatient } from './patients';
import { historiquePatient, syntheseSuivi } from './suivi-messages';

const MOBILE = '0612345678';
const CANONIQUE = '+33612345678';

const PATIENT = {
  civilite: 'MME',
  nomNaissance: 'Exemple',
  nomUsage: '',
  prenoms: 'Marie',
  dateNaissance: '1950-06-15',
  sexe: 'FEMININ',
  adresseLigne1: '2 rue Haute',
  adresseLigne2: '',
  codePostal: '69001',
  ville: 'Lyon',
  telephone: MOBILE,
  email: 'patient@exemple.test',
  medecinTraitant: '',
  notes: '',
  consentementSms: true,
  consentementEmail: true,
  consentementCourrier: false,
  amoC2s: false,
  amoAld: false,
};

let d: JeuDeDonnees;

function saisie(changements: Record<string, unknown> = {}) {
  return { ...PATIENT, centreId: d.centres.a.id, ...changements };
}

async function evenements(patientId: string) {
  return prisma().evenementConsentement.findMany({
    where: { patientId },
    orderBy: { survenuLe: 'asc' },
  });
}

/** Un message déjà parti, avec son empreinte : ce que l'ouvrier laisse derrière lui. */
async function messageEnvoye(patientId: string, canal: 'SMS' | 'EMAIL', adresse: string) {
  return base({ organisationId: d.organisation.id }).messagePatient.create({
    data: {
      organisationId: d.organisation.id,
      centreId: d.centres.a.id,
      patientId,
      canal,
      finalite: 'SUIVI',
      statut: 'ENVOYE',
      envoyeLe: new Date('2026-11-02T10:00:00.000Z'),
      empreinteAdresse: empreinteAdresse().calculer(canal, adresse),
      cleIdempotence: `test:${patientId}:${canal}`,
      codeCourt: `code-${canal}`,
      lienCible: 'https://exemple.test/rdv/client/centre',
    },
  });
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await identifierCentreA(d);
});

describe('journal des consentements', () => {
  it('trace la création et chaque changement, pas ce qui ne change pas', async () => {
    const { acteurs } = d;
    const patientId = await creerPatient(acteurs.assistantA, saisie());
    await expect(evenements(patientId)).resolves.toHaveLength(2);
    await modifierPatient(acteurs.assistantA, patientId, saisie({ consentementEmail: false }));
    await modifierPatient(acteurs.assistantA, patientId, saisie({ consentementEmail: false }));
    const lignes = await evenements(patientId);
    expect(lignes).toHaveLength(3);
    expect(lignes[2]).toMatchObject({ canal: 'EMAIL', accorde: false, origine: 'FICHE' });
  });

  it('une fusion ne garde un accord commercial que si les deux fiches l’ont', async () => {
    const { acteurs } = d;
    const avec = await creerPatient(acteurs.admin, saisie({ consentementSmsCommercial: true }));
    const sans = await creerPatient(
      acteurs.admin,
      saisie({ prenoms: 'Marie Louise', dateNaissance: '1951-01-01' }),
      { confirmerDoublon: true },
    );
    await fusionnerPatients(acteurs.admin, avec, sans, {});
    await expect(
      prisma().patient.findUniqueOrThrow({ where: { id: avec } }),
    ).resolves.toMatchObject({ consentementSmsCommercial: false });
    await expect(evenements(avec)).resolves.toContainEqual(
      expect.objectContaining({ origine: 'FUSION', accorde: false }),
    );
  });
});

describe('désinscription', () => {
  it('coupe le canal, rejouable, sans toucher à l’autre canal', async () => {
    const patientId = await creerPatient(d.acteurs.assistantA, saisie());
    const message = await messageEnvoye(patientId, 'EMAIL', 'patient@exemple.test');
    const jeton = signatureLienDesinscription().signer({
      organisationId: d.organisation.id,
      messageId: message.id,
    });
    await expect(lireDesinscription(jeton)).resolves.toMatchObject({
      canal: 'EMAIL',
      dejaFaite: false,
    });
    await expect(desinscrire(jeton)).resolves.toBe(true);
    await expect(desinscrire(jeton)).resolves.toBe(true);
    await expect(lireDesinscription(jeton)).resolves.toMatchObject({ dejaFaite: true });
    await expect(
      prisma().patient.findUniqueOrThrow({ where: { id: patientId } }),
    ).resolves.toMatchObject({ consentementEmail: false, consentementSms: true });
    await expect(prisma().oppositionAdresse.count()).resolves.toBe(1);
    await expect(evenements(patientId)).resolves.toContainEqual(
      expect.objectContaining({ canal: 'EMAIL', accorde: false, origine: 'DESINSCRIPTION' }),
    );
  });

  it('refuse un jeton altéré', async () => {
    await expect(lireDesinscription('a.b.c')).resolves.toBeNull();
    await expect(desinscrire('a.b.c')).resolves.toBe(false);
  });
});

describe('opposition', () => {
  async function patientOpposé() {
    const patientId = await creerPatient(d.acteurs.assistantA, saisie());
    await base({ organisationId: d.organisation.id }).oppositionAdresse.create({
      data: {
        organisationId: d.organisation.id,
        canal: 'SMS',
        empreinte: empreinteAdresse().calculer('SMS', CANONIQUE),
        adresse: CANONIQUE,
        origine: 'STOP_SMS',
      },
    });
    return patientId;
  }

  it('la fiche resaisie ne la lève pas', async () => {
    const patientId = await patientOpposé();
    await modifierPatient(d.acteurs.assistantA, patientId, saisie({ consentementSms: true }));
    await expect(prisma().oppositionAdresse.count()).resolves.toBe(1);
    const { oppositions } = await historiquePatient(d.acteurs.assistantA, patientId);
    expect(oppositions).toEqual(['SMS']);
  });

  it('seul un nouveau consentement noté la lève', async () => {
    const patientId = await patientOpposé();
    await noterConsentement(d.acteurs.assistantA, patientId, {
      canal: 'SMS',
      finalites: ['SUIVI', 'COMMERCIAL'],
    });
    await expect(prisma().oppositionAdresse.count()).resolves.toBe(0);
    await expect(
      prisma().patient.findUniqueOrThrow({ where: { id: patientId } }),
    ).resolves.toMatchObject({ consentementSms: true, consentementSmsCommercial: true });
    await expect(evenements(patientId)).resolves.toContainEqual(
      expect.objectContaining({ origine: 'RECUEIL', finalite: 'COMMERCIAL' }),
    );
  });

  it('refuse d’envoyer un document sur un canal opposé', async () => {
    await patientOpposé();
    // La fiche garde l'écriture nationale : l'opposition compare la forme canonique.
    await expect(
      exigerSansOpposition(base({ organisationId: d.organisation.id }), 'SMS', MOBILE),
    ).rejects.toThrow(/opposé/);
  });
});

describe('lien court', () => {
  it('note le premier clic et renvoie la cible', async () => {
    const patientId = await creerPatient(d.acteurs.assistantA, saisie());
    await messageEnvoye(patientId, 'SMS', CANONIQUE);
    await expect(suivreLien('code-SMS', '10.0.0.1')).resolves.toBe(
      'https://exemple.test/rdv/client/centre',
    );
    const { clicLe } = await prisma().messagePatient.findFirstOrThrow();
    expect(clicLe).not.toBeNull();
    await suivreLien('code-SMS', '10.0.0.1');
    await expect(prisma().messagePatient.findFirstOrThrow()).resolves.toMatchObject({ clicLe });
  });

  it('ignore un code inconnu', async () => {
    await expect(suivreLien('inconnu', '10.0.0.2')).resolves.toBeNull();
  });
});

describe('paramètres et modèles', () => {
  it('réservés à l’administrateur du client', async () => {
    await expect(listerScenarios(d.acteurs.assistantA)).rejects.toBeInstanceOf(AccesRefuseError);
    await expect(
      enregistrerScenario(d.acteurs.assistantA, 'RAPPEL_RDV_J1', { actif: true, canaux: ['SMS'] }),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('un scénario est inactif par défaut, et s’active', async () => {
    const { admin } = d.acteurs;
    const avant = await listerScenarios(admin);
    expect(avant.every((s) => !s.actif)).toBe(true);
    await enregistrerScenario(admin, 'RAPPEL_RDV_J1', { actif: true, canaux: ['EMAIL', 'SMS'] });
    const apres = await listerScenarios(admin);
    expect(apres.find((s) => s.scenario === 'RAPPEL_RDV_J1')).toMatchObject({
      actif: true,
      canaux: ['EMAIL', 'SMS'],
    });
  });

  it('refuse un modèle qui parle de santé', async () => {
    await expect(
      enregistrerModele(d.acteurs.admin, null, {
        nom: 'Essai',
        scenario: 'FIN_ESSAI',
        ...MODELES_DEFAUT.FIN_ESSAI,
        corpsSms: 'Votre essai se termine.',
      }),
    ).rejects.toThrow();
  });

  it('remplacer le modèle d’un scénario augmente sa version', async () => {
    const { admin } = d.acteurs;
    const textes = { nom: 'Rappel', scenario: 'RAPPEL_RDV_J1', ...MODELES_DEFAUT.RAPPEL_RDV_J1 };
    await enregistrerModele(admin, null, textes);
    await enregistrerModele(admin, null, { ...textes, nom: 'Rappel 2' });
    await expect(prisma().modeleMessage.findMany()).resolves.toEqual([
      expect.objectContaining({ nom: 'Rappel 2', version: 2 }),
    ]);
  });

  it('valide les plages', async () => {
    await expect(
      enregistrerParametresCommunication(d.acteurs.admin, {
        heureDebut: '20:00',
        heureFin: '08:00',
      }),
    ).rejects.toThrow();
  });
});

describe('campagnes', () => {
  async function modele() {
    return enregistrerModele(d.acteurs.admin, null, {
      nom: 'Printemps',
      scenario: null,
      ...MODELES_DEFAUT.ANNIVERSAIRE,
    });
  }

  it('compte le segment : total et destinataires consentants', async () => {
    const { admin } = d.acteurs;
    await creerPatient(admin, saisie({ consentementSmsCommercial: true }));
    await creerPatient(admin, saisie({ prenoms: 'Louise', dateNaissance: '1949-01-01' }));
    await creerPatient(
      admin,
      saisie({
        prenoms: 'Jeanne',
        dateNaissance: '1990-01-01',
        consentementSmsCommercial: true,
      }),
    );
    await expect(
      compterSegment(admin, { centreIds: [d.centres.a.id], ageMin: 65 }, 'SMS'),
    ).resolves.toEqual({ total: 2, destinataires: 1 });
  });

  it('refuse un centre hors périmètre, et un rôle sans gestion', async () => {
    await expect(
      compterSegment(d.acteurs.assistantA, { centreIds: [d.centres.a.id] }, 'SMS'),
    ).rejects.toBeInstanceOf(AccesRefuseError);
    const responsable = await creerResponsable(d);
    await expect(
      compterSegment(responsable, { centreIds: [d.centres.c.id] }, 'SMS'),
    ).rejects.toBeInstanceOf(AccesRefuseError);
  });

  it('se programme, se liste, s’annule, une seule fois', async () => {
    const { admin } = d.acteurs;
    const modeleId = await modele();
    const id = await creerCampagne(admin, {
      nom: 'Printemps',
      modeleId,
      canal: 'SMS',
      segment: { centreIds: [d.centres.a.id] },
      programmeeLe: '2030-01-07T09:00:00+01:00',
    });
    await expect(listerCampagnes(admin)).resolves.toEqual([
      expect.objectContaining({ id, statut: 'PROGRAMMEE' }),
    ]);
    await annulerCampagne(admin, id);
    await expect(annulerCampagne(admin, id)).rejects.toThrow(/commencé/);
  });

  it('refuse le modèle d’un scénario', async () => {
    const { admin } = d.acteurs;
    const modeleId = await enregistrerModele(admin, null, {
      nom: 'Rappel',
      scenario: 'RAPPEL_RDV_J1',
      ...MODELES_DEFAUT.RAPPEL_RDV_J1,
    });
    await expect(
      creerCampagne(admin, {
        nom: 'Printemps',
        modeleId,
        canal: 'SMS',
        segment: { centreIds: [d.centres.a.id] },
      }),
    ).rejects.toThrow();
  });
});

describe('suivi', () => {
  it('compte par origine et chiffre le coût par centre', async () => {
    const { admin } = d.acteurs;
    const patientId = await creerPatient(admin, saisie());
    const message = await messageEnvoye(patientId, 'SMS', CANONIQUE);
    await prisma().messagePatient.update({
      where: { id: message.id },
      data: { scenario: 'RAPPEL_RDV_J1', statut: 'DELIVRE', segments: 2, coutMillimes: 95 },
    });
    const mois = message.createdAt.toISOString().slice(0, 7);
    const { lignes, couts } = await syntheseSuivi(admin, { type: 'tous' }, mois);
    expect(lignes).toEqual([
      expect.objectContaining({ envoyes: 1, delivres: 1, clics: 0, echecs: 0 }),
    ]);
    expect(couts).toEqual([
      { centre: d.centres.a.nom, messages: 1, segments: 2, coutCentimes: 10 },
    ]);
  });

  it('l’historique suit le périmètre du patient', async () => {
    const patientId = await creerPatient(d.acteurs.admin, saisie());
    await expect(historiquePatient(d.acteurs.assistantB, patientId)).rejects.toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('l’ouverture de la fiche écrit la ligne de lecture', async () => {
    const patientId = await creerPatient(d.acteurs.assistantA, saisie());
    await obtenirPatient(d.acteurs.assistantA, patientId);
    await expect(
      prisma().journalAudit.count({ where: { action: 'READ', patientId } }),
    ).resolves.toBeGreaterThan(0);
  });
});
