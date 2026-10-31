import { randomUUID } from 'node:crypto';

import { FakeCaptcha, FakeClock, FakeNotifier, REPONSE_CAPTCHA_SIMULEE } from '@ha/adapters';
import { prisma } from '@ha/db/admin';
import { HORAIRES_VIDES, type HorairesOuverture } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurConflitAgenda, ErreurSaisie } from '../erreurs';
import { signatureLien } from '../reservation-empreintes';
import {
  annulerRdv,
  changerStatutRdv,
  creerRdv,
  lireAgenda,
  lireRdv,
  listerDemandesEnLigne,
  marquerArrivee,
} from './agenda';
import { creerPatient, fusionnerPatients } from './patients';
import {
  annulerParLien,
  deplacerParLien,
  demanderCode,
  ErreurCreneauIndisponible,
  ErreurParcoursExpire,
  libererVerrou,
  lireCentrePublic,
  lireCreneaux,
  lireCreneauxDuLien,
  lireLien,
  resoudreCentre,
  validerCode,
  verrouillerCreneau,
  type CiblePublique,
  type Dependances,
} from './reservation-en-ligne';
import {
  enregistrerParametresReservation,
  lireParametresReservation,
} from './reservation-parametres';

// Vendredi 4 janvier 2030 : le lundi suivant est libre, à trois jours.
const MAINTENANT = '2030-01-04T10:00:00+01:00';
const LUNDI = '2030-01-07';
const IP = '203.0.113.7';

const HORAIRES: HorairesOuverture = {
  ...HORAIRES_VIDES,
  lundi: [{ debut: '09:00', fin: '12:00' }],
};

const instant = (heure: string, date = LUNDI) => Date.parse(`${date}T${heure}:00+01:00`);

const COORDONNEES = {
  nom: 'Fictif',
  prenom: 'Alex',
  dateNaissance: '12/03/1950',
  telephone: '06 12 34 56 78',
  email: 'alex@exemple.test',
  motif: 'Mes appareils sifflent',
  consentementRgpd: true,
  consentementSms: true,
};

let d: JeuDeDonnees;
let cible: CiblePublique;
let typeBilan: string;
let typeSuivi: string;
let cabine1: string;
let cabine2: string;
let horloge: FakeClock;
let notifier: FakeNotifier;
let deps: Partial<Dependances>;

const captcha = () => `${REPONSE_CAPTCHA_SIMULEE}-${randomUUID()}`;

function choix(changements: Record<string, unknown> = {}) {
  return {
    typeRdvId: typeSuivi,
    praticienId: d.praticiens.praticienAB.id,
    debut: instant('09:00'),
    captcha: captcha(),
    ...changements,
  };
}

function poser(changements: Record<string, unknown> = {}) {
  return verrouillerCreneau(cible, choix(changements), IP, deps);
}

function codeRecu(): string {
  const dernier = notifier.envoyes.at(-1);
  const code = dernier?.canal === 'SMS' ? /\d{6}/.exec(dernier.texte)?.[0] : undefined;
  if (code === undefined) {
    throw new Error('Aucun code envoyé.');
  }
  return code;
}

/** Parcours complet, du créneau à la confirmation. */
async function reserver(
  changements: Record<string, unknown> = {},
  coordonnees: Record<string, unknown> = {},
) {
  const { jeton } = await poser(changements);
  await demanderCode(cible, jeton, { ...COORDONNEES, ...coordonnees }, IP, deps);
  const confirmation = await validerCode(cible, jeton, codeRecu(), IP, deps);
  return { jeton, confirmation };
}

async function derniereReservation() {
  return prisma().reservationEnLigne.findFirstOrThrow({
    orderBy: { createdAt: 'desc' },
    include: { rendezVous: true },
  });
}

async function lienDerniereReservation(): Promise<string> {
  const { id, organisationId } = await derniereReservation();
  return signatureLien().signer({ organisationId, reservationId: id });
}

async function refus(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => {
      throw new Error('Refus attendu.');
    },
    (erreur: unknown) => erreur,
  );
}

