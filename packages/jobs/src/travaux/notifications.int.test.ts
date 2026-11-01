import {
  FakeDocumentStore,
  FakeNotifier,
  SignatureLienDocument,
  SignatureLienRdv,
} from '@ha/adapters';
import { prisma, viderBaseJetable } from '@ha/db/admin';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { FileTravaux } from '../file';
import { definirTravail, executerEnveloppe } from '../travail';
import { repartirEnvois, travailEnvoi } from './envoyer-notifications';
import { travailPurgeLiensDocument } from './purger-liens-document';
import { purgerLimitations, travailPurgeReservations } from './purger-reservations';

const file = new FileTravaux(process.env.DATABASE_URL_JOBS ?? '');
const signature = new SignatureLienRdv(Buffer.alloc(32, 3));
const signatureDocument = new SignatureLienDocument(Buffer.alloc(32, 3));
const PARAMETRES = {
  centre: 'Centre A',
  telephoneCentre: '0100000000',
  date: '2030-01-07',
  heure: '09:00',
};

let organisationId: string;
let centreId: string;
let typeRdvId: string;
let praticienId: string;
let reservationId: string;
let notifier: FakeNotifier;
let compteur = 0;

function creerNotification(changements: Record<string, unknown> = {}) {
  compteur += 1;
  const cle = `cle-${String(compteur)}`;
  const travail = definirTravail({
    nom: 'preparation',
    charge: z.object({}),
    async executer({ client }) {
      await client.notification.create({
        data: {
          reservationId,
          canal: 'SMS',
          destinataire: '+33600000000',
          gabarit: 'RDV_CONFIRME',
          parametres: PARAMETRES,
          cleIdempotence: cle,
          ...changements,
        },
      });
    },
  });
  return executerEnveloppe(travail, { organisationId, cleIdempotence: 'x', charge: {} });
}

function envoyer(maintenant = () => new Date()) {
  const travail = travailEnvoi({
    notifier,
    signature,
    signatureDocument,
    urlPublique: 'https://exemple.test',
    maintenant,
  });
  return executerEnveloppe(travail, { organisationId, cleIdempotence: 'envoi', charge: {} });
}

function purger() {
  return executerEnveloppe(travailPurgeReservations, {
    organisationId,
    cleIdempotence: 'purge',
    charge: {},
  });
}

function verrou(changements: Record<string, unknown> = {}) {
  compteur += 1;
  return prisma().reservationEnLigne.create({
    data: {
      organisationId,
      centreId,
      typeRdvId,
      praticienId,
      debut: new Date(Date.UTC(2030, 0, 7, 8) + compteur * 3_600_000),
      fin: new Date(Date.UTC(2030, 0, 7, 8, 30) + compteur * 3_600_000),
      expireLe: new Date('2020-01-01T00:00:00.000Z'),
      jetonEmpreinte: `jeton-${String(compteur)}`,
      ...changements,
    },
  });
}

beforeAll(async () => {
  await viderBaseJetable(process.env.DATABASE_URL_ADMIN ?? '');
  const organisation = await prisma().organisation.create({ data: { raisonSociale: 'Client A' } });
  organisationId = organisation.id;
  const centre = await prisma().centre.create({
    data: {
      organisationId,
      nom: 'Centre A',
      adresseLigne1: '1 rue de l’Exemple',
      codePostal: '75000',
      ville: 'Paris',
      email: 'centre@exemple.test',
      telephone: '0100000000',
    },
  });
  centreId = centre.id;
  const type = await prisma().typeRdv.create({
    data: {
      organisationId,
      nom: 'Suivi',
      dureeMinutes: 30,
      couleur: '#2563eb',
      requierePraticien: true,
      requiereCabine: false,
    },
  });
  typeRdvId = type.id;
  const utilisateur = await prisma().utilisateur.create({
    data: {
      organisationId,
      prenom: 'Alix',
      nom: 'Test',
      name: 'Alix Test',
      email: 'alix@exemple.test',
      role: 'AUDIO',
      doitChangerMotDePasse: false,
    },
  });
  const praticien = await prisma().praticien.create({
    data: { utilisateurId: utilisateur.id, rpps: '19999999907' },
  });
  praticienId = praticien.id;
  await file.demarrer();
});

afterAll(async () => {
  await file.arreter();
});

beforeEach(async () => {
  await prisma().notification.deleteMany();
  await prisma().lienDocument.deleteMany();
  await prisma().reservationEnLigne.deleteMany();
  await prisma().rendezVous.deleteMany();
  await prisma().transitionDossier.deleteMany();
  await prisma().dossier.deleteMany();
  await prisma().patient.deleteMany();
  notifier = new FakeNotifier();
  reservationId = (await verrou({ expireLe: new Date('2099-01-01T00:00:00.000Z') })).id;
});

