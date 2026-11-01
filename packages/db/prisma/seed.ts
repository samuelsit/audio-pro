import { hashPassword } from 'better-auth/crypto';

import { creerPrismaClient } from '../src/client';
import type { PrismaClient } from '../src/generated/prisma/client';
import type { Role } from '../src/generated/prisma/enums';
import { seedAgenda, seedReservationEnLigne, seedTypesRdv } from './seed-agenda';
import { seedAudiologie } from './seed-audiologie';
import {
  NOMBRE_FABRICANTS_DEMO,
  NOMBRE_MODELES_DEMO,
  seedCatalogue,
  seedCatalogueIndependant,
} from './seed-catalogue';
import { NOMBRE_DOSSIERS_DEMO, seedDossiers } from './seed-dossiers';
import { seedFacturation } from './seed-facturation';
import { NOMBRE_COMPLEMENTAIRES_DEMO, seedComplementaires } from './seed-complementaires';
import { NOMBRE_PATIENTS_DEMO, PATIENTS_INDEPENDANT, seedPatients } from './seed-patients';
import { nombreAppareilsDemo, seedStock } from './seed-stock';

// Seed idempotent de démonstration. Toutes les données sont fictives (domaine exemple.test,
// RPPS et NIR inventés). Les patients de démonstration sont dans seed-patients.ts.
const SCHEMA_VERSION = '10';

// Deux clients fictifs : un réseau de 3 centres et un centre indépendant (ADR-016).
const ORGANISATION_ID = '019a3000-0000-7000-8000-000000000001';
const ORGANISATION_INDEPENDANTE_ID = '019a3000-0000-7000-8000-000000000002';

const ORGANISATIONS = [
  {
    id: ORGANISATION_ID,
    raisonSociale: 'Réseau Démo Audition',
    slug: 'reseau-demo',
    siren: '000000001',
    adresseLigne1: '1 rue de l’Exemple',
    codePostal: '59000',
    ville: 'Lille',
    statut: 'ACTIF',
  },
  {
    id: ORGANISATION_INDEPENDANTE_ID,
    raisonSociale: 'Audition Indépendante Démo',
    slug: 'audition-independante-demo',
    siren: '000000002',
    adresseLigne1: '4 place Fictive',
    codePostal: '35000',
    ville: 'Rennes',
    statut: 'ACTIF',
  },
] as const;

const ENTREPRISE_DEMO = {
  raisonSociale: 'Audition Démo SAS',
  rcs: 'RCS Démo 000 000 000',
  tvaIntracommunautaire: 'FR00000000000',
} as const;

const CENTRES = [
  {
    id: '019a3000-0000-7000-8000-0000000000a1',
    nom: 'Centre Démo Nord',
    slug: 'nord',
    adresseLigne1: '1 rue de l’Exemple',
    codePostal: '59000',
    ville: 'Lille',
    email: 'nord@exemple.test',
    telephone: '0300000001',
    finess: '000000001',
    ...ENTREPRISE_DEMO,
    siret: '00000000000011',
  },
  {
    id: '019a3000-0000-7000-8000-0000000000b1',
    nom: 'Centre Démo Centre',
    slug: 'centre',
    adresseLigne1: '2 avenue Fictive',
    codePostal: '45000',
    ville: 'Orléans',
    email: 'centre@exemple.test',
    telephone: '0200000002',
    finess: '000000002',
    ...ENTREPRISE_DEMO,
    siret: '00000000000022',
  },
  {
    id: '019a3000-0000-7000-8000-0000000000c1',
    nom: 'Centre Démo Sud',
    slug: 'sud',
    adresseLigne1: '3 boulevard Imaginaire',
    codePostal: '13000',
    ville: 'Marseille',
    email: 'sud@exemple.test',
    telephone: '0400000003',
    finess: '000000003',
    ...ENTREPRISE_DEMO,
    siret: '00000000000033',
  },
] as const;

const [NORD, CENTRE, SUD] = CENTRES.map((centre) => centre.id) as [string, string, string];