async function creerSecondPraticien() {
  const utilisateur = await prisma().utilisateur.create({
    data: {
      organisationId: d.organisation.id,
      prenom: 'Zoé',
      nom: 'Test',
      name: 'Zoé Test',
      email: 'zoe@exemple.test',
      role: 'AUDIO',
      doitChangerMotDePasse: false,
    },
  });
  const praticien = await prisma().praticien.create({
    data: { organisationId: d.organisation.id, utilisateurId: utilisateur.id, rpps: '10000000099' },
  });
  await prisma().praticienCentre.create({
    data: { praticienId: praticien.id, centreId: d.centres.a.id, horaires: HORAIRES as object },
  });
  return praticien.id;
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  const organisationId = d.organisation.id;
  const centreId = d.centres.a.id;
  await prisma().organisation.update({
    where: { id: organisationId },
    data: { slug: 'reseau-test' },
  });
  await prisma().centre.update({
    where: { id: centreId },
    data: { slug: 'centre-a', horairesOuverture: HORAIRES as object },
  });
  await prisma().praticienCentre.update({
    where: { praticienId_centreId: { praticienId: d.praticiens.praticienAB.id, centreId } },
    data: { horaires: HORAIRES as object },
  });
  const type = (nom: string, dureeMinutes: number, requiereCabine: boolean) =>
    prisma().typeRdv.create({
      data: {
        organisationId,
        nom,
        dureeMinutes,
        couleur: '#2563eb',
        requierePraticien: true,
        requiereCabine,
        reservableEnLigne: true,
      },
    });
  const bilan = await type('Bilan', 60, true);
  const suivi = await type('Suivi', 30, false);
  typeBilan = bilan.id;
  typeSuivi = suivi.id;
  const [k1, k2] = await Promise.all(
    ['Cabine 1', 'Cabine 2'].map((nom) =>
      prisma().cabine.create({ data: { organisationId, centreId, nom } }),
    ),
  );
  cabine1 = k1?.id ?? '';
  cabine2 = k2?.id ?? '';
  await prisma().parametresReservation.create({
    data: {
      organisationId,
      centreId,
      actif: true,
      delaiMinimalMinutes: 0,
      horizonJours: 30,
      validation: 'AUTOMATIQUE',
      delaiModificationHeures: 24,
    },
  });
  await prisma().typeRdvEnLigne.createMany({
    data: [
      { organisationId, centreId, typeRdvId: typeBilan },
      { organisationId, centreId, typeRdvId: typeSuivi },
    ],
  });
  cible = await resoudreCentre('reseau-test', 'centre-a');
  horloge = new FakeClock(MAINTENANT);
  notifier = new FakeNotifier();
  deps = { horloge, notifier, captcha: new FakeCaptcha() };
});

describe('page publique', () => {
  it('résout les slugs et montre le centre, ses types et ses praticiens', async () => {
    const centre = await lireCentrePublic(cible);
    expect(centre.nom).toBe('Centre A');
    expect(centre.types.map((t) => t.nom)).toEqual(['Bilan', 'Suivi']);
    expect(centre.praticiens).toHaveLength(1);
  });

  it.each([
    { cas: 'client inconnu', client: 'inconnu', centre: 'centre-a' },
    { cas: 'centre inconnu', client: 'reseau-test', centre: 'inconnu' },
  ])('$cas : refus', async ({ client, centre }) => {
    expect(await refus(resoudreCentre(client, centre))).toBeInstanceOf(AccesRefuseError);
  });

  it('un client suspendu ne reçoit plus de réservations', async () => {
    await prisma().organisation.update({
      where: { id: cible.organisationId },
      data: { statut: 'SUSPENDU' },
    });
    expect(await refus(resoudreCentre('reseau-test', 'centre-a'))).toBeInstanceOf(AccesRefuseError);
  });

  it('un centre sans réservation active répond comme un centre inconnu', async () => {
    await prisma().parametresReservation.update({
      where: { centreId: cible.centreId },
      data: { actif: false },
    });
    expect(await refus(lireCentrePublic(cible))).toBeInstanceOf(AccesRefuseError);
  });

  it('un type que le centre n’a pas retenu ne se réserve pas', async () => {
    await prisma().typeRdvEnLigne.deleteMany({ where: { typeRdvId: typeSuivi } });
    expect((await lireCentrePublic(cible)).types.map((t) => t.nom)).toEqual(['Bilan']);
    const erreur = await refus(
      lireCreneaux(cible, { typeRdvId: typeSuivi, depuis: LUNDI }, IP, deps),
    );
    expect(erreur).toBeInstanceOf(ErreurSaisie);
  });

  it('un type que le client ne déclare pas réservable ne se réserve pas', async () => {
    await prisma().typeRdv.update({
      where: { id: typeSuivi },
      data: { reservableEnLigne: false },
    });
    expect((await lireCentrePublic(cible)).types.map((t) => t.nom)).toEqual(['Bilan']);
  });
});

describe('horizon et délai minimal', () => {
  async function regler(changements: Record<string, number>) {
    await prisma().parametresReservation.update({
      where: { centreId: cible.centreId },
      data: changements,
    });
  }

  async function premierInstant() {
    const { instants } = await lireCreneaux(
      cible,
      { typeRdvId: typeSuivi, depuis: '2030-01-04' },
      IP,
      deps,
    );
    return instants[0]?.heure;
  }

  it('sans contrainte, le premier créneau du lundi est proposé', async () => {
    expect(await premierInstant()).toBe('09:00');
  });

  it('le délai minimal du centre écarte les créneaux trop proches', async () => {
    // Du vendredi 10 h au lundi 10 h : 72 heures.
    await regler({ delaiMinimalMinutes: 72 * 60 });
    expect(await premierInstant()).toBe('10:00');
  });

  it('le délai du type l’emporte quand il est plus long', async () => {
    await prisma().typeRdv.update({
      where: { id: typeSuivi },
      data: { delaiMinimalMinutes: 73 * 60 },
    });
    expect(await premierInstant()).toBe('11:00');
  });

  it('un verrou ne se pose pas avant le délai minimal', async () => {
    await regler({ delaiMinimalMinutes: 72 * 60 });
    expect(await refus(poser())).toBeInstanceOf(ErreurCreneauIndisponible);
    await expect(poser({ debut: instant('10:00') })).resolves.toBeDefined();
  });

  it('l’horizon borne les jours proposés, et le verrou', async () => {
    // Trois jours : jusqu'au lundi 7 inclus ; deux jours : plus de lundi.
    await regler({ horizonJours: 3 });
    expect(await premierInstant()).toBe('09:00');
    await regler({ horizonJours: 2 });
    expect(await premierInstant()).toBeUndefined();
    expect(await refus(poser())).toBeInstanceOf(ErreurCreneauIndisponible);
  });

  it('la lecture s’arrête en fin d’horizon', async () => {
    await regler({ horizonJours: 3 });
    const { suite } = await lireCreneaux(
      cible,
      { typeRdvId: typeSuivi, depuis: '2030-01-04' },
      IP,
      deps,
    );
    expect(suite).toBeNull();
    const auDela = await lireCreneaux(
      cible,
      { typeRdvId: typeSuivi, depuis: '2030-02-01' },
      IP,
      deps,
    );
    expect(auDela).toEqual({ instants: [], suite: null });
  });

  it('le délai se juge au choix du créneau : saisir son code ne fait pas perdre la place', async () => {
    await regler({ delaiMinimalMinutes: 72 * 60 });
    const { jeton } = await poser({ debut: instant('10:00') });
    horloge.regler('2030-01-04T10:10:00+01:00');
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    await expect(validerCode(cible, jeton, codeRecu(), IP, deps)).resolves.toMatchObject({
      heure: '10:00',
    });
  });

  it('un horizon réduit après le verrou l’emporte à la finalisation', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    await regler({ horizonJours: 1 });
    expect(await refus(validerCode(cible, jeton, codeRecu(), IP, deps))).toBeInstanceOf(
      ErreurCreneauIndisponible,
    );
    expect(await prisma().rendezVous.count()).toBe(0);
  });
});

