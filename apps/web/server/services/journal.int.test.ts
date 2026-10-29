import { prisma } from '@ha/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { AccesRefuseError } from '../auth/acces';
import { ErreurSaisie } from '../erreurs';
import { exporterJournal, listerJournal, utilisateursPourFiltre } from './journal';

let d: JeuDeDonnees;

const PATIENT_1 = '019a2f3c-0000-7000-8000-000000000001';
const PATIENT_2 = '019a2f3c-0000-7000-8000-000000000002';

/** Insère une ligne de journal datée (UTC). */
function ligne(horodatage: string, surcharge: Record<string, unknown> = {}) {
  return {
    horodatage: new Date(horodatage),
    organisationId: d.organisation.id,
    utilisateurId: d.utilisateurs.audioAB.id,
    utilisateurLibelle: 'Audioab Test <audioab@exemple.test>',
    role: 'AUDIO' as const,
    centreId: d.centres.a.id,
    action: 'READ' as const,
    entiteType: 'PATIENT',
    ...surcharge,
  };
}

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
  await prisma().journalAudit.createMany({
    data: [
      // 24 octobre 23:59 à Paris (heure d'été).
      ligne('2026-10-24T21:59:00Z', { patientId: PATIENT_1, entiteId: PATIENT_1 }),
      // 25 octobre 00:30 à Paris (jour du passage à l'heure d'hiver).
      ligne('2026-10-24T22:30:00Z', { patientId: PATIENT_2, entiteId: PATIENT_2 }),
      // 25 octobre 23:30 à Paris (UTC+1).
      ligne('2026-10-25T22:30:00Z', {
        utilisateurId: d.utilisateurs.admin.id,
        utilisateurLibelle: 'Admin Test <admin@exemple.test>',
        role: 'ADMIN',
        centreId: null,
        action: 'UPDATE',
        entiteType: 'UTILISATEUR',
        entiteId: d.utilisateurs.assistantA.id,
        champs: [
          { champ: 'nom', masque: false, avant: 'Test', apres: 'Essai' },
          { champ: 'motDePasse', masque: true },
        ],
      }),
      // Centre B, le 26 octobre.
      ligne('2026-10-26T09:00:00Z', { centreId: d.centres.b.id, patientId: PATIENT_1 }),
      // Échec de connexion sur un compte inconnu (sans organisation).
      ligne('2026-10-26T10:00:00Z', {
        organisationId: null,
        utilisateurId: null,
        utilisateurLibelle: 'inconnu@exemple.test',
        role: null,
        centreId: null,
        action: 'ECHEC_CONNEXION',
        entiteType: 'SESSION',
        details: { motif: 'E-mail ou mot de passe incorrect, ou compte désactivé' },
      }),
      // Autre organisation : jamais visible.
      ligne('2026-10-26T11:00:00Z', {
        organisationId: '019a2f3c-0000-7000-8000-00000000ffff',
        centreId: null,
      }),
    ],
  });
});

const tous = { type: 'tous' } as const;

async function lireTout(flux: AsyncIterable<string>): Promise<string[]> {
  const morceaux: string[] = [];
  for await (const morceau of flux) {
    morceaux.push(morceau);
  }
  return morceaux;
}
const libelles = (resultat: Awaited<ReturnType<typeof listerJournal>>) =>
  resultat.lignes.map((l) => `${l.action} ${l.horodatage.toISOString()}`);

