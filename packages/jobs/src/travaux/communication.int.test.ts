import {
  EmpreinteAdresse,
  FakeDocumentStore,
  FakeNotifier,
  FakePdfRenderer,
  SignatureLienCommande,
  SignatureLienDesinscription,
  SignatureLienDocument,
  SignatureLienRdv,
} from '@ha/adapters';
import { prisma, viderBaseJetable } from '@ha/db/admin';
import { MODELES_DEFAUT, type ScenarioCommunication } from '@ha/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { abonneMessagesRdv } from '../abonnes';
import { executerEnveloppe, type Travail } from '../travail';
import { travailScenarios } from './declencher-scenarios';
import { travailEnvoi } from './envoyer-notifications';
import { travailCourriers } from './generer-courriers';
import { travailCampagnes } from './lancer-campagnes';
import { releverOppositions, travailReleveEnvois } from './relever-envois';

const CLE = Buffer.alloc(32, 3);
const empreinte = new EmpreinteAdresse(Buffer.alloc(32, 4));
const signatureDesinscription = new SignatureLienDesinscription(CLE);
const URL_PUBLIQUE = 'https://exemple.test';
const NUMERO = '+33612345678';
/** Lundi 1er février 2027, 10 h à Paris. */
const LUNDI = new Date('2027-02-01T09:00:00.000Z');
const LUNDI_SOIR = new Date('2027-02-01T20:00:00.000Z');
const MARDI_MATIN = new Date('2027-02-02T08:00:00.000Z');
const DIMANCHE = new Date('2027-01-31T09:00:00.000Z');

let organisationId: string;
let autreOrganisationId: string;
let centreId: string;
let typeRdvId: string;
let cabineId: string;
let utilisateurId: string;
let notifier: FakeNotifier;
let compteur = 0;

function dependances(maintenant: Date) {
  return { empreinte, urlPublique: URL_PUBLIQUE, maintenant: () => maintenant };
}

function lancer<S extends z.ZodType>(travail: Travail<S>, organisation = organisationId) {
  return executerEnveloppe(travail, {
    organisationId: organisation,
    cleIdempotence: 'test',
    charge: {},
  });
}

const scenarios = (maintenant = LUNDI) => lancer(travailScenarios(dependances(maintenant)));

function envoyer(maintenant = LUNDI) {
  return lancer(
    travailEnvoi({
      notifier,
      signature: new SignatureLienRdv(CLE),
      signatureDocument: new SignatureLienDocument(CLE),
      signatureCommande: new SignatureLienCommande(CLE),
      signatureDesinscription,
      empreinte,
      documents: null,
      urlPublique: URL_PUBLIQUE,
      maintenant: () => maintenant,
    }),
  );
}

async function creerCentre(organisation: string, nom: string) {
  return prisma().centre.create({
    data: {
      organisationId: organisation,
      nom,
      adresseLigne1: '1 rue de l’Exemple',
      codePostal: '75000',
      ville: 'Paris',
      email: 'centre@exemple.test',
      telephone: '0100000000',
      siret: '12345678900011',
    },
  });
}

function creerPatient(changements: Record<string, unknown> = {}, organisation = organisationId) {
  compteur += 1;
  return prisma().patient.create({
    data: {
      organisationId: organisation,
      centreId,
      civilite: 'MME',
      nomNaissance: `DEMO${String(compteur)}`,
      nomNaissanceRecherche: `DEMO${String(compteur)}`,
      prenoms: 'Marie Claire',
      prenomsRecherche: 'MARIE CLAIRE',
      dateNaissance: new Date('1950-06-15'),
      sexe: 'FEMININ',
      telephone: NUMERO,
      email: 'patient@exemple.test',
      adresseLigne1: '2 rue Haute',
      codePostal: '69001',
      ville: 'Lyon',
      consentementSms: true,
      consentementEmail: true,
      consentementCourrier: true,
      ...changements,
    },
  });
}

function activer(
  scenario: ScenarioCommunication,
  canaux: ('SMS' | 'EMAIL' | 'COURRIER')[] = ['SMS'],
) {
  return prisma().reglageScenario.create({
    data: { organisationId, scenario, actif: true, canaux },
  });
}

