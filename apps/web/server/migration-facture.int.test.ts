import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { urlBaseJetable } from '@/test/env';

// Rejoue les migrations dans une base dédiée, s'arrête avant celle de la facture, écrit des lignes
// fictives telles qu'elles existaient, puis applique la migration.
const MIGRATIONS = path.join(import.meta.dirname, '../../../packages/db/prisma/migrations');
const CIBLE = '20261108090000_facture';
const BASE = 'ha_gestion_test_migration_facture';

const ORGANISATION = '019a0000-0000-7000-8000-000000000001';
const CENTRE = '019a0000-0000-7000-8000-000000000002';
const UTILISATEUR = '019a0000-0000-7000-8000-000000000003';
const PATIENT = '019a0000-0000-7000-8000-000000000004';
const PRATICIEN = '019a0000-0000-7000-8000-000000000005';
const DOSSIER_OUVERT = '019a0000-0000-7000-8000-000000000006';
const DOSSIER_FERME = '019a0000-0000-7000-8000-000000000007';
const PREPAREE_OUVERTE = '019a0000-0000-7000-8000-000000000008';
const PREPAREE_FERMEE = '019a0000-0000-7000-8000-000000000009';
const LIEN = '019a0000-0000-7000-8000-00000000000a';

function sql(migration: string): string {
  return readFileSync(path.join(MIGRATIONS, migration, 'migration.sql'), 'utf8');
}

let admin: pg.Client;
let client: pg.Client;

const ETAT_INITIAL = `
  INSERT INTO organisation (id, raison_sociale, slug, updated_at)
    VALUES ('${ORGANISATION}', 'Client fictif', 'client-fictif', now());
  INSERT INTO centre (id, organisation_id, nom, slug, adresse_ligne1, code_postal, ville, email, telephone, updated_at)
    VALUES ('${CENTRE}', '${ORGANISATION}', 'Centre fictif', 'fictif', '1 rue Test', '75000', 'Paris',
            'centre@exemple.test', '0100000000', now());
  INSERT INTO utilisateur (id, organisation_id, prenom, nom, nom_affiche, email, role, updated_at)
    VALUES ('${UTILISATEUR}', '${ORGANISATION}', 'Alex', 'Test', 'Alex Test', 'alex@exemple.test',
            'AUDIO', now());
  INSERT INTO praticien (id, organisation_id, utilisateur_id, rpps, updated_at)
    VALUES ('${PRATICIEN}', '${ORGANISATION}', '${UTILISATEUR}', '10000000000', now());
  INSERT INTO patient (id, organisation_id, centre_id, civilite, nom_naissance, prenoms, date_naissance,
                       sexe, nom_naissance_recherche, prenoms_recherche, updated_at)
    VALUES ('${PATIENT}', '${ORGANISATION}', '${CENTRE}', 'MME', 'Fictive', 'Camille', '1950-03-15',
            'FEMININ', 'FICTIVE', 'CAMILLE', now());
  INSERT INTO dossier (id, organisation_id, patient_id, centre_id, praticien_id, statut, oreilles,
                       type_droite, date_ouverture, surdicecite, updated_at)
    VALUES ('${DOSSIER_OUVERT}', '${ORGANISATION}', '${PATIENT}', '${CENTRE}', '${PRATICIEN}',
            'A_FACTURER', 'DROITE', 'PRIMO', '2026-09-01', 'v1.fictif', now()),
           ('${DOSSIER_FERME}', '${ORGANISATION}', '${PATIENT}', '${CENTRE}', '${PRATICIEN}',
            'FACTURE', 'DROITE', 'PRIMO', '2026-09-01', 'v1.fictif', now());
  INSERT INTO facture_preparee (id, organisation_id, dossier_id, date_delivrance, created_by_id, updated_at)
    VALUES ('${PREPAREE_OUVERTE}', '${ORGANISATION}', '${DOSSIER_OUVERT}', '2026-10-30', '${UTILISATEUR}', now()),
           ('${PREPAREE_FERMEE}', '${ORGANISATION}', '${DOSSIER_FERME}', '2026-10-01', '${UTILISATEUR}', now());
  INSERT INTO lien_document (id, organisation_id, dossier_id, cible, destinataire, pdf_cle, expire_le, created_by_id)
    VALUES ('${LIEN}', '${ORGANISATION}', '${DOSSIER_OUVERT}', 'DEVIS', 'PATIENT', 'cle', now(), '${UTILISATEUR}');
`;

beforeAll(async () => {
  const url = new URL(urlBaseJetable('DATABASE_URL_TEST'));
  admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
  await admin.query(`CREATE DATABASE ${BASE}`);
  url.pathname = `/${BASE}`;
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const dossiers = readdirSync(MIGRATIONS)
    .filter((nom) => /^\d+_/.test(nom) && nom < CIBLE)
    .sort();
  for (const migration of dossiers) {
    await client.query(sql(migration));
  }
  await client.query(ETAT_INITIAL);
  await client.query(sql(CIBLE));
}, 120_000);

afterAll(async () => {
  await client.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE}`);
  await admin.end();
});

describe('migration de facture_preparee vers facture', () => {
  it('reprend une préparation ouverte en brouillon, sans date', async () => {
    const { rows } = await client.query(`SELECT * FROM facture WHERE id = $1`, [PREPAREE_OUVERTE]);
    expect(rows[0]).toMatchObject({
      statut: 'BROUILLON',
      nature: 'FACTURE',
      centre_id: CENTRE,
      patient_id: PATIENT,
      dossier_id: DOSSIER_OUVERT,
      numero: null,
      date_facture: null,
    });
  });

  it('abandonne sans numéro la ligne d’un dossier sorti de la file, en gardant sa date', async () => {
    const { rows } = await client.query<{ statut: string; numero: null; date_facture: Date }>(
      `SELECT statut, numero, date_facture FROM facture WHERE id = $1`,
      [PREPAREE_FERMEE],
    );
    expect(rows[0]).toMatchObject({ statut: 'ABANDONNEE', numero: null });
    expect(rows[0]?.date_facture).not.toBeNull();
  });

  it('retire l’ancienne table et rattache les liens existants au patient', async () => {
    const tables = await client.query(`SELECT to_regclass('facture_preparee') AS ancienne`);
    expect(tables.rows[0]).toEqual({ ancienne: null });
    const liens = await client.query(`SELECT patient_id FROM lien_document WHERE id = $1`, [LIEN]);
    expect(liens.rows[0]).toEqual({ patient_id: PATIENT });
  });

  it('garde la RLS de la table renommée et pose les taux de R18, sans taux d’entretien', async () => {
    const rls = await client.query(
      `SELECT relrowsecurity AND relforcerowsecurity AS active FROM pg_class WHERE relname = 'facture'`,
    );
    expect(rls.rows[0]).toEqual({ active: true });
    const taux = await client.query(`SELECT type, taux FROM taux_tva ORDER BY type`);
    expect(taux.rows).toEqual([
      { type: 'AIDE_AUDITIVE', taux: 550 },
      { type: 'ACCESSOIRE', taux: 2000 },
      { type: 'PILE', taux: 2000 },
    ]);
  });
});