const CENTRE_INDEPENDANT = {
  id: '019a3000-0000-7000-8000-0000000000d1',
  nom: 'Centre Démo Rennes',
  slug: 'rennes',
  adresseLigne1: '4 place Fictive',
  codePostal: '35000',
  ville: 'Rennes',
  email: 'rennes@exemple.test',
  telephone: '0200000004',
  finess: '000000004',
  raisonSociale: 'Audition Indépendante Démo',
  rcs: 'RCS Démo 000 000 000',
  tvaIntracommunautaire: 'FR00000000000',
  siret: '00000000200011',
} as const;

const HORAIRES_DEMO = {
  lundi: [
    { debut: '09:00', fin: '12:30' },
    { debut: '14:00', fin: '18:30' },
  ],
  mardi: [
    { debut: '09:00', fin: '12:30' },
    { debut: '14:00', fin: '18:30' },
  ],
  mercredi: [{ debut: '09:00', fin: '12:30' }],
  jeudi: [
    { debut: '09:00', fin: '12:30' },
    { debut: '14:00', fin: '18:30' },
  ],
  vendredi: [
    { debut: '09:00', fin: '12:30' },
    { debut: '14:00', fin: '18:30' },
  ],
  samedi: [{ debut: '09:00', fin: '12:00' }],
  dimanche: [],
};

// Camille tourne entre deux centres : ses horaires ne se chevauchent pas.
const JOURS_DEBUT_SEMAINE = ['lundi', 'mardi', 'mercredi'] as const;
const JOURS_FIN_SEMAINE = ['jeudi', 'vendredi', 'samedi'] as const;

interface UtilisateurDemo {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  centreIds: readonly string[];
  praticien?: { id: string; rpps: string; centreIds: readonly string[] };
}

const ADMIN_ID = '019a3000-0000-7000-8000-000000000101';

const UTILISATEURS: readonly UtilisateurDemo[] = [
  {
    id: ADMIN_ID,
    prenom: 'Alex',
    nom: 'Admin',
    email: 'admin@exemple.test',
    role: 'ADMIN_CLIENT',
    centreIds: [],
  },
  {
    id: '019a3000-0000-7000-8000-000000000201',
    prenom: 'Camille',
    nom: 'Audio',
    email: 'camille.audio@exemple.test',
    role: 'AUDIO',
    centreIds: [NORD, CENTRE],
    praticien: {
      id: '019a3000-0000-7000-8000-000000000301',
      rpps: '19999999907',
      centreIds: [NORD, CENTRE],
    },
  },
  {
    id: '019a3000-0000-7000-8000-000000000204',
    prenom: 'Alix',
    nom: 'Audio',
    email: 'alix.audio@exemple.test',
    role: 'AUDIO',
    centreIds: [NORD],
    praticien: {
      id: '019a3000-0000-7000-8000-000000000304',
      rpps: '19999999923',
      centreIds: [NORD],
    },
  },
  {
    id: '019a3000-0000-7000-8000-000000000202',
    prenom: 'Dominique',
    nom: 'Audio',
    email: 'dominique.audio@exemple.test',
    role: 'AUDIO',
    centreIds: [SUD],
    praticien: {
      id: '019a3000-0000-7000-8000-000000000302',
      rpps: '19999999915',
      centreIds: [SUD],
    },
  },
  {
    id: '019a3000-0000-7000-8000-000000000401',
    prenom: 'Sacha',
    nom: 'Assistante',
    email: 'sacha.assistante@exemple.test',
    role: 'ASSISTANT',
    centreIds: [NORD],
  },
  {
    id: '019a3000-0000-7000-8000-000000000402',
    prenom: 'Lou',
    nom: 'Assistante',
    email: 'lou.assistante@exemple.test',
    role: 'ASSISTANT',
    centreIds: [CENTRE],
  },
  {
    id: '019a3000-0000-7000-8000-000000000403',
    prenom: 'Noa',
    nom: 'Responsable',
    email: 'noa.responsable@exemple.test',
    role: 'RESPONSABLE_CENTRE',
    centreIds: [NORD, CENTRE],
  },
];