function creerRdv(patientId: string, debut: Date, changements: Record<string, unknown> = {}) {
  compteur += 1;
  return prisma().rendezVous.create({
    data: {
      organisationId,
      centreId,
      typeRdvId,
      cabineId,
      patientId,
      debut,
      fin: new Date(debut.getTime() + 1_800_000),
      createdById: utilisateurId,
      origine: 'INTERNE',
      ...changements,
    },
  });
}

const MERCREDI = new Date('2027-02-03T13:30:00.000Z');

async function messageSms(patientId: string) {
  return prisma().messagePatient.findFirstOrThrow({ where: { patientId } });
}

beforeAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
  organisationId = (await prisma().organisation.create({ data: { raisonSociale: 'Client A' } })).id;
  autreOrganisationId = (
    await prisma().organisation.create({ data: { raisonSociale: 'Client B' } })
  ).id;
  centreId = (await creerCentre(organisationId, 'Centre A')).id;
  typeRdvId = (
    await prisma().typeRdv.create({
      data: {
        organisationId,
        nom: 'Suivi',
        dureeMinutes: 30,
        couleur: '#2563eb',
        requierePraticien: true,
        requiereCabine: false,
      },
    })
  ).id;
  cabineId = (await prisma().cabine.create({ data: { organisationId, centreId, nom: 'Cabine 1' } }))
    .id;
  utilisateurId = (
    await prisma().utilisateur.create({
      data: {
        organisationId,
        prenom: 'Alix',
        nom: 'Test',
        name: 'Alix Test',
        email: 'alix@exemple.test',
        role: 'ASSISTANT',
      },
    })
  ).id;
});

beforeEach(async () => {
  notifier = new FakeNotifier();
  await prisma().notification.deleteMany();
  await prisma().messagePatient.deleteMany();
  await prisma().campagne.deleteMany();
  await prisma().lotCourrier.deleteMany();
  await prisma().modeleMessage.deleteMany();
  await prisma().reglageScenario.deleteMany();
  await prisma().parametresCommunication.deleteMany();
  await prisma().oppositionAdresse.deleteMany();
  await prisma().$executeRaw`TRUNCATE evenement_consentement`;
  await prisma().delivrance.deleteMany();
  await prisma().rendezVous.deleteMany();
  await prisma().reservationEnLigne.deleteMany();
  await prisma().patient.deleteMany({ where: { organisationId: autreOrganisationId } });
  await prisma().patient.deleteMany();
});

afterAll(async () => {
  await prisma().$disconnect();
});