describe('travailEnvoi', () => {
  it('envoie, marque envoyé, et le lien mène à la bonne réservation', async () => {
    await creerNotification();
    await envoyer();
    expect(notifier.envoyes).toHaveLength(1);
    const message = notifier.envoyes[0];
    expect(message).toMatchObject({ canal: 'SMS', destinataire: '+33600000000' });
    const jeton = message?.texte.split('/rdv/lien/')[1] ?? '';
    expect(signature.lire(jeton)).toEqual({ organisationId, reservationId });
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'ENVOYEE',
    });
  });

  it('envoie aussi par e-mail, avec un sujet', async () => {
    await creerNotification({ canal: 'EMAIL', destinataire: 'alex@exemple.test' });
    await envoyer();
    expect(notifier.envoyes[0]).toMatchObject({
      canal: 'EMAIL',
      destinataire: 'alex@exemple.test',
      sujet: 'Votre rendez-vous est confirmé',
    });
  });

  it('rejoué, n’envoie pas deux fois', async () => {
    await creerNotification();
    await envoyer();
    await envoyer();
    expect(notifier.envoyes).toHaveLength(1);
  });

  it('deux exécutions simultanées n’envoient qu’une fois', async () => {
    await creerNotification();
    await Promise.all([envoyer(), envoyer()]);
    expect(notifier.envoyes).toHaveLength(1);
  });

  it('une panne repousse le message, puis il part', async () => {
    await creerNotification();
    notifier.enPanne = true;
    await envoyer();
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'A_ENVOYER',
      tentatives: 1,
    });
    notifier.enPanne = false;
    await envoyer();
    expect(notifier.envoyes).toHaveLength(0);
    await envoyer(() => new Date(Date.now() + 6 * 60_000));
    expect(notifier.envoyes).toHaveLength(1);
  });

  it('abandonne après cinq échecs', async () => {
    await creerNotification({ tentatives: 4 });
    notifier.enPanne = true;
    await envoyer();
    await expect(prisma().notification.findFirstOrThrow()).resolves.toMatchObject({
      statut: 'ABANDONNEE',
      tentatives: 5,
    });
  });

  it('une ligne invalide n’empêche pas les suivantes', async () => {
    await creerNotification({ parametres: { type: 'Bilan' } });
    await creerNotification();
    await envoyer();
    expect(notifier.envoyes).toHaveLength(1);
  });
});

async function creerLien(cible: 'DEVIS' | 'COMPTE_RENDU_ESSAI', expireLe: Date) {
  const patient = await prisma().patient.create({
    data: {
      organisationId,
      centreId,
      civilite: 'MME',
      nomNaissance: 'Fictif',
      prenoms: 'Alex',
      dateNaissance: new Date('1950-03-12T00:00:00.000Z'),
      sexe: 'FEMININ',
      nomNaissanceRecherche: 'FICTIF',
      prenomsRecherche: 'ALEX',
    },
  });
  const { utilisateurId } = await prisma().praticien.findUniqueOrThrow({
    where: { id: praticienId },
  });
  const dossier = await prisma().dossier.create({
    data: {
      organisationId,
      patientId: patient.id,
      centreId,
      praticienId,
      oreilles: 'DROITE',
      typeDroite: 'PRIMO',
      dateOuverture: new Date('2030-01-02T00:00:00.000Z'),
      surdicecite: 'v1.fictif',
    },
  });
  return prisma().lienDocument.create({
    data: {
      organisationId,
      dossierId: dossier.id,
      patientId: patient.id,
      cible,
      destinataire: 'PATIENT',
      pdfCle: cible === 'DEVIS' ? 'devis/document' : 'liens-documents/document',
      expireLe,
      createdById: utilisateurId,
    },
  });
}

describe('messages vers un document', () => {
  it('envoie un lien /document, sans nature de document, et le jeton mène au bon lien', async () => {
    const lien = await creerLien('DEVIS', new Date('2099-01-01T00:00:00.000Z'));
    await creerNotification({
      reservationId: null,
      lienDocumentId: lien.id,
      gabarit: 'DOCUMENT_A_CONSULTER',
      parametres: { centre: 'Centre A' },
    });
    await envoyer();
    const texte = notifier.envoyes[0]?.texte ?? '';
    expect(signatureDocument.lire(texte.split('/document/')[1] ?? '')).toEqual({
      organisationId,
      lienId: lien.id,
    });
    expect(texte).not.toMatch(/devis|compte rendu/i);
  });

  it('un message sans source, ou avec les deux, est refusé par la base', async () => {
    await expect(creerNotification({ reservationId: null })).rejects.toThrow();
  });
});