const UTILISATEURS_INDEPENDANT: readonly UtilisateurDemo[] = [
  {
    id: '019a3000-0000-7000-8000-000000000103',
    prenom: 'Robin',
    nom: 'Admin',
    email: 'robin.admin@independant.exemple.test',
    role: 'ADMIN_CLIENT',
    centreIds: [],
  },
  {
    id: '019a3000-0000-7000-8000-000000000203',
    prenom: 'Maxime',
    nom: 'Audio',
    email: 'maxime.audio@independant.exemple.test',
    role: 'AUDIO',
    centreIds: [CENTRE_INDEPENDANT.id],
    praticien: {
      id: '019a3000-0000-7000-8000-000000000303',
      rpps: '19999999923',
      centreIds: [CENTRE_INDEPENDANT.id],
    },
  },
  {
    id: '019a3000-0000-7000-8000-000000000404',
    prenom: 'Sam',
    nom: 'Assistant',
    email: 'sam.assistant@independant.exemple.test',
    role: 'ASSISTANT',
    centreIds: [CENTRE_INDEPENDANT.id],
  },
];

/** Console éditeur : hors de toute organisation. */
const SUPERADMIN: UtilisateurDemo = {
  id: '019a3000-0000-7000-8000-000000000901',
  prenom: 'Claude',
  nom: 'Éditeur',
  email: 'console@exemple.test',
  role: 'SUPERADMIN',
  centreIds: [],
};

