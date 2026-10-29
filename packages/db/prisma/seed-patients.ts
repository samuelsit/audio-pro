import {
  chargerCleEmpreinte,
  chargerTrousseau,
  ChiffreurAesGcm,
  EmpreinteHmac,
} from '@ha/adapters';
import { cleNir, normaliserPourRecherche } from '@ha/domain';

import type { PrismaClient } from '../src/generated/prisma/client';
import type { Civilite, QualiteBeneficiaire, Sexe } from '../src/generated/prisma/enums';

// 30 patients fictifs (noms combinés, e-mails en exemple.test, téléphones en 06 00 00 xx xx).
// NIR fictifs : commune « 999 », clé calculée par le domaine. Aucune donnée réelle.
// Le seed écrit sans l'extension Prisma de l'application : il chiffre et calcule les empreintes
// lui-même, avec les mêmes contextes que apps/web/server/chiffrement.ts.

const CONTEXTE_NIR = 'couverture_amo.nir';

export interface CentresDemo {
  readonly nord: string;
  readonly centre: string;
  readonly sud: string;
}

interface Amo {
  /** 13 caractères sans la clé. */
  nir13: string;
  rang?: number;
  qualite?: QualiteBeneficiaire;
  c2s?: boolean;
  ald?: boolean;
  finDroits?: string;
  vitale?: boolean;
}

interface Amc {
  organismeNom: string;
  organismeIdentifiant?: string;
  numeroAdherent?: string;
  typeContrat?: string;
  debutValidite?: string;
  finValidite?: string;
}

interface PatientDemo {
  n: number;
  centre: keyof CentresDemo;
  civilite: Civilite;
  nomNaissance: string;
  nomUsage?: string;
  prenoms: string;
  dateNaissance: string;
  ville?: [string, string];
  sms?: boolean;
  email?: boolean;
  courrier?: boolean;
  medecin?: string;
  notes?: string;
  amo?: Amo;
  amc?: Amc;
}

const MUTUELLE_A: Amc = {
  organismeNom: 'Mutuelle Démo Avenir',
  organismeIdentifiant: '99999991',
  typeContrat: 'Contrat responsable',
  debutValidite: '2026-01-01',
  finValidite: '2026-12-31',
};
const MUTUELLE_B: Amc = {
  organismeNom: 'Prévoyance Fictive',
  organismeIdentifiant: '99999992',
  typeContrat: 'Contrat collectif',
  debutValidite: '2025-07-01',
};

/** NIR fictif : sexe, année et mois de naissance, département, commune 999, ordre. */
function nir(sexe: 1 | 2, naissance: string, departement: string, ordre: number): string {
  return `${sexe}${naissance.slice(2, 4)}${naissance.slice(5, 7)}${departement}999${String(ordre).padStart(3, '0')}`;
}

const NIR_PARENT_DURAND = nir(2, '1981-04-12', '59', 101);
const NIR_PARENT_ROUX = nir(1, '1978-09-03', '45', 102);