describe('scénarios', () => {
  it('rejoué, et même en parallèle, un scénario n’écrit qu’un message', async () => {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await scenarios();
    await Promise.all([scenarios(), scenarios()]);
    await expect(prisma().messagePatient.count()).resolves.toBe(1);
    await expect(prisma().notification.count()).resolves.toBe(1);
    await envoyer();
    await envoyer();
    expect(notifier.envoyes).toHaveLength(1);
  });

  it('n’envoie rien tant que le scénario n’est pas activé', async () => {
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await expect(prisma().messagePatient.count()).resolves.toBe(0);
  });

  it('écrit le prénom, le centre et la date, sans le type de rendez-vous', async () => {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await envoyer();
    expect(notifier.envoyes[0]).toMatchObject({
      canal: 'SMS',
      destinataire: NUMERO,
      texte: 'Marie, rappel : RDV chez Centre A le mardi 2 février a 14h30. Contact : 0100000000',
    });
  });

  it('garde une trace du message qui ne part pas, sans consentement', async () => {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient({ consentementSms: false });
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'BLOQUE',
      motif: 'SANS_CONSENTEMENT',
      corps: null,
    });
    await expect(prisma().notification.count()).resolves.toBe(0);
  });

  it('prend le canal suivant si le premier n’est pas permis', async () => {
    await activer('RAPPEL_RDV_J1', ['SMS', 'EMAIL']);
    const patient = await creerPatient({ consentementSms: false });
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await expect(messageSms(patient.id)).resolves.toMatchObject({ canal: 'EMAIL' });
  });

  it('exige le consentement commercial pour un renouvellement', async () => {
    await activer('RENOUVELLEMENT');
    const sans = await creerPatient();
    const avec = await creerPatient({ consentementSmsCommercial: true });
    for (const patient of [sans, avec]) {
      await prisma().delivrance.create({
        data: {
          organisationId,
          patientId: patient.id,
          oreille: 'DROITE',
          dateDelivrance: new Date('2023-01-20'),
          origine: 'REPRISE',
        },
      });
    }
    await scenarios();
    await expect(messageSms(sans.id)).resolves.toMatchObject({ statut: 'BLOQUE' });
    await expect(messageSms(avec.id)).resolves.toMatchObject({
      statut: 'A_ENVOYER',
      finalite: 'COMMERCIAL',
      entiteId: null,
    });
  });

  it('n’envoie pas l’arriéré à l’activation', async () => {
    await activer('RENOUVELLEMENT');
    const patient = await creerPatient({ consentementSmsCommercial: true });
    await prisma().delivrance.create({
      data: {
        organisationId,
        patientId: patient.id,
        oreille: 'DROITE',
        dateDelivrance: new Date('2020-01-20'),
        origine: 'REPRISE',
      },
    });
    await scenarios();
    await expect(prisma().messagePatient.count()).resolves.toBe(0);
  });

  it('ignore une délivrance annulée et une fiche fusionnée', async () => {
    await activer('ANNIVERSAIRE');
    const cible = await creerPatient({ consentementSmsCommercial: true });
    const fusionne = await creerPatient({
      consentementSmsCommercial: true,
      fusionneDansId: cible.id,
    });
    await prisma().delivrance.createMany({
      data: [
        {
          organisationId,
          patientId: fusionne.id,
          oreille: 'DROITE',
          dateDelivrance: new Date('2025-02-01'),
          origine: 'REPRISE',
        },
      ],
    });
    await scenarios();
    await expect(prisma().messagePatient.count()).resolves.toBe(0);
  });

  it('un jour fermé n’écrit aucun rappel', async () => {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-01T13:30:00.000Z'));
    await scenarios(DIMANCHE);
    await expect(prisma().messagePatient.count()).resolves.toBe(0);
  });

  it('confirme un rendez-vous pris au centre, pas un rendez-vous en ligne', async () => {
    await activer('CONFIRMATION_RDV');
    const patient = await creerPatient();
    const interne = await creerRdv(patient.id, MERCREDI);
    const enLigne = await creerRdv(patient.id, new Date('2027-02-04T13:30:00.000Z'), {
      origine: 'EN_LIGNE',
    });
    const abonne = abonneMessagesRdv(dependances(LUNDI));
    await lancer({
      nom: 'abonne',
      charge: z.object({}),
      async executer(ctx) {
        for (const rdv of [interne, enLigne]) {
          const evenement = {
            type: 'RDV_CREE' as const,
            charge: {
              rendezVousId: rdv.id,
              centreId,
              typeRdvId,
              patientId: patient.id,
              dossierId: null,
              praticienId: null,
              cabineId: null,
              debut: rdv.debut.toISOString(),
              fin: rdv.fin.toISOString(),
            },
          };
          await abonne.traiter(evenement, `evt-${rdv.id}`, ctx);
          await abonne.traiter(evenement, `evt-${rdv.id}`, ctx);
        }
      },
    });
    const messages = await prisma().messagePatient.findMany();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ scenario: 'CONFIRMATION_RDV', rendezVousId: interne.id });
  });
});