describe('deux réservations simultanées', () => {
  it('sur un même créneau, un seul verrou est posé', async () => {
    const resultats = await Promise.allSettled([poser(), poser(), poser(), poser()]);
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refuses = resultats.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    expect(refuses.every((e) => e instanceof ErreurCreneauIndisponible)).toBe(true);
    expect(await prisma().reservationEnLigne.count()).toBe(1);
  });

  it('jusqu’au bout du parcours, un seul rendez-vous existe', async () => {
    const parcours = await Promise.allSettled([reserver(), reserver(), reserver()]);
    expect(parcours.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma().rendezVous.count()).toBe(1);
  });

  it('« peu importe » répartit deux patients simultanés sur deux praticiens', async () => {
    await creerSecondPraticien();
    const resultats = await Promise.all([poser({ praticienId: '' }), poser({ praticienId: '' })]);
    expect(resultats).toHaveLength(2);
    const verrous = await prisma().reservationEnLigne.findMany();
    expect(new Set(verrous.map((v) => v.praticienId)).size).toBe(2);
  });

  it('« peu importe » donne une cabine différente à chacun', async () => {
    await creerSecondPraticien();
    await Promise.all([
      poser({ praticienId: '', typeRdvId: typeBilan }),
      poser({ praticienId: '', typeRdvId: typeBilan }),
    ]);
    const verrous = await prisma().reservationEnLigne.findMany();
    expect(new Set(verrous.map((v) => v.cabineId))).toEqual(new Set([cabine1, cabine2]));
  });

  it('un double envoi du code ne crée qu’un rendez-vous, avec la même réponse', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    const code = codeRecu();
    const [a, b] = await Promise.all([
      validerCode(cible, jeton, code, IP, deps),
      validerCode(cible, jeton, code, IP, deps),
    ]);
    expect(a).toEqual(b);
    expect(await prisma().rendezVous.count()).toBe(1);
    await expect(validerCode(cible, jeton, code, IP, deps)).resolves.toEqual(a);
  });

  it('un créneau verrouillé disparaît pour le patient suivant', async () => {
    await poser();
    const { instants } = await lireCreneaux(
      cible,
      { typeRdvId: typeSuivi, depuis: LUNDI },
      IP,
      deps,
    );
    expect(instants.map((i) => i.heure)).not.toContain('09:00');
    expect(instants.map((i) => i.heure)).toContain('09:30');
  });
});

describe('verrou', () => {
  it('un verrou expiré se reprend', async () => {
    await poser();
    horloge.regler('2030-01-04T10:16:00+01:00');
    await expect(poser()).resolves.toBeDefined();
    expect(await prisma().reservationEnLigne.count()).toBe(1);
  });

  it('le verrou se libère à la demande', async () => {
    const { jeton } = await poser();
    await libererVerrou(cible, jeton);
    await expect(poser()).resolves.toBeDefined();
  });

  it('un parcours expiré ne se termine pas', async () => {
    const { jeton } = await poser();
    horloge.regler('2030-01-04T10:16:00+01:00');
    expect(await refus(demanderCode(cible, jeton, COORDONNEES, IP, deps))).toBeInstanceOf(
      ErreurParcoursExpire,
    );
  });

  it('une réponse au captcha ne se rejoue pas', async () => {
    const reponse = captcha();
    await poser({ captcha: reponse });
    const erreur = await refus(poser({ debut: instant('10:00'), captcha: reponse }));
    expect(erreur).toBeInstanceOf(ErreurSaisie);
    expect((erreur as ErreurSaisie).erreurs.captcha).toBeDefined();
  });

  it('un captcha faux est refusé', async () => {
    const erreur = await refus(poser({ captcha: 'faux' }));
    expect((erreur as ErreurSaisie).erreurs.captcha).toBeDefined();
  });

  it('un visiteur ne pose pas plus de verrous que sa limite', async () => {
    const essais = Array.from({ length: 11 }, () =>
      poser({ debut: instant('09:00'), captcha: captcha() }).catch((e: unknown) => e),
    );
    const resultats = await Promise.all(essais);
    const limites = resultats.filter(
      (r) => r instanceof ErreurSaisie && r.message.startsWith('Trop de tentatives'),
    );
    expect(limites).toHaveLength(1);
  });
});