const PATIENTS: readonly PatientDemo[] = [
  // Centre Démo Nord
  {
    n: 1,
    centre: 'nord',
    civilite: 'MME',
    nomNaissance: 'Lemaire',
    nomUsage: 'Durand',
    prenoms: 'Claire',
    dateNaissance: '1981-04-12',
    ville: ['59000', 'Lille'],
    sms: true,
    amo: { nir13: NIR_PARENT_DURAND, vitale: true },
    amc: { ...MUTUELLE_A, numeroAdherent: 'AV-0001' },
  },
  {
    n: 2,
    centre: 'nord',
    civilite: 'M',
    nomNaissance: 'Durand',
    prenoms: 'Hugo',
    dateNaissance: '2012-06-20',
    ville: ['59000', 'Lille'],
    amo: { nir13: NIR_PARENT_DURAND, qualite: 'AYANT_DROIT', rang: 1, vitale: true },
    amc: { ...MUTUELLE_A, numeroAdherent: 'AV-0001' },
    notes: 'Enfant : rendez-vous le mercredi.',
  },
  {
    n: 3,
    centre: 'nord',
    civilite: 'MME',
    nomNaissance: 'Durand',
    prenoms: 'Léa',
    dateNaissance: '2015-02-08',
    ville: ['59000', 'Lille'],
    amo: { nir13: NIR_PARENT_DURAND, qualite: 'AYANT_DROIT', rang: 1 },
  },
  {
    n: 4,
    centre: 'nord',
    civilite: 'M',
    nomNaissance: 'Fontaine',
    prenoms: 'Gérard',
    dateNaissance: '1946-11-30',
    ville: ['59100', 'Roubaix'],
    courrier: true,
    medecin: 'Dr Exemple, Roubaix',
    amo: { nir13: nir(1, '1946-11-30', '59', 201), ald: true, finDroits: '2027-03-31' },
    amc: { ...MUTUELLE_B, numeroAdherent: 'PF-1204' },
  },
  {
    n: 5,
    centre: 'nord',
    civilite: 'MME',
    nomNaissance: 'Carpentier',
    prenoms: 'Monique Jeanne',
    dateNaissance: '1939-05-17',
    ville: ['59200', 'Tourcoing'],
    courrier: true,
    amo: { nir13: nir(2, '1939-05-17', '62', 202), c2s: true },
    notes: 'Vient accompagnée de sa fille.',
  },
  {
    n: 6,
    centre: 'nord',
    civilite: 'M',
    nomNaissance: 'Lefebvre',
    prenoms: 'Michel',
    dateNaissance: '1952-01-09',
    ville: ['59000', 'Lille'],
    sms: true,
    email: true,
    amo: { nir13: nir(1, '1952-01-09', '59', 203), vitale: true },
  },
  {
    n: 7,
    centre: 'nord',
    civilite: 'MME',
    nomNaissance: 'Mercier',
    prenoms: 'Sylvie',
    dateNaissance: '1960-08-22',
    ville: ['59800', 'Lille'],
    amo: { nir13: nir(2, '1960-08-22', '80', 204) },
    amc: { ...MUTUELLE_A, numeroAdherent: 'AV-0007' },
  },
  {
    n: 8,
    centre: 'nord',
    civilite: 'M',
    nomNaissance: 'Dubois',
    prenoms: 'André',
    dateNaissance: '1944-03-03',
    ville: ['59000', 'Lille'],
  },
  // Paire de doublons pour la démonstration de la fusion (Nord et Centre : Camille Audio y a accès).
  {
    n: 9,
    centre: 'nord',
    civilite: 'MME',
    nomNaissance: 'Gauthier',
    prenoms: 'Denise',
    dateNaissance: '1948-12-02',
    ville: ['59000', 'Lille'],
    sms: true,
    amo: { nir13: nir(2, '1948-12-02', '59', 205) },
  },
  {
    n: 10,
    centre: 'centre',
    civilite: 'MME',
    nomNaissance: 'Gauthier',
    prenoms: 'Denise',
    dateNaissance: '1948-12-02',
    ville: ['45000', 'Orléans'],
    email: true,
    notes: 'Fiche créée lors d’un dépannage au centre.',
  },

  // Centre Démo Centre
  {
    n: 11,
    centre: 'centre',
    civilite: 'M',
    nomNaissance: 'Roux',
    prenoms: 'Thomas',
    dateNaissance: '1978-09-03',
    ville: ['45000', 'Orléans'],
    sms: true,
    email: true,
    amo: { nir13: NIR_PARENT_ROUX, vitale: true },
    amc: { ...MUTUELLE_B, numeroAdherent: 'PF-3300' },
  },
  // Jumeaux ayants droit : même NIR, même date, rangs 1 et 2.
  {
    n: 12,
    centre: 'centre',
    civilite: 'M',
    nomNaissance: 'Roux',
    prenoms: 'Nathan',
    dateNaissance: '2010-05-14',
    ville: ['45000', 'Orléans'],
    amo: { nir13: NIR_PARENT_ROUX, qualite: 'AYANT_DROIT', rang: 1 },
  },
  {
    n: 13,
    centre: 'centre',
    civilite: 'MME',
    nomNaissance: 'Roux',
    prenoms: 'Emma',
    dateNaissance: '2010-05-14',
    ville: ['45000', 'Orléans'],
    amo: { nir13: NIR_PARENT_ROUX, qualite: 'AYANT_DROIT', rang: 2 },
  },
  {
    n: 14,
    centre: 'centre',
    civilite: 'MME',
    nomNaissance: 'Girard',
    prenoms: 'Françoise',
    dateNaissance: '1950-07-26',
    ville: ['45100', 'Orléans'],
    courrier: true,
    amo: { nir13: nir(2, '1950-07-26', '45', 301), ald: true },
  },
  {
    n: 15,
    centre: 'centre',
    civilite: 'M',
    nomNaissance: 'Bonnet',
    prenoms: 'Jean-Pierre',
    dateNaissance: '1949-10-11',
    ville: ['41000', 'Blois'],
    medecin: 'Dr Fictif, Blois',
    amo: { nir13: nir(1, '1949-10-11', '41', 302), vitale: true },
    amc: { ...MUTUELLE_A, numeroAdherent: 'AV-0015' },
  },
  {
    n: 16,
    centre: 'centre',
    civilite: 'MME',
    nomNaissance: 'Lambert',
    nomUsage: 'Faure',
    prenoms: 'Hélène',
    dateNaissance: '1957-04-04',
    ville: ['45000', 'Orléans'],
    sms: true,
    amo: { nir13: nir(2, '1957-04-04', '18', 303) },
  },
  {
    n: 17,
    centre: 'centre',
    civilite: 'M',
    nomNaissance: 'Chevalier',
    prenoms: 'Louis',
    dateNaissance: '1936-02-29',
    ville: ['45000', 'Orléans'],
    amo: { nir13: nir(1, '1936-02-29', '45', 304), c2s: true },
    notes: 'Né un 29 février.',
  },
  {
    n: 18,
    centre: 'centre',
    civilite: 'MME',
    nomNaissance: 'Perrin',
    prenoms: 'Odile',
    dateNaissance: '1943-09-19',
    ville: ['37000', 'Tours'],
  },
  {
    n: 19,
    centre: 'centre',
    civilite: 'M',
    nomNaissance: 'Morel',
    prenoms: 'Bernard',
    dateNaissance: '1955-12-24',
    ville: ['45000', 'Orléans'],
    email: true,
    amo: { nir13: nir(1, '1955-12-24', '45', 305) },
    amc: { ...MUTUELLE_B, numeroAdherent: 'PF-1919' },
  },
  {
    n: 20,
    centre: 'centre',
    civilite: 'MME',
    nomNaissance: 'N’Diaye',
    prenoms: 'Aïssatou',
    dateNaissance: '1968-03-15',
    ville: ['45000', 'Orléans'],
    sms: true,
    amo: { nir13: nir(2, '1968-03-15', '99', 306) },
  },

  // Centre Démo Sud
  {
    n: 21,
    centre: 'sud',
    civilite: 'M',
    nomNaissance: 'Santoni',
    prenoms: 'Paul',
    dateNaissance: '1947-06-18',
    ville: ['13000', 'Marseille'],
    amo: { nir13: nir(1, '1947-06-18', '2A', 401), vitale: true },
    amc: { ...MUTUELLE_A, numeroAdherent: 'AV-0021' },
  },
  {
    n: 22,
    centre: 'sud',
    civilite: 'MME',
    nomNaissance: 'Casanova',
    nomUsage: 'Peretti',
    prenoms: 'Marie-Josée',
    dateNaissance: '1953-01-27',
    ville: ['13000', 'Marseille'],
    courrier: true,
    amo: { nir13: nir(2, '1953-01-27', '2B', 402), ald: true },
  },
  {
    n: 23,
    centre: 'sud',
    civilite: 'M',
    nomNaissance: 'Garcia',
    prenoms: 'Antoine',
    dateNaissance: '1962-11-05',
    ville: ['13100', 'Aix-en-Provence'],
    sms: true,
    amo: { nir13: nir(1, '1962-11-05', '13', 403) },
  },
  {
    n: 24,
    centre: 'sud',
    civilite: 'MME',
    nomNaissance: 'Blanc',
    prenoms: 'Josiane',
    dateNaissance: '1941-08-08',
    ville: ['13000', 'Marseille'],
    amo: { nir13: nir(2, '1941-08-08', '13', 404), c2s: true, finDroits: '2026-12-31' },
  },
  {
    n: 25,
    centre: 'sud',
    civilite: 'M',
    nomNaissance: 'Rossi',
    prenoms: 'Marcel',
    dateNaissance: '1938-04-21',
    ville: ['83000', 'Toulon'],
    medecin: 'Dr Démo, Toulon',
    amo: { nir13: nir(1, '1938-04-21', '83', 405) },
    amc: { ...MUTUELLE_B, numeroAdherent: 'PF-2525' },
  },
  {
    n: 26,
    centre: 'sud',
    civilite: 'MME',
    nomNaissance: 'Fabre',
    prenoms: 'Christine',
    dateNaissance: '1965-10-30',
    ville: ['13000', 'Marseille'],
    email: true,
  },
  {
    n: 27,
    centre: 'sud',
    civilite: 'M',
    nomNaissance: 'Michel',
    prenoms: 'Lucas',
    dateNaissance: '2008-07-07',
    ville: ['13000', 'Marseille'],
    amo: { nir13: nir(1, '1979-02-14', '13', 406), qualite: 'AYANT_DROIT', rang: 1 },
    notes: 'Suivi ORL en cours.',
  },
  {
    n: 28,
    centre: 'sud',
    civilite: 'MME',
    nomNaissance: 'Arnaud',
    prenoms: 'Yvette',
    dateNaissance: '1945-05-05',
    ville: ['84000', 'Avignon'],
    courrier: true,
    amo: { nir13: nir(2, '1945-05-05', '84', 407), vitale: true },
  },
  {
    n: 29,
    centre: 'sud',
    civilite: 'M',
    nomNaissance: 'Lopez',
    prenoms: 'Daniel',
    dateNaissance: '1958-09-09',
    ville: ['13000', 'Marseille'],
    sms: true,
    amo: { nir13: nir(1, '1958-09-09', '13', 408) },
    amc: { ...MUTUELLE_A, numeroAdherent: 'AV-0029' },
  },
  {
    n: 30,
    centre: 'sud',
    civilite: 'MME',
    nomNaissance: 'Muller',
    prenoms: 'Brigitte',
    dateNaissance: '1951-02-13',
    ville: ['13000', 'Marseille'],
    amo: { nir13: nir(2, '1951-02-13', '67', 409) },
  },
];