describe('listerJournal', () => {
  it('liste les lignes de l’organisation, les plus récentes d’abord', async () => {
    const resultat = await listerJournal(d.acteurs.admin, tous, {});
    expect(libelles(resultat)).toEqual([
      'ECHEC_CONNEXION 2026-10-26T10:00:00.000Z',
      'READ 2026-10-26T09:00:00.000Z',
      'UPDATE 2026-10-25T22:30:00.000Z',
      'READ 2026-10-24T22:30:00.000Z',
      'READ 2026-10-24T21:59:00.000Z',
    ]);
    expect(resultat.pagination).toMatchObject({ page: 1, total: 5, nbPages: 1 });
    expect(resultat.lignes[2]).toMatchObject({
      utilisateurLibelle: 'Admin Test <admin@exemple.test>',
      centreNom: null,
      entite: 'Utilisateur',
      champs: 'nom : Test → Essai ; motDePasse : modifié',
    });
    expect(resultat.lignes[1]?.centreNom).toBe('Centre B');
  });

  it.each([
    { cas: 'utilisateur', filtre: () => ({ utilisateurId: d.utilisateurs.admin.id }), attendu: 1 },
    { cas: 'patient', filtre: () => ({ patientId: PATIENT_1 }), attendu: 2 },
    {
      cas: 'période d’un jour (bornes à minuit, heure de Paris)',
      filtre: () => ({ du: '2026-10-25', au: '2026-10-25' }),
      attendu: 2,
    },
    { cas: 'début seul', filtre: () => ({ du: '2026-10-26' }), attendu: 2 },
    { cas: 'fin seule', filtre: () => ({ au: '2026-10-24' }), attendu: 1 },
    {
      cas: 'filtres combinés',
      filtre: () => ({ patientId: PATIENT_1, du: '2026-10-25' }),
      attendu: 1,
    },
  ])('filtre : $cas', async ({ filtre, attendu }) => {
    const resultat = await listerJournal(d.acteurs.admin, tous, filtre());
    expect(resultat.lignes).toHaveLength(attendu);
  });

  it('avec un centre courant, ne montre que les lignes de ce centre', async () => {
    const resultat = await listerJournal(
      d.acteurs.admin,
      { type: 'centre', centreId: d.centres.b.id },
      {},
    );
    expect(libelles(resultat)).toEqual(['READ 2026-10-26T09:00:00.000Z']);
  });

  it('pagine par 50 lignes', async () => {
    await prisma().journalAudit.createMany({
      data: Array.from({ length: 50 }, (_, i) =>
        ligne(`2026-09-01T00:00:${String(i).padStart(2, '0')}Z`),
      ),
    });
    const page2 = await listerJournal(d.acteurs.admin, tous, { page: '2' });
    expect(page2.pagination).toMatchObject({ page: 2, total: 55, nbPages: 2 });
    expect(page2.lignes).toHaveLength(5);
    const auDela = await listerJournal(d.acteurs.admin, tous, { page: '9' });
    expect(auDela.pagination.page).toBe(2);
  });

  it('refuse un filtre invalide', async () => {
    const erreur = await listerJournal(d.acteurs.admin, tous, {
      du: '2026-10-31',
      au: '2026-10-01',
    }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurSaisie);
    expect((erreur as ErreurSaisie).erreurs.au).toEqual([
      'La date de fin doit être postérieure ou égale à la date de début.',
    ]);
  });

  it('est réservé à l’ADMIN', async () => {
    const centreA = { type: 'centre', centreId: d.centres.a.id } as const;
    await expect(listerJournal(d.acteurs.audioAB, centreA, {})).rejects.toThrow(AccesRefuseError);
    await expect(listerJournal(d.acteurs.assistantA, centreA, {})).rejects.toThrow(
      AccesRefuseError,
    );
    await expect(exporterJournal(d.acteurs.audioAB, centreA, {})).rejects.toThrow(AccesRefuseError);
    await expect(utilisateursPourFiltre(d.acteurs.audioAB)).rejects.toThrow(AccesRefuseError);
  });
});

describe('exporterJournal', () => {
  it('journalise l’export puis produit le CSV des lignes filtrées', async () => {
    const flux = await exporterJournal(d.acteurs.admin, tous, { patientId: PATIENT_1, page: '3' });
    const csv = (await lireTout(flux)).join('');

    expect(csv.split('\r\n')).toEqual([
      'Date et heure;Utilisateur;Rôle;Centre;Action;Entité;Identifiant entité;Patient;Champs modifiés;Détails',
      `2026-10-26T10:00:00.000+01:00;Audioab Test <audioab@exemple.test>;Audioprothésiste;Centre B;Consultation;Patient;;${PATIENT_1};;`,
      `2026-10-24T23:59:00.000+02:00;Audioab Test <audioab@exemple.test>;Audioprothésiste;Centre A;Consultation;Patient;${PATIENT_1};${PATIENT_1};;`,
      '',
    ]);

    const exportJournalise = await prisma().journalAudit.findFirstOrThrow({
      where: { action: 'EXPORT' },
    });
    expect(exportJournalise).toMatchObject({
      utilisateurId: d.utilisateurs.admin.id,
      entiteType: 'JOURNAL_AUDIT',
      centreId: null,
      details: { format: 'CSV', filtres: { patientId: PATIENT_1 } },
    });
  });

  it('produit l’export par lots sans perdre de ligne', async () => {
    await prisma().journalAudit.createMany({
      data: Array.from({ length: 2100 }, (_, i) =>
        ligne(new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()),
      ),
    });
    const flux = await exporterJournal(d.acteurs.admin, tous, {});
    const lignesCsv = (await lireTout(flux)).length;
    // En-tête + 2100 + 5 lignes du jeu + la ligne EXPORT elle-même.
    expect(lignesCsv).toBe(1 + 2100 + 5 + 1);
  });
});

describe('utilisateursPourFiltre', () => {
  it('liste les comptes de l’organisation', async () => {
    const utilisateurs = await utilisateursPourFiltre(d.acteurs.admin);
    expect(utilisateurs).toHaveLength(6);
    expect(utilisateurs[0]?.libelle).toBe('Test Admin (admin@exemple.test)');
  });
});