describe('verrou et agenda interne', () => {
  function rdvInterne(changements: Record<string, unknown> = {}) {
    return {
      centreId: d.centres.a.id,
      typeRdvId: typeSuivi,
      prospectNom: 'Prospect Test',
      prospectTelephone: '0600000000',
      date: LUNDI,
      heure: '09:00',
      dureeMinutes: 30,
      praticienId: d.praticiens.praticienAB.id,
      origine: 'INTERNE',
      ...changements,
    };
  }

  it('l’agenda montre le verrou sans identité', async () => {
    await poser();
    const agenda = await lireAgenda(d.acteurs.audioAB, d.centres.a.id, LUNDI, LUNDI);
    expect(agenda.verrous).toEqual([
      expect.objectContaining({ praticienId: d.praticiens.praticienAB.id }),
    ]);
    expect(Object.keys(agenda.verrous[0] ?? {}).sort()).toEqual([
      'cabineId',
      'debut',
      'fin',
      'praticienId',
    ]);
  });

  it('l’accueil voit le conflit, et peut passer outre : un anonyme ne gèle pas l’agenda', async () => {
    await poser();
    const erreur = await refus(creerRdv(d.acteurs.audioAB, rdvInterne()));
    expect(erreur).toBeInstanceOf(ErreurConflitAgenda);
    expect((erreur as ErreurConflitAgenda).confirmable).toBe(true);
    await expect(
      creerRdv(d.acteurs.audioAB, rdvInterne({ confirmerHorsDisponibilites: true })),
    ).resolves.toBeDefined();
  });

  it('l’accueil passé outre, la finalisation échoue sans double rendez-vous', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    await creerRdv(d.acteurs.audioAB, rdvInterne({ confirmerHorsDisponibilites: true }));
    expect(await refus(validerCode(cible, jeton, codeRecu(), IP, deps))).toBeInstanceOf(
      ErreurCreneauIndisponible,
    );
    expect(await prisma().rendezVous.count()).toBe(1);
    expect(await prisma().reservationEnLigne.count()).toBe(0);
  });

  it('une fermeture posée depuis le verrou fait échouer la finalisation', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    await prisma().exceptionAgenda.create({
      data: {
        organisationId: d.organisation.id,
        type: 'FERMETURE_CENTRE',
        centreId: d.centres.a.id,
        debut: new Date(instant('00:00')),
        fin: new Date(instant('23:00')),
        createdById: d.utilisateurs.admin.id,
      },
    });
    expect(await refus(validerCode(cible, jeton, codeRecu(), IP, deps))).toBeInstanceOf(
      ErreurCreneauIndisponible,
    );
    expect(await prisma().rendezVous.count()).toBe(0);
  });
});

describe('code SMS', () => {
  it('le code part par le port Notifier, jamais en clair en base', async () => {
    const { jeton } = await poser();
    await expect(demanderCode(cible, jeton, COORDONNEES, IP, deps)).resolves.toMatchObject({
      telephone: '06 •• •• •• 78',
    });
    const code = codeRecu();
    const ligne = await prisma().reservationEnLigne.findFirstOrThrow();
    expect(ligne.codeEmpreinte).not.toContain(code);
    expect(await prisma().notification.count()).toBe(0);
    expect(notifier.envoyes.at(-1)).toMatchObject({ destinataire: '+33612345678' });
  });

  it('le motif est chiffré en base', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    const ligne = await prisma().reservationEnLigne.findFirstOrThrow();
    expect(ligne.motif).toMatch(/^v1\./);
  });

  it('un mauvais code est refusé, et le créneau tient', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    const faux = codeRecu() === '000000' ? '000001' : '000000';
    const erreur = await refus(validerCode(cible, jeton, faux, IP, deps));
    expect((erreur as ErreurSaisie).erreurs.code).toBeDefined();
    await expect(validerCode(cible, jeton, codeRecu(), IP, deps)).resolves.toBeDefined();
  });

  it('des essais en parallèle ne dépassent pas le plafond, et le code ne sert plus', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    const code = codeRecu();
    const faux = code === '000000' ? '000001' : '000000';
    await Promise.allSettled(
      Array.from({ length: 12 }, () => validerCode(cible, jeton, faux, IP, deps)),
    );
    expect(await refus(validerCode(cible, jeton, code, IP, deps))).toBeInstanceOf(
      ErreurParcoursExpire,
    );
    expect(await prisma().rendezVous.count()).toBe(0);
    expect(await prisma().reservationEnLigne.count()).toBe(0);
  });

  it('les envois sont plafonnés par réservation', async () => {
    const { jeton } = await poser();
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    await demanderCode(cible, jeton, COORDONNEES, IP, deps);
    expect(await refus(demanderCode(cible, jeton, COORDONNEES, IP, deps))).toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it('le numéro est limité, sous ses deux écritures', async () => {
    const jetons = await Promise.all(
      ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'].map(async (heure) => {
        const { jeton } = await poser({ debut: instant(heure) });
        return jeton;
      }),
    );
    const ecritures = ['0612345678', '+33612345678'];
    const resultats = await Promise.all(
      jetons.map((jeton, i) =>
        demanderCode(cible, jeton, { ...COORDONNEES, telephone: ecritures[i % 2] }, IP, deps).catch(
          (e: unknown) => e,
        ),
      ),
    );
    expect(resultats.filter((r) => r instanceof ErreurSaisie)).toHaveLength(1);
  });

  it('une panne du SMS se dit au patient', async () => {
    const { jeton } = await poser();
    notifier.enPanne = true;
    await expect(demanderCode(cible, jeton, COORDONNEES, IP, deps)).rejects.toThrow();
  });
});