export const NOMBRE_PATIENTS_DEMO = PATIENTS.length;

function idPatient(n: number): string {
  return `019a3000-0000-7000-8000-${String(500 + n).padStart(12, '0')}`;
}

function date(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const LECTURE_VITALE = new Date('2026-10-15T09:30:00+02:00');

/** Crée ou remet à l'état initial les 30 patients de démonstration (fusions annulées comprises). */
export async function seedPatients(db: PrismaClient, organisationId: string, centres: CentresDemo) {
  const chiffreur = new ChiffreurAesGcm(chargerTrousseau(process.env));
  const empreinte = new EmpreinteHmac(chargerCleEmpreinte(process.env));

  for (const p of PATIENTS) {
    const id = idPatient(p.n);
    const sexe: Sexe = p.civilite === 'MME' ? 'FEMININ' : 'MASCULIN';
    const telephone = `0600${String(p.n).padStart(6, '0')}`;
    const donnees = {
      organisationId,
      centreId: centres[p.centre],
      civilite: p.civilite,
      nomNaissance: p.nomNaissance,
      nomUsage: p.nomUsage ?? null,
      prenoms: p.prenoms,
      dateNaissance: date(p.dateNaissance),
      sexe,
      adresseLigne1: `${p.n} rue de la Démonstration`,
      adresseLigne2: null,
      codePostal: p.ville?.[0] ?? null,
      ville: p.ville?.[1] ?? null,
      telephone,
      email: `patient${String(p.n).padStart(2, '0')}@exemple.test`,
      medecinTraitant: p.medecin ?? null,
      consentementSms: p.sms ?? false,
      consentementEmail: p.email ?? false,
      consentementCourrier: p.courrier ?? false,
      notes: p.notes ? chiffreur.chiffrer(p.notes, 'patient.notes') : null,
      nomNaissanceRecherche: normaliserPourRecherche(p.nomNaissance),
      nomUsageRecherche: p.nomUsage ? normaliserPourRecherche(p.nomUsage) : null,
      prenomsRecherche: normaliserPourRecherche(p.prenoms),
      fusionneDansId: null,
      fusionneLe: null,
    };
    await db.patient.upsert({ where: { id }, create: { id, ...donnees }, update: donnees });

    await db.couvertureAmo.deleteMany({ where: { patientId: id } });
    if (p.amo) {
      const a = p.amo;
      const complet = `${a.nir13}${String(cleNir(a.nir13)).padStart(2, '0')}`;
      await db.couvertureAmo.create({
        data: {
          patientId: id,
          nir: chiffreur.chiffrer(complet, CONTEXTE_NIR),
          nirEmpreinte: empreinte.calculer(a.nir13, CONTEXTE_NIR),
          rangNaissance: a.rang ?? 1,
          qualite: a.qualite ?? 'ASSURE',
          regime: '01',
          caisse: '999',
          centreGestionnaire: '9999',
          finDroits: a.finDroits ? date(a.finDroits) : null,
          c2s: a.c2s ?? false,
          ald: chiffreur.chiffrer(a.ald ? 'OUI' : 'NON', 'couverture_amo.ald'),
          origine: a.vitale ? 'VITALE' : 'SAISIE',
          derniereLectureVitale: a.vitale ? LECTURE_VITALE : null,
        },
      });
    }

    await db.couvertureAmc.deleteMany({ where: { patientId: id } });
    if (p.amc) {
      const c = p.amc;
      await db.couvertureAmc.create({
        data: {
          patientId: id,
          organismeNom: c.organismeNom,
          organismeIdentifiant: c.organismeIdentifiant ?? null,
          numeroAdherent: c.numeroAdherent ?? null,
          typeContrat: c.typeContrat ?? null,
          debutValidite: c.debutValidite ? date(c.debutValidite) : null,
          finValidite: c.finValidite ? date(c.finValidite) : null,
        },
      });
    }
  }
}
