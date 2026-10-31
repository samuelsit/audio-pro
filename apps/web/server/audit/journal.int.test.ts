import { prisma } from '@ha/db/admin';
import { VALEUR_MASQUEE } from '@ha/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { creerJeuDeDonnees, viderBase, type JeuDeDonnees } from '@/test/donnees';

import { withAudit } from './journal';

let d: JeuDeDonnees;

beforeEach(async () => {
  await viderBase();
  d = await creerJeuDeDonnees();
});

const PATIENT_FICTIF = '019a2f3c-0000-7000-8000-000000000001';
const NIR_FICTIF = '1850578006084';

const lignes = () => prisma().journalAudit.findMany({ orderBy: { horodatage: 'asc' } });

describe('withAudit', () => {
  it('ouvrir un dossier patient écrit une ligne READ', async () => {
    const dossier = await withAudit(
      d.acteurs.audioAB,
      async () => ({ id: PATIENT_FICTIF, nom: 'Fictif' }),
      {
        action: 'READ',
        entiteType: 'PATIENT',
        entiteId: PATIENT_FICTIF,
        patientId: PATIENT_FICTIF,
        centreId: d.centres.a.id,
      },
    );

    expect(dossier.nom).toBe('Fictif');
    expect(await lignes()).toEqual([
      expect.objectContaining({
        action: 'READ',
        entiteType: 'PATIENT',
        entiteId: PATIENT_FICTIF,
        patientId: PATIENT_FICTIF,
        centreId: d.centres.a.id,
        organisationId: d.organisation.id,
        utilisateurId: d.utilisateurs.audioAB.id,
        utilisateurLibelle: 'Audioab Test <audioab@exemple.test>',
        role: 'AUDIO',
        champs: null,
        details: null,
      }),
    ]);
  });

  it('peut écrire plusieurs lignes qui dépendent du résultat', async () => {
    await withAudit(
      d.acteurs.admin,
      async () => ['p1', 'p2'],
      (ids) =>
        ids.map((id) => ({
          action: 'PRINT' as const,
          entiteType: 'DOSSIER' as const,
          entiteId: id,
        })),
    );
    // Même transaction, donc même horodatage : on compare sans tenir compte de l'ordre.
    const ecrites = (await lignes()).map((l) => `${l.action} ${l.entiteId}`).sort();
    expect(ecrites).toEqual(['PRINT p1', 'PRINT p2']);
  });

  it('une opération en échec ne laisse aucune ligne', async () => {
    await expect(
      withAudit(
        d.acteurs.admin,
        async () => {
          throw new Error('échec métier');
        },
        { action: 'DELETE', entiteType: 'PATIENT', entiteId: PATIENT_FICTIF },
      ),
    ).rejects.toThrow('échec métier');
    expect(await lignes()).toEqual([]);
  });

  it('si le journal ne peut pas être écrit, l’opération est annulée', async () => {
    await expect(
      withAudit(
        d.acteurs.admin,
        (tx) => tx.centre.update({ where: { id: d.centres.a.id }, data: { ville: 'Modifiée' } }),
        () => {
          throw new Error('journal indisponible');
        },
      ),
    ).rejects.toThrow('journal indisponible');
    const centre = await prisma().centre.findUniqueOrThrow({ where: { id: d.centres.a.id } });
    expect(centre.ville).toBe('Paris');
  });

  it('ne stocke jamais un NIR en clair (champs, détails)', async () => {
    await withAudit(d.acteurs.admin, async () => undefined, {
      action: 'UPDATE',
      entiteType: 'CENTRE',
      entiteId: d.centres.a.id,
      champs: [{ champ: 'adresseLigne2', masque: false, avant: null, apres: NIR_FICTIF }],
      details: { recherche: `NIR ${NIR_FICTIF}`, liste: [NIR_FICTIF] },
    });
    const [ligne] = await lignes();
    expect(JSON.stringify(ligne)).not.toContain(NIR_FICTIF);
    expect(ligne?.champs).toEqual([
      { champ: 'adresseLigne2', masque: false, avant: null, apres: VALEUR_MASQUEE },
    ]);
    expect(ligne?.details).toEqual({ recherche: VALEUR_MASQUEE, liste: [VALEUR_MASQUEE] });
  });
});

describe('table journal_audit', () => {
  it('est en ajout seul : modification et suppression refusées par la base', async () => {
    await withAudit(d.acteurs.admin, async () => undefined, {
      action: 'READ',
      entiteType: 'PATIENT',
    });
    await expect(
      prisma().journalAudit.updateMany({ data: { utilisateurLibelle: 'falsifié' } }),
    ).rejects.toThrow(/ajout seul/);
    await expect(prisma().journalAudit.deleteMany({})).rejects.toThrow(/ajout seul/);
    await expect(prisma().$executeRaw`DELETE FROM journal_audit`).rejects.toThrow(/ajout seul/);
    expect(await lignes()).toHaveLength(1);
  });
});