describe('rapprochement', () => {
  const FICHE = {
    civilite: 'MME',
    nomNaissance: 'Fictif',
    prenoms: 'Alex',
    dateNaissance: '12/03/1950',
    sexe: 'FEMININ',
    telephone: '0612345678',
    consentementSms: false,
    consentementEmail: false,
    consentementCourrier: false,
    amoC2s: false,
    amoAld: false,
  };

  function fiche(changements: Record<string, unknown> = {}) {
    return creerPatient(
      d.acteurs.admin,
      { ...FICHE, centreId: d.centres.a.id, ...changements },
      { confirmerDoublon: true },
    );
  }

  it('une fiche concordante reçoit le rendez-vous', async () => {
    const patientId = await fiche();
    await reserver();
    const { rendezVous } = await derniereReservation();
    expect(rendezVous).toMatchObject({ patientId, prospectNom: null, prospectTelephone: null });
  });

  it('l’identité saisie s’efface, le contact reste pour les messages', async () => {
    await fiche();
    await reserver();
    expect(await derniereReservation()).toMatchObject({
      nom: null,
      prenom: null,
      dateNaissance: null,
      motif: null,
      codeEmpreinte: null,
      telephone: '+33612345678',
    });
  });

  it('le consentement aux rappels est reporté sur la fiche, et journalisé', async () => {
    const patientId = await fiche();
    await reserver();
    const { consentementSms } = await prisma().patient.findUniqueOrThrow({
      where: { id: patientId },
    });
    expect(consentementSms).toBe(true);
    const lignes = await prisma().journalAudit.findMany({
      where: { entiteType: 'PATIENT', entiteId: patientId, utilisateurId: null },
    });
    expect(lignes).toHaveLength(1);
  });

  it('l’e-mail saisi, non vérifié, ne s’écrit jamais sur une fiche', async () => {
    const patientId = await fiche({ email: 'ancien@exemple.test' });
    await reserver();
    const { email } = await prisma().patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(email).toBe('ancien@exemple.test');
  });

  it.each([
    { cas: 'autre téléphone', changements: { telephone: '0700000000' } },
    { cas: 'autre date de naissance', changements: { dateNaissance: '13/03/1950' } },
    { cas: 'autre nom', changements: { nomNaissance: 'Autre' } },
  ])('$cas : prospect', async ({ changements }) => {
    await fiche(changements);
    await reserver();
    const { rendezVous } = await derniereReservation();
    expect(rendezVous).toMatchObject({
      patientId: null,
      prospectNom: 'Fictif Alex',
      prospectTelephone: '+33612345678',
    });
  });

  it('jumeaux au même numéro : le prénom départage', async () => {
    await fiche({ prenoms: 'Louise' });
    const patientId = await fiche();
    await reserver();
    expect((await derniereReservation()).rendezVous?.patientId).toBe(patientId);
  });

  it('une fiche fusionnée n’est pas retrouvée, sa fiche conservée oui', async () => {
    const conservee = await fiche({ nomNaissance: 'Conservee', telephone: '0700000000' });
    const doublon = await fiche();
    await fusionnerPatients(d.acteurs.admin, conservee, doublon, {});
    await reserver();
    expect((await derniereReservation()).rendezVous?.patientId).toBeNull();
  });

  it('la réponse ne dit pas si une fiche existe', async () => {
    const prospect = await reserver();
    await prisma().notification.deleteMany();
    await prisma().reservationEnLigne.deleteMany();
    await prisma().evenementDomaine.deleteMany();
    await prisma().rendezVous.deleteMany();
    await fiche();
    const patient = await reserver();
    expect(patient.confirmation).toEqual(prospect.confirmation);
  });

  it('un prospect devient patient à son arrivée, avec son e-mail et son consentement', async () => {
    await reserver();
    const { rendezVous, id } = await derniereReservation();
    if (!rendezVous) {
      throw new Error('Rendez-vous attendu.');
    }
    const detail = await lireRdv(d.acteurs.audioAB, rendezVous.id);
    expect(detail.identiteEnLigne).toEqual({
      nom: 'Fictif',
      prenom: 'Alex',
      dateNaissance: '1950-03-12',
      email: 'alex@exemple.test',
      consentementSms: true,
    });
    await marquerArrivee(d.acteurs.audioAB, rendezVous.id, {
      version: rendezVous.version,
      prospect: {
        mode: 'NOUVEAU',
        civilite: 'MME',
        nomNaissance: 'Fictif',
        prenoms: 'Alex',
        dateNaissance: '12/03/1950',
        sexe: 'FEMININ',
        confirmerDoublon: false,
      },
    });
    const patient = await prisma().patient.findFirstOrThrow({
      where: { nomNaissance: 'Fictif' },
    });
    expect(patient).toMatchObject({
      email: 'alex@exemple.test',
      consentementSms: true,
      telephone: '+33612345678',
    });
    expect(await prisma().reservationEnLigne.findUniqueOrThrow({ where: { id } })).toMatchObject({
      nom: null,
      prenom: null,
      dateNaissance: null,
    });
  });
});