async function seedUtilisateur(
  db: PrismaClient,
  u: UtilisateurDemo,
  motDePasseHash: string,
  organisationId: string | null,
): Promise<void> {
  const donnees = {
    organisationId,
    prenom: u.prenom,
    nom: u.nom,
    name: `${u.prenom} ${u.nom}`,
    email: u.email,
    role: u.role,
    actif: true,
    doitChangerMotDePasse: false,
  };
  await db.utilisateur.upsert({
    where: { id: u.id },
    create: { id: u.id, ...donnees },
    update: donnees,
  });

  await db.utilisateurCentre.deleteMany({ where: { utilisateurId: u.id } });
  await db.utilisateurCentre.createMany({
    data: u.centreIds.map((centreId) => ({ utilisateurId: u.id, centreId })),
  });

  await db.compte.deleteMany({ where: { userId: u.id, providerId: 'credential' } });
  await db.compte.create({
    data: { accountId: u.id, providerId: 'credential', userId: u.id, password: motDePasseHash },
  });

  if (u.praticien) {
    const p = u.praticien;
    await db.praticien.upsert({
      where: { id: p.id },
      create: { id: p.id, utilisateurId: u.id, rpps: p.rpps },
      update: { rpps: p.rpps },
    });
    await db.praticienCentre.deleteMany({ where: { praticienId: p.id } });
    await db.praticienCentre.createMany({
      data: p.centreIds.map((centreId) => ({ praticienId: p.id, centreId })),
    });
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le seed de démonstration est interdit en production.');
  }
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) {
    throw new Error('DATABASE_URL_ADMIN n’est pas défini (voir .env.example).');
  }
  const motDePasse = process.env.SEED_MOT_DE_PASSE_DEMO;
  if (!motDePasse || motDePasse.length < 12) {
    throw new Error(
      'SEED_MOT_DE_PASSE_DEMO doit faire au moins 12 caractères (voir .env.example).',
    );
  }

  const db = creerPrismaClient(url);
  try {
    const motDePasseHash = await hashPassword(motDePasse);

    for (const organisation of ORGANISATIONS) {
      await db.organisation.upsert({
        where: { id: organisation.id },
        create: organisation,
        update: organisation,
      });
    }
    for (const [centre, organisationId] of [
      ...CENTRES.map((c) => [c, ORGANISATION_ID] as const),
      [CENTRE_INDEPENDANT, ORGANISATION_INDEPENDANTE_ID] as const,
    ]) {
      const donnees = { ...centre, organisationId, horairesOuverture: HORAIRES_DEMO, actif: true };
      await db.centre.upsert({ where: { id: centre.id }, create: donnees, update: donnees });
    }
    for (const utilisateur of UTILISATEURS) {
      await seedUtilisateur(db, utilisateur, motDePasseHash, ORGANISATION_ID);
    }
    for (const utilisateur of UTILISATEURS_INDEPENDANT) {
      await seedUtilisateur(db, utilisateur, motDePasseHash, ORGANISATION_INDEPENDANTE_ID);
    }
    await seedUtilisateur(db, SUPERADMIN, motDePasseHash, null);
    await seedPatients(db, ORGANISATION_ID, { nord: NORD, centre: CENTRE, sud: SUD });
    await seedCatalogue(db, ORGANISATION_ID);
    await seedStock(db, ORGANISATION_ID, [NORD, CENTRE, SUD], ADMIN_ID);
    await seedDossiers(db, ORGANISATION_ID, NORD, ADMIN_ID);
    await seedFacturation(db, ORGANISATION_ID, NORD, ADMIN_ID);
    await seedComplementaires(db, ORGANISATION_ID);
    await seedAudiologie(db, ORGANISATION_ID, NORD, ADMIN_ID);
    await seedPatients(
      db,
      ORGANISATION_INDEPENDANTE_ID,
      { nord: CENTRE_INDEPENDANT.id, centre: CENTRE_INDEPENDANT.id, sud: CENTRE_INDEPENDANT.id },
      PATIENTS_INDEPENDANT,
    );
    await seedCatalogueIndependant(db, ORGANISATION_INDEPENDANTE_ID);
    await seedTypesRdv(db, ORGANISATION_INDEPENDANTE_ID);
    await seedAgenda(db, ORGANISATION_ID, {
      centres: [NORD, CENTRE, SUD],
      centrePrincipal: NORD,
      praticiens: [
        { id: '019a3000-0000-7000-8000-000000000301', centreId: NORD, jours: JOURS_DEBUT_SEMAINE },
        { id: '019a3000-0000-7000-8000-000000000301', centreId: CENTRE, jours: JOURS_FIN_SEMAINE },
        {
          id: '019a3000-0000-7000-8000-000000000304',
          centreId: NORD,
          jours: [...JOURS_DEBUT_SEMAINE, ...JOURS_FIN_SEMAINE],
        },
        {
          id: '019a3000-0000-7000-8000-000000000302',
          centreId: SUD,
          jours: [...JOURS_DEBUT_SEMAINE, ...JOURS_FIN_SEMAINE],
        },
      ],
      horaires: HORAIRES_DEMO,
      creePar: ADMIN_ID,
    });
    await seedReservationEnLigne(db, ORGANISATION_ID, NORD);

    const seededAt = new Date().toISOString();
    for (const [key, value] of [
      ['schema_version', SCHEMA_VERSION],
      ['seeded_at', seededAt],
    ] as const) {
      await db.appMeta.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    console.log(
      `Seed terminé (schema_version=${SCHEMA_VERSION}) : ${ORGANISATIONS.length} organisations, ${CENTRES.length + 1} centres, ${UTILISATEURS.length + UTILISATEURS_INDEPENDANT.length + 1} utilisateurs, ${NOMBRE_PATIENTS_DEMO + PATIENTS_INDEPENDANT.length} patients, ${NOMBRE_FABRICANTS_DEMO} fabricants, ${NOMBRE_MODELES_DEMO} modèles, ${nombreAppareilsDemo(CENTRES.length)} appareils, ${NOMBRE_DOSSIERS_DEMO} dossiers, ${NOMBRE_COMPLEMENTAIRES_DEMO} complémentaires.`,
    );
  } finally {
    await db.$disconnect();
  }
}

await main();
