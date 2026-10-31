import { hashPassword } from 'better-auth/crypto';

import { creerPrismaClient } from '../src/client';
import type { PrismaClient } from '../src/generated/prisma/client';
import type { Role } from '../src/generated/prisma/enums';
import { NOMBRE_FABRICANTS_DEMO, NOMBRE_MODELES_DEMO, seedCatalogue } from './seed-catalogue';
import { NOMBRE_DOSSIERS_DEMO, seedDossiers } from './seed-dossiers';
import { NOMBRE_PATIENTS_DEMO, seedPatients } from './seed-patients';
import { nombreAppareilsDemo, seedStock } from './seed-stock';

// Seed idempotent de démonstration. Toutes les données sont fictives (domaine exemple.test,
// RPPS et NIR inventés). Les patients de démonstration sont dans seed-patients.ts.
const SCHEMA_VERSION = '4';

const ORGANISATION_ID = '019a3000-0000-7000-8000-000000000001';

const ENTREPRISE_DEMO = {
  raisonSociale: 'Audition Démo SAS',
  rcs: 'RCS Démo 000 000 000',
  tvaIntracommunautaire: 'FR00000000000',
} as const;

const CENTRES = [
  {
    id: '019a3000-0000-7000-8000-0000000000a1',
    nom: 'Centre Démo Nord',
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
    role: 'ADMIN',
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
];

async function seedUtilisateur(
  db: PrismaClient,
  u: UtilisateurDemo,
  motDePasseHash: string,
): Promise<void> {
  const donnees = {
    organisationId: ORGANISATION_ID,
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
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL n’est pas défini (voir .env.example).');
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

    await db.organisation.upsert({
      where: { id: ORGANISATION_ID },
      create: { id: ORGANISATION_ID, nom: 'Réseau Démo Audition' },
      update: { nom: 'Réseau Démo Audition' },
    });
    for (const centre of CENTRES) {
      const donnees = { ...centre, organisationId: ORGANISATION_ID, actif: true };
      await db.centre.upsert({ where: { id: centre.id }, create: donnees, update: donnees });
    }
    for (const utilisateur of UTILISATEURS) {
      await seedUtilisateur(db, utilisateur, motDePasseHash);
    }
    await seedPatients(db, ORGANISATION_ID, { nord: NORD, centre: CENTRE, sud: SUD });
    await seedCatalogue(db, ORGANISATION_ID);
    await seedStock(db, ORGANISATION_ID, [NORD, CENTRE, SUD], ADMIN_ID);
    await seedDossiers(db, ORGANISATION_ID, NORD, ADMIN_ID);

    const seededAt = new Date().toISOString();
    for (const [key, value] of [
      ['schema_version', SCHEMA_VERSION],
      ['seeded_at', seededAt],
    ] as const) {
      await db.appMeta.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    console.log(
      `Seed terminé (schema_version=${SCHEMA_VERSION}) : ${CENTRES.length} centres, ${UTILISATEURS.length} utilisateurs, ${NOMBRE_PATIENTS_DEMO} patients, ${NOMBRE_FABRICANTS_DEMO} fabricants, ${NOMBRE_MODELES_DEMO} modèles, ${nombreAppareilsDemo(CENTRES.length)} appareils, ${NOMBRE_DOSSIERS_DEMO} dossiers.`,
    );
  } finally {
    await db.$disconnect();
  }
}

await main();