describe('confirmation', () => {
  it('écrit le rendez-vous, l’audit, l’événement et les messages sans donnée de santé', async () => {
    const { confirmation } = await reserver();
    expect(confirmation).toEqual({ date: LUNDI, heure: '09:00', aValider: false });
    const { rendezVous, id } = await derniereReservation();
    expect(rendezVous).toMatchObject({
      statut: 'CONFIRME',
      origine: 'EN_LIGNE',
      createdById: null,
    });
    expect(rendezVous?.notes).toMatch(/^v1\./);
    const journal = await prisma().journalAudit.findFirstOrThrow({
      where: { entiteType: 'RENDEZ_VOUS', entiteId: rendezVous?.id ?? '' },
    });
    expect(journal).toMatchObject({
      action: 'CREATE',
      utilisateurId: null,
      utilisateurLibelle: 'Réservation en ligne',
    });
    expect(await prisma().evenementDomaine.count({ where: { type: 'RDV_CREE' } })).toBe(1);
    const messages = await prisma().notification.findMany({ where: { reservationId: id } });
    expect(messages.map((m) => m.canal).sort()).toEqual(['EMAIL', 'SMS']);
    expect(messages.every((m) => m.destinataire.startsWith('v1.'))).toBe(true);
    expect(messages.every((m) => m.gabarit === 'RDV_CONFIRME')).toBe(true);
    expect(JSON.stringify(messages.map((m) => m.parametres))).not.toMatch(/Suivi|sifflent|Fictif/);
  });

  it('sans e-mail, seul le SMS part', async () => {
    await reserver({}, { email: '' });
    expect(await prisma().notification.count()).toBe(1);
  });

  it('écrit le motif dans les notes du rendez-vous, déchiffrables par l’équipe', async () => {
    await reserver();
    const { rendezVous } = await derniereReservation();
    const detail = await lireRdv(d.acteurs.audioAB, rendezVous?.id ?? '');
    expect(detail.notes).toBe('Motif saisi en ligne : Mes appareils sifflent');
  });
});

describe('validation manuelle', () => {
  beforeEach(async () => {
    await prisma().parametresReservation.update({
      where: { centreId: cible.centreId },
      data: { validation: 'MANUELLE' },
    });
  });

  async function rdvEnAttente() {
    await reserver();
    const { rendezVous } = await derniereReservation();
    if (!rendezVous) {
      throw new Error('Rendez-vous attendu.');
    }
    return rendezVous;
  }

  it('la demande attend le centre, et le patient le sait', async () => {
    const { confirmation } = await reserver();
    expect(confirmation.aValider).toBe(true);
    expect((await derniereReservation()).rendezVous?.statut).toBe('PLANIFIE');
    const messages = await prisma().notification.findMany();
    expect(messages.every((m) => m.gabarit === 'RDV_DEMANDE_RECUE')).toBe(true);
    const demandes = await listerDemandesEnLigne(d.acteurs.audioAB, d.centres.a.id);
    expect(demandes).toHaveLength(1);
  });

  it('accepter prévient le patient et sort la demande de la liste', async () => {
    const rdv = await rdvEnAttente();
    await changerStatutRdv(d.acteurs.audioAB, rdv.id, { version: rdv.version, statut: 'CONFIRME' });
    expect(await prisma().notification.count({ where: { gabarit: 'RDV_ACCEPTE' } })).toBe(2);
    await expect(listerDemandesEnLigne(d.acteurs.audioAB, d.centres.a.id)).resolves.toEqual([]);
  });

  it('refuser prévient le patient et libère le créneau', async () => {
    const rdv = await rdvEnAttente();
    await annulerRdv(d.acteurs.audioAB, rdv.id, rdv.version);
    expect(await prisma().notification.count({ where: { gabarit: 'RDV_REFUSE' } })).toBe(2);
    await expect(poser()).resolves.toBeDefined();
  });

  it('un déplacement par le patient repasse à valider', async () => {
    const rdv = await rdvEnAttente();
    await changerStatutRdv(d.acteurs.audioAB, rdv.id, { version: rdv.version, statut: 'CONFIRME' });
    const confirmation = await deplacerParLien(
      await lienDerniereReservation(),
      { debut: instant('10:00'), praticienId: '' },
      IP,
      deps,
    );
    expect(confirmation.aValider).toBe(true);
    expect((await derniereReservation()).rendezVous?.statut).toBe('PLANIFIE');
  });
});