describe('garde à l’envoi', () => {
  async function rappelEcrit(changements: Record<string, unknown> = {}) {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient(changements);
    const rdv = await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    return { patient, rdv };
  }

  it('hors plage, reporte à l’ouverture sans compter de tentative', async () => {
    await rappelEcrit();
    await envoyer(LUNDI_SOIR);
    expect(notifier.envoyes).toHaveLength(0);
    const ligne = await prisma().notification.findFirstOrThrow();
    expect(ligne).toMatchObject({ tentatives: 0, statut: 'A_ENVOYER' });
    expect(ligne.prochainEssaiLe.toISOString()).toBe('2027-02-02T08:00:00.000Z');
    await envoyer(MARDI_MATIN);
    expect(notifier.envoyes).toHaveLength(1);
  });

  it('un rappel dont le créneau suit le rendez-vous expire', async () => {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-02T07:30:00.000Z'));
    await scenarios();
    await envoyer(LUNDI_SOIR);
    expect(notifier.envoyes).toHaveLength(0);
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'EXPIRE',
      motif: 'HORS_PLAGE',
    });
  });

  it('un STOP arrivé entre l’écriture et l’envoi coupe le message', async () => {
    const { patient } = await rappelEcrit();
    await prisma().oppositionAdresse.create({
      data: {
        organisationId,
        canal: 'SMS',
        empreinte: empreinte.calculer('SMS', NUMERO),
        adresse: 'v1.chiffre',
        origine: 'STOP_SMS',
      },
    });
    await envoyer();
    expect(notifier.envoyes).toHaveLength(0);
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'BLOQUE',
      motif: 'OPPOSITION',
    });
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'ABANDONNEE',
    });
  });

  it('un STOP coupe aussi une ligne qui ne vient pas d’un scénario', async () => {
    await prisma().oppositionAdresse.create({
      data: {
        organisationId,
        canal: 'SMS',
        empreinte: empreinte.calculer('SMS', NUMERO),
        adresse: 'v1.chiffre',
        origine: 'STOP_SMS',
      },
    });
    const reservation = await prisma().reservationEnLigne.create({
      data: {
        organisationId,
        centreId,
        typeRdvId,
        cabineId,
        debut: new Date('2027-03-01T09:00:00.000Z'),
        fin: new Date('2027-03-01T09:30:00.000Z'),
        expireLe: new Date('2027-02-01T09:00:00.000Z'),
        jetonEmpreinte: `jeton-${String(compteur)}`,
      },
    });
    await lancer({
      nom: 'preparation',
      charge: z.object({}),
      async executer(ctx) {
        await ctx.client.notification.create({
          data: {
            reservationId: reservation.id,
            canal: 'SMS',
            // Écriture nationale : l'opposition compare la forme canonique.
            destinataire: '0612345678',
            gabarit: 'RDV_CONFIRME',
            parametres: {
              centre: 'Centre A',
              telephoneCentre: '0100000000',
              date: '2027-03-01',
              heure: '10:00',
            },
            cleIdempotence: 'reservation-1',
          },
        });
      },
    });
    await envoyer();
    expect(notifier.envoyes).toHaveLength(0);
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'ABANDONNEE',
    });
  });

  it('un consentement retiré après l’écriture bloque l’envoi', async () => {
    const { patient } = await rappelEcrit();
    await prisma().patient.update({
      where: { id: patient.id },
      data: { consentementSms: false },
    });
    await envoyer();
    expect(notifier.envoyes).toHaveLength(0);
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'BLOQUE',
      motif: 'SANS_CONSENTEMENT',
    });
  });

  it.each([
    [
      'déplacé',
      { debut: new Date('2027-02-05T13:30:00.000Z'), fin: new Date('2027-02-05T14:00:00.000Z') },
    ],
    ['annulé', { statut: 'ANNULE' as const }],
  ])('un rendez-vous %s rend le rappel sans objet', async (_, changement) => {
    const { patient, rdv } = await rappelEcrit();
    await prisma().rendezVous.update({ where: { id: rdv.id }, data: changement });
    await envoyer();
    expect(notifier.envoyes).toHaveLength(0);
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'EXPIRE',
      motif: 'SANS_OBJET',
    });
  });

  it('passé son échéance, un message ne part plus', async () => {
    const { patient } = await rappelEcrit();
    await envoyer(new Date('2027-02-03T09:00:00.000Z'));
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'EXPIRE',
      motif: 'PERIME',
    });
  });

  it('enregistre le reçu, les segments, le coût et une ligne d’audit', async () => {
    await prisma().parametresCommunication.create({
      data: {
        organisationId,
        heureDebut: '09:00',
        heureFin: '19:00',
        jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
        feries: false,
        tarifSmsMillimes: 45,
        devisDelaiJours: 7,
        devisRelancesMax: 2,
        finEssaiAvanceJours: 7,
        controleAvanceJours: 30,
        garantieAvanceJours: 60,
        renouvellementFenetreJours: 30,
      },
    });
    const { patient } = await rappelEcrit();
    await envoyer();
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'ENVOYE',
      idFournisseur: 'simule-1',
      segments: 1,
      coutMillimes: 45,
      envoyeLe: LUNDI,
    });
    await expect(
      prisma().journalAudit.count({ where: { action: 'SEND', patientId: patient.id } }),
    ).resolves.toBe(1);
  });

  it('après cinq échecs, abandonne et le dit dans l’historique', async () => {
    const { patient } = await rappelEcrit();
    notifier.enPanne = true;
    for (let essai = 0; essai < 5; essai += 1) {
      await envoyer(new Date(LUNDI.getTime() + essai * 600_000));
    }
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'ABANDONNEE',
    });
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'ECHEC',
      motif: 'ENVOI',
    });
  });

  it('un e-mail porte le lien de désinscription, signé pour ce message', async () => {
    await activer('RAPPEL_RDV_J1', ['EMAIL']);
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await envoyer();
    const email = notifier.envoyes[0] as {
      texte: string;
      repondreA: string;
      lienDesinscription: string;
    };
    const message = await messageSms(patient.id);
    expect(email.repondreA).toBe('centre@exemple.test');
    expect(email.texte).toContain(email.lienDesinscription);
    expect(
      signatureDesinscription.lire(email.lienDesinscription.split('/desinscription/')[1] ?? ''),
    ).toEqual({ organisationId, messageId: message.id });
  });
});