describe('travailPurgeLiensDocument', () => {
  const INSTANT = new Date('2030-06-01T00:00:00.000Z');

  function purgerLiens(stockage: FakeDocumentStore) {
    return executerEnveloppe(
      travailPurgeLiensDocument(stockage, () => INSTANT),
      { organisationId, cleIdempotence: 'purge-liens', charge: {} },
    );
  }

  it('retire un document déposé pour un lien expiré, une seule fois, et garde le reste', async () => {
    const expire = await creerLien('COMPTE_RENDU_ESSAI', new Date('2030-05-01T00:00:00.000Z'));
    await creerLien('DEVIS', new Date('2030-05-01T00:00:00.000Z'));
    const stockage = new FakeDocumentStore();
    await stockage.put('liens-documents/document', new Uint8Array([1]));
    await stockage.put('devis/document', new Uint8Array([1]));
    const supprimer = vi.spyOn(stockage, 'delete');

    await purgerLiens(stockage);
    await purgerLiens(stockage);

    expect(supprimer).toHaveBeenCalledTimes(1);
    expect(stockage.objets.has('devis/document')).toBe(true);
    await expect(
      prisma().lienDocument.findUniqueOrThrow({ where: { id: expire.id } }),
    ).resolves.toMatchObject({ pdfPurgeLe: INSTANT });
  });

  it('laisse un lien encore valable', async () => {
    await creerLien('COMPTE_RENDU_ESSAI', new Date('2031-01-01T00:00:00.000Z'));
    const stockage = new FakeDocumentStore();
    const supprimer = vi.spyOn(stockage, 'delete');
    await purgerLiens(stockage);
    expect(supprimer).not.toHaveBeenCalled();
  });
});

describe('repartirEnvois', () => {
  it('met en file les seuls clients qui ont un message dû, une fois', async () => {
    const travail = travailEnvoi({
      notifier,
      signature,
      signatureDocument,
      urlPublique: 'https://exemple.test',
    });
    await file.declarer(travail, { expireInSeconds: 120 });
    const envoyer = vi.spyOn(file, 'envoyer');
    await repartirEnvois(file, travail);
    expect(envoyer).not.toHaveBeenCalled();
    await creerNotification();
    await creerNotification();
    await repartirEnvois(file, travail);
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0]?.[1]).toMatchObject({ organisationId, cleIdempotence: 'envoi' });
    envoyer.mockRestore();
  });
});

describe('purge', () => {
  it('efface les verrous expirés, garde ceux en cours', async () => {
    await verrou({ nom: 'Fictif' });
    await purger();
    const restants = await prisma().reservationEnLigne.findMany();
    expect(restants.map((r) => r.id)).toEqual([reservationId]);
  });

  it('efface les notifications anciennes, garde celles dues', async () => {
    const ancienne = new Date('2020-01-01T00:00:00.000Z');
    await creerNotification({ statut: 'ENVOYEE', createdAt: ancienne });
    await creerNotification({ statut: 'A_ENVOYER', createdAt: ancienne });
    await creerNotification({ statut: 'ENVOYEE' });
    await purger();
    expect(await prisma().notification.count()).toBe(2);
  });

  it('efface le contact d’un rendez-vous passé avec fiche, garde celui d’un prospect', async () => {
    const utilisateur = await prisma().utilisateur.findFirstOrThrow();
    const rendezVous = (patientId: string | null, heure: number) =>
      prisma().rendezVous.create({
        data: {
          organisationId,
          centreId,
          typeRdvId,
          praticienId,
          debut: new Date(Date.UTC(2020, 0, 6, heure)),
          fin: new Date(Date.UTC(2020, 0, 6, heure, 30)),
          origine: 'INTERNE',
          createdById: utilisateur.id,
          patientId,
          ...(patientId ? {} : { prospectNom: 'Prospect', prospectTelephone: '0600000000' }),
        },
      });
    const patient = await prisma().patient.create({
      data: {
        organisationId,
        centreId,
        civilite: 'MME',
        nomNaissance: 'Fictif',
        nomNaissanceRecherche: 'FICTIF',
        prenoms: 'Alex',
        prenomsRecherche: 'ALEX',
        dateNaissance: new Date('1950-03-12'),
        sexe: 'FEMININ',
      },
    });
    const finalisee = async (patientId: string | null, heure: number) => {
      const { id } = await rendezVous(patientId, heure);
      return verrou({ statut: 'FINALISEE', rendezVousId: id, telephone: '+33600000000' });
    };
    const retrouvee = await finalisee(patient.id, 9);
    const prospect = await finalisee(null, 10);
    await purger();
    const lire = (id: string) => prisma().reservationEnLigne.findUniqueOrThrow({ where: { id } });
    await expect(lire(retrouvee.id)).resolves.toMatchObject({ telephone: null, email: null });
    await expect(lire(prospect.id)).resolves.toMatchObject({ telephone: '+33600000000' });
  });
});

describe('purgerLimitations', () => {
  it('efface les compteurs périmés', async () => {
    const ancien = BigInt(Date.now() - 3 * 86_400_000);
    const recent = BigInt(Date.now());
    await prisma().$executeRaw`
      INSERT INTO limitation_debit (id, key, count, derniere_requete) VALUES
        (gen_random_uuid()::text, 'ancien', 1, ${ancien}::bigint),
        (gen_random_uuid()::text, 'recent', 1, ${recent}::bigint)`;
    await purgerLimitations();
    const cles = await prisma().limitationDebit.findMany({ select: { key: true } });
    expect(cles.map((c) => c.key)).toEqual(['recent']);
  });
});