describe('annulation par lien', () => {
  it('annule, libère le créneau et prévient le patient', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    await annulerParLien(lien, IP, deps);
    const { rendezVous } = await derniereReservation();
    expect(rendezVous?.statut).toBe('ANNULE');
    expect(await prisma().notification.count({ where: { gabarit: 'RDV_ANNULE' } })).toBe(2);
    expect(await prisma().evenementDomaine.count({ where: { type: 'RDV_ANNULE' } })).toBe(1);
    await expect(poser()).resolves.toBeDefined();
    const journal = await prisma().journalAudit.findMany({
      where: { entiteId: rendezVous?.id ?? '', action: 'UPDATE' },
    });
    expect(journal).toHaveLength(1);
    expect(journal[0]?.utilisateurLibelle).toBe('Réservation en ligne');
  });

  it('un second clic ne fait rien de plus', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    await annulerParLien(lien, IP, deps);
    expect(await refus(annulerParLien(lien, IP, deps))).toBeInstanceOf(ErreurSaisie);
    expect((await lireLien(lien, IP, deps)).statut).toBe('ANNULE');
  });

  it('hors délai, le lien refuse et renvoie vers le centre', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    horloge.regler('2030-01-06T09:30:00+01:00');
    expect((await lireLien(lien, IP, deps)).modifiable).toBe(false);
    expect(await refus(annulerParLien(lien, IP, deps))).toBeInstanceOf(ErreurSaisie);
    expect((await derniereReservation()).rendezVous?.statut).toBe('CONFIRME');
  });

  it('à la limite exacte, le lien fonctionne encore', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    horloge.regler('2030-01-06T09:00:00+01:00');
    await expect(annulerParLien(lien, IP, deps)).resolves.toBeUndefined();
  });

  it('un patient arrivé ne s’annule pas depuis son téléphone', async () => {
    await prisma().parametresReservation.update({
      where: { centreId: cible.centreId },
      data: { delaiModificationHeures: 0 },
    });
    await reserver();
    const { rendezVous } = await derniereReservation();
    await prisma().rendezVous.update({
      where: { id: rendezVous?.id ?? '' },
      data: {
        statut: 'ARRIVE',
        prospectNom: null,
        prospectTelephone: null,
        patientId: await creerPatient(
          d.acteurs.admin,
          {
            civilite: 'MME',
            nomNaissance: 'Arrive',
            prenoms: 'Alex',
            dateNaissance: '12/03/1951',
            sexe: 'FEMININ',
            consentementSms: false,
            consentementEmail: false,
            consentementCourrier: false,
            amoC2s: false,
            amoAld: false,
            centreId: d.centres.a.id,
          },
          { confirmerDoublon: true },
        ),
      },
    });
    expect(await refus(annulerParLien(await lienDerniereReservation(), IP, deps))).toBeInstanceOf(
      ErreurSaisie,
    );
  });

  it.each([
    { cas: 'jeton forgé', falsifier: (lien: string) => `${lien.slice(0, -1)}x` },
    { cas: 'autre réservation', falsifier: (lien: string) => lien.replace(/\.[^.]+\./, '.autre.') },
    { cas: 'charabia', falsifier: () => 'n-importe-quoi' },
  ])('$cas : refus sans rien lire', async ({ falsifier }) => {
    await reserver();
    const lien = falsifier(await lienDerniereReservation());
    expect(await refus(annulerParLien(lien, IP, deps))).toBeInstanceOf(AccesRefuseError);
    expect(await refus(lireLien(lien, IP, deps))).toBeInstanceOf(AccesRefuseError);
    expect((await derniereReservation()).rendezVous?.statut).toBe('CONFIRME');
  });

  it('un lien signé pour un autre client ne lit rien : la RLS tient', async () => {
    await reserver();
    const { id } = await derniereReservation();
    const autre = await creerJeuDeDonnees('-b');
    const lien = signatureLien().signer({
      organisationId: autre.organisation.id,
      reservationId: id,
    });
    expect(await refus(lireLien(lien, IP, deps))).toBeInstanceOf(AccesRefuseError);
  });

  it('le lien survit à l’arrêt de la réservation et au renommage', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    await prisma().parametresReservation.update({
      where: { centreId: cible.centreId },
      data: { actif: false },
    });
    await prisma().centre.update({ where: { id: cible.centreId }, data: { slug: 'nouveau' } });
    await prisma().organisation.update({
      where: { id: cible.organisationId },
      data: { slug: 'nouveau-client' },
    });
    expect(await lireLien(lien, IP, deps)).toMatchObject({ modifiable: true, deplacable: false });
    await expect(annulerParLien(lien, IP, deps)).resolves.toBeUndefined();
  });

  it('la page du lien ne dévoile ni nom, ni type, ni motif', async () => {
    await reserver();
    const etat = await lireLien(await lienDerniereReservation(), IP, deps);
    expect(JSON.stringify(etat)).not.toMatch(/Fictif|Alex|Suivi|sifflent/);
  });
});