describe('suivi', () => {
  async function envoye() {
    await activer('RAPPEL_RDV_J1');
    const patient = await creerPatient();
    await creerRdv(patient.id, new Date('2027-02-02T13:30:00.000Z'));
    await scenarios();
    await envoyer();
    return patient;
  }

  const relever = (maintenant = LUNDI) =>
    lancer(travailReleveEnvois({ notifier, maintenant: () => maintenant }));

  it('relit la livraison, et un accusé rejoué ne change rien', async () => {
    const patient = await envoye();
    await relever();
    await relever(new Date('2027-02-01T12:00:00.000Z'));
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'DELIVRE',
      delivreLe: LUNDI,
    });
  });

  it('note un échec de livraison', async () => {
    const patient = await envoye();
    notifier.etats.set('simule-1', 'ECHEC');
    await relever();
    await expect(messageSms(patient.id)).resolves.toMatchObject({
      statut: 'ECHEC',
      echecLe: LUNDI,
    });
  });

  it('une panne de lecture laisse le message en l’état', async () => {
    const patient = await envoye();
    notifier.enPanne = true;
    await relever();
    await expect(messageSms(patient.id)).resolves.toMatchObject({ statut: 'ENVOYE' });
  });

  it('un STOP vaut pour chaque client qui a écrit au numéro, sans toucher aux autres', async () => {
    const patient = await envoye();
    const autreCentre = await creerCentre(autreOrganisationId, 'Centre B');
    const sansContact = await creerPatient({ centreId: autreCentre.id }, autreOrganisationId);
    notifier.oppositions = ['0033612345678', 'pas un numéro'];
    await releverOppositions({ notifier, empreinte, maintenant: () => LUNDI });
    await releverOppositions({ notifier, empreinte, maintenant: () => LUNDI });

    await expect(
      prisma().patient.findUniqueOrThrow({ where: { id: patient.id } }),
    ).resolves.toMatchObject({ consentementSms: false, consentementEmail: true });
    await expect(prisma().oppositionAdresse.count({ where: { organisationId } })).resolves.toBe(1);
    await expect(
      prisma().evenementConsentement.findMany({ where: { patientId: patient.id } }),
    ).resolves.toEqual([
      expect.objectContaining({ canal: 'SMS', accorde: false, origine: 'STOP_SMS' }),
    ]);
    await expect(messageSms(patient.id)).resolves.toMatchObject({ desinscritLe: LUNDI });

    await expect(
      prisma().patient.findUniqueOrThrow({ where: { id: sansContact.id } }),
    ).resolves.toMatchObject({ consentementSms: true });
    await expect(
      prisma().oppositionAdresse.count({ where: { organisationId: autreOrganisationId } }),
    ).resolves.toBe(0);
  });
});

