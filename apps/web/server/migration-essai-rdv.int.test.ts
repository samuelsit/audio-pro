import { readFileSync } from 'node:fs';
import path from 'node:path';

import { prisma } from '@ha/db/admin';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerCatalogueDevis, dossierJusquAchat, identifierCentreA } from '@/test/devis';
import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { importerLpp } from './lpp/importer';

const RACINE = path.join(import.meta.dirname, '../../../');
const MIGRATION = readFileSync(
  path.join(RACINE, 'packages/db/prisma/migrations/20261107090000_essai_rdv_agenda/migration.sql'),
  'utf8',
);
const V908 = path.join(RACINE, 'fixtures/lpp/908');

// Rejoue la migration dans une transaction annulée, sur une table remise dans son état d'avant.
const AVANT_MIGRATION = `
  ALTER TABLE essai_rdv DISABLE TRIGGER essai_rdv_ajout_seul;
  DELETE FROM essai_rdv;
  ALTER TABLE essai_rdv ENABLE TRIGGER essai_rdv_ajout_seul;
  DROP TRIGGER zz_meme_organisation_rendez_vous_id ON essai_rdv;
  ALTER TABLE essai_rdv DROP COLUMN rendez_vous_id;
`;

let d: JeuDeDonnees;
let essaiId: string;
let dossierId: string;
let praticienId: string;
let client: pg.Client;

const JOUR = '2026-03-02';

async function inserer(id: string, type: string): Promise<void> {
  await client.query(
    `INSERT INTO essai_rdv (id, organisation_id, essai_id, date, type, compte_rendu, created_by_id)
     VALUES ($1, $2, $3, $4, $5::"TypeRdvEssai", 'v1.fictif', $6)`,
    [id, d.organisation.id, essaiId, JOUR, type, d.acteurs.admin.id],
  );
}

async function rdvDe(id: string) {
  const { rows } = await client.query<{
    debut: Date;
    statut: string;
    dossier_id: string;
    praticien_id: string;
    origine: string;
  }>(
    `SELECT r.debut, r.statut, r.dossier_id, r.praticien_id, r.origine
     FROM essai_rdv e JOIN rendez_vous r ON r.id = e.rendez_vous_id WHERE e.id = $1`,
    [id],
  );
  return rows[0];
}

async function rejouer(preparation: () => Promise<void>, verifier: () => Promise<void>) {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(AVANT_MIGRATION);
    await preparation();
    await client.query(MIGRATION);
    await verifier();
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await identifierCentreA(d);
  await importerLpp(V908);
  const catalogue = await creerCatalogueDevis(d);
  ({ dossierId } = await dossierJusquAchat(d, d.acteurs.audioAB, catalogue));
  const essai = await prisma().essai.findUniqueOrThrow({ where: { dossierId } });
  essaiId = essai.id;
  const dossier = await prisma().dossier.findUniqueOrThrow({ where: { id: dossierId } });
  praticienId = dossier.praticienId;
});

describe('migration des rendez-vous d’essai', () => {
  it('crée un rendez-vous vu, à 9 h, rattaché au dossier', async () => {
    await rejouer(
      () => inserer('essai-rdv-1', 'POSE'),
      async () => {
        const rdv = await rdvDe('essai-rdv-1');
        expect(rdv).toMatchObject({
          statut: 'VU',
          origine: 'INTERNE',
          dossier_id: dossierId,
          praticien_id: praticienId,
        });
        expect(rdv?.debut.toISOString()).toBe('2026-03-02T08:00:00.000Z');
      },
    );
  });

  it('deux lignes le même jour ne se superposent pas', async () => {
    await rejouer(
      async () => {
        await inserer('essai-rdv-1', 'POSE');
        await inserer('essai-rdv-2', 'POSE');
      },
      async () => {
        const [a, b] = await Promise.all([rdvDe('essai-rdv-1'), rdvDe('essai-rdv-2')]);
        expect(a?.debut).not.toEqual(b?.debut);
      },
    );
  });

  it('contourne un rendez-vous réel qui occupe déjà 9 h', async () => {
    await rejouer(
      async () => {
        await inserer('essai-rdv-1', 'CONTROLE');
        await client.query(
          `INSERT INTO type_rdv (id, organisation_id, nom, duree_minutes, couleur, requiere_praticien, requiere_cabine, updated_at)
           VALUES ('type-suivi', $1, 'Suivi réel', 60, '#000000', true, false, now())`,
          [d.organisation.id],
        );
        await client.query(
          `INSERT INTO rendez_vous (id, organisation_id, centre_id, type_rdv_id, patient_id, praticien_id, debut, fin, statut, origine, created_by_id, updated_at)
           SELECT 'rdv-reel', d.organisation_id, d.centre_id, 'type-suivi', d.patient_id, d.praticien_id,
             '2026-03-02T08:00:00Z', '2026-03-02T09:00:00Z', 'VU', 'INTERNE', $1, now()
           FROM dossier d WHERE d.id = $2`,
          [d.acteurs.admin.id, dossierId],
        );
      },
      async () => {
        const rdv = await rdvDe('essai-rdv-1');
        expect(rdv?.debut.toISOString()).toBe('2026-03-02T09:00:00.000Z');
      },
    );
  });

  it('reprend un rendez-vous tenu ce jour-là plutôt que d’en créer un second', async () => {
    await rejouer(
      async () => {
        await inserer('essai-rdv-1', 'CONTROLE');
        await client.query(
          `INSERT INTO type_rdv (id, organisation_id, nom, duree_minutes, couleur, requiere_praticien, requiere_cabine, nature_essai, updated_at)
           VALUES ('type-controle', $1, 'Contrôle réel', 30, '#000000', true, false, 'CONTROLE', now())`,
          [d.organisation.id],
        );
        await client.query(
          `INSERT INTO rendez_vous (id, organisation_id, centre_id, type_rdv_id, patient_id, dossier_id, praticien_id, debut, fin, statut, origine, created_by_id, updated_at)
           SELECT 'rdv-tenu', d.organisation_id, d.centre_id, 'type-controle', d.patient_id, d.id, d.praticien_id,
             '2026-03-02T13:00:00Z', '2026-03-02T13:30:00Z', 'VU', 'INTERNE', $1, now()
           FROM dossier d WHERE d.id = $2`,
          [d.acteurs.admin.id, dossierId],
        );
      },
      async () => {
        const { rows } = await client.query<{ rendez_vous_id: string }>(
          `SELECT rendez_vous_id FROM essai_rdv WHERE id = 'essai-rdv-1'`,
        );
        expect(rows[0]?.rendez_vous_id).toBe('rdv-tenu');
      },
    );
  });

  it('remet la contrainte : un compte rendu exige un rendez-vous', async () => {
    await rejouer(
      () => inserer('essai-rdv-1', 'POSE'),
      async () => {
        await expect(
          client.query(
            `INSERT INTO essai_rdv (id, organisation_id, essai_id, date, type, compte_rendu, created_by_id)
             VALUES ('sans-rdv', $1, $2, $3, 'POSE', 'v1.fictif', $4)`,
            [d.organisation.id, essaiId, JOUR, d.acteurs.admin.id],
          ),
        ).rejects.toThrow(/rendez_vous_id/);
      },
    );
  });
});