describe('déplacement par lien', () => {
  it('déplace, prévient le patient et libère l’ancien créneau', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    await expect(
      deplacerParLien(lien, { debut: instant('10:00') }, IP, deps),
    ).resolves.toMatchObject({ heure: '10:00', aValider: false });
    const { rendezVous } = await derniereReservation();
    expect(rendezVous?.debut.getTime()).toBe(instant('10:00'));
    expect(rendezVous?.statut).toBe('CONFIRME');
    expect(await prisma().notification.count({ where: { gabarit: 'RDV_DEPLACE' } })).toBe(2);
    expect(await prisma().evenementDomaine.count({ where: { type: 'RDV_DEPLACE' } })).toBe(1);
    await expect(poser()).resolves.toBeDefined();
  });

  it('propose ses propres créneaux sans se gêner', async () => {
    await reserver();
    const { instants } = await lireCreneauxDuLien(await lienDerniereReservation(), LUNDI, IP, deps);
    expect(instants.map((i) => i.heure)).toContain('09:00');
  });

  it('ne vole pas un créneau verrouillé par un autre patient', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    await poser({ debut: instant('10:00') });
    expect(
      await refus(deplacerParLien(lien, { debut: instant('10:00') }, IP, deps)),
    ).toBeInstanceOf(ErreurCreneauIndisponible);
  });

  it('respecte l’horizon, le délai minimal et les disponibilités', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    const debutRefuse = [
      instant('13:00'),
      instant('09:00', '2030-03-04'),
      Date.parse('2030-01-04T11:00:00+01:00'),
    ];
    for (const debut of debutRefuse) {
      expect(await refus(deplacerParLien(lien, { debut }, IP, deps))).toBeInstanceOf(
        ErreurCreneauIndisponible,
      );
    }
  });

  it('hors délai ou réservation arrêtée, le déplacement est refusé', async () => {
    await reserver();
    const lien = await lienDerniereReservation();
    horloge.regler('2030-01-06T09:30:00+01:00');
    expect(
      await refus(deplacerParLien(lien, { debut: instant('10:00') }, IP, deps)),
    ).toBeInstanceOf(ErreurSaisie);
    horloge.regler(MAINTENANT);
    await prisma().parametresReservation.update({
      where: { centreId: cible.centreId },
      data: { actif: false },
    });
    expect(
      await refus(deplacerParLien(lien, { debut: instant('10:00') }, IP, deps)),
    ).toBeInstanceOf(AccesRefuseError);
  });
});

describe('paramètres par centre', () => {
  const SAISIE = {
    actif: true,
    delaiMinimalMinutes: '60',
    horizonJours: '30',
    validation: 'MANUELLE',
    delaiModificationHeures: '48',
    slug: 'mon-centre',
  };

  it('un responsable règle son centre, et l’écriture est journalisée', async () => {
    await enregistrerParametresReservation(d.acteurs.admin, d.centres.a.id, {
      ...SAISIE,
      typeRdvIds: [typeSuivi],
    });
    const lus = await lireParametresReservation(d.acteurs.admin, d.centres.a.id);
    expect(lus).toMatchObject({
      validation: 'MANUELLE',
      delaiModificationHeures: 48,
      slug: 'mon-centre',
      slugClient: 'reseau-test',
    });
    expect(lus.types.filter((t) => t.retenu).map((t) => t.nom)).toEqual(['Suivi']);
    const journal = await prisma().journalAudit.findMany({
      where: { entiteType: 'PARAMETRES_RESERVATION', entiteId: d.centres.a.id },
    });
    expect(journal).toHaveLength(1);
  });

  it('un centre jamais ouvert affiche les réglages par défaut, fermé', async () => {
    await expect(lireParametresReservation(d.acteurs.admin, d.centres.b.id)).resolves.toMatchObject(
      { actif: false, delaiMinimalMinutes: 1440, horizonJours: 60 },
    );
  });

  it('un type non réservable du client n’est pas retenu', async () => {
    const type = await prisma().typeRdv.create({
      data: {
        organisationId: d.organisation.id,
        nom: 'SAV',
        dureeMinutes: 15,
        couleur: '#2563eb',
        requierePraticien: true,
        requiereCabine: false,
      },
    });
    await enregistrerParametresReservation(d.acteurs.admin, d.centres.a.id, {
      ...SAISIE,
      typeRdvIds: [type.id, typeSuivi],
    });
    const retenus = await prisma().typeRdvEnLigne.findMany({ where: { centreId: d.centres.a.id } });
    expect(retenus.map((r) => r.typeRdvId)).toEqual([typeSuivi]);
  });

  it('une adresse déjà prise dans le client est refusée', async () => {
    await prisma().centre.update({ where: { id: d.centres.b.id }, data: { slug: 'mon-centre' } });
    const erreur = await refus(
      enregistrerParametresReservation(d.acteurs.admin, d.centres.a.id, {
        ...SAISIE,
        typeRdvIds: [],
      }),
    );
    expect((erreur as ErreurSaisie).erreurs.slug).toBeDefined();
  });

  it.each([
    { cas: 'assistant', acteur: () => d.acteurs.assistantA, centre: () => d.centres.a.id },
    { cas: 'audio', acteur: () => d.acteurs.audioAB, centre: () => d.centres.a.id },
  ])('$cas : refusé', async ({ acteur, centre }) => {
    expect(
      await refus(
        enregistrerParametresReservation(acteur(), centre(), { ...SAISIE, typeRdvIds: [] }),
      ),
    ).toBeInstanceOf(AccesRefuseError);
    expect(await refus(lireParametresReservation(acteur(), centre()))).toBeInstanceOf(
      AccesRefuseError,
    );
  });

  it('un autre client ne règle pas ce centre', async () => {
    const autre = await creerJeuDeDonnees('-b');
    expect(
      await refus(
        enregistrerParametresReservation(autre.acteurs.admin, d.centres.a.id, {
          ...SAISIE,
          typeRdvIds: [],
        }),
      ),
    ).toBeInstanceOf(AccesRefuseError);
  });
});