describe('campagnes', () => {
  async function campagne(canal: 'SMS' | 'COURRIER', segment: Record<string, unknown> = {}) {
    const modele = await prisma().modeleMessage.create({
      data: { organisationId, nom: 'Printemps', ...MODELES_DEFAUT.ANNIVERSAIRE },
    });
    return prisma().campagne.create({
      data: {
        organisationId,
        nom: 'Printemps',
        modeleId: modele.id,
        canal,
        segment: { centreIds: [centreId], ...segment },
        programmeeLe: LUNDI,
      },
    });
  }

  const lancerCampagnes = (maintenant = LUNDI) => lancer(travailCampagnes(dependances(maintenant)));

  it('attend son heure', async () => {
    await campagne('SMS');
    await lancerCampagnes(new Date('2027-01-31T09:00:00.000Z'));
    await expect(prisma().campagne.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'PROGRAMMEE',
    });
  });

  it('n’écrit qu’aux patients du segment, consentants et sans opposition', async () => {
    const dansLeSegment = await creerPatient({ consentementSmsCommercial: true });
    await creerPatient({ consentementSmsCommercial: true, dateNaissance: new Date('1990-01-01') });
    await creerPatient({ consentementSmsCommercial: false });
    await creerPatient({ consentementSmsCommercial: true, telephone: '+33687654321' });
    await prisma().oppositionAdresse.create({
      data: {
        organisationId,
        canal: 'SMS',
        empreinte: empreinte.calculer('SMS', '+33687654321'),
        adresse: 'v1.chiffre',
        origine: 'STOP_SMS',
      },
    });
    await campagne('SMS', { ageMin: 65 });
    await lancerCampagnes();
    const messages = await prisma().messagePatient.findMany();
    expect(messages.map((m) => m.patientId)).toEqual([dansLeSegment.id]);
    await expect(prisma().campagne.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'TERMINEE',
      destinataires: 1,
      lanceeLe: LUNDI,
    });
  });

  it('passe après les rappels, et une reprise n’écrit rien de plus', async () => {
    await creerPatient({ consentementSmsCommercial: true });
    const lancee = await campagne('SMS');
    await lancerCampagnes();
    await prisma().campagne.update({ where: { id: lancee.id }, data: { statut: 'EN_COURS' } });
    await lancerCampagnes();
    await expect(prisma().messagePatient.count()).resolves.toBe(1);
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({ priorite: 1 });
  });

  it('assemble les lettres d’une campagne en un PDF par centre', async () => {
    await creerPatient({ consentementCourrierCommercial: true });
    await creerPatient({ consentementCourrierCommercial: true });
    await creerPatient({ consentementCourrierCommercial: true, adresseLigne1: null });
    await campagne('COURRIER');
    await lancerCampagnes();
    await expect(prisma().notification.count()).resolves.toBe(0);

    const documents = new FakeDocumentStore();
    const pdf = new FakePdfRenderer();
    const courriers = travailCourriers({
      notifier,
      documents,
      pdf,
      maintenant: () => LUNDI,
    });
    await lancer(courriers);
    await lancer(courriers);

    const lots = await prisma().lotCourrier.findMany();
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ statut: 'PRET', lettres: 2 });
    await expect(documents.get(lots[0]?.documentCle ?? '')).resolves.toBeDefined();
    expect(pdf.rendus[0]).toContain('SIRET 12345678900011');
    expect(pdf.rendus[0]).toContain('<strong>Marie Claire DEMO');
    expect(notifier.envoyes).toEqual([
      { canal: 'COURRIER', cleDocument: lots[0]?.documentCle, lettres: 2 },
    ]);
  });
});
