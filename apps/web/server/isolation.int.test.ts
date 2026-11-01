import path from 'node:path';

import { clientApplication, poserContexte, type Prisma } from '@ha/db';
import { prisma } from '@ha/db/admin';
import { beforeAll, describe, expect, it } from 'vitest';

import { creerClientComplet, type ClientComplet } from '@/test/client-complet';
import { viderBase } from '@/test/donnees';

import { AccesRefuseError, type UtilisateurConnecte } from './auth/acces';
import { modifierComplementaire } from './services/complementaires';
import { marquerRelancee, obtenirReglement } from './services/tiers-payant';
import { base } from './chiffrement';
import { importerLpp } from './lpp/importer';
import {
  enregistrerTonale,
  lirePhotoOtoscopie,
  listerBilans,
  obtenirBilan,
  syntheseBilan,
} from './services/audiologie';
import { obtenirAccessoire, obtenirFabricant, obtenirModele } from './services/catalogue';
import { modifierCentre, obtenirCentre } from './services/centres';
import {
  annulerRdv,
  deplacerRdv,
  lireAgenda,
  lireRdv,
  lireSalleAttente,
  listerDemandesEnLigne,
} from './services/agenda';
import {
  changerActivationCabine,
  listerCabines,
  listerExceptions,
  modifierTypeRdv,
} from './services/agenda-parametres';
import { appareilsDuPatient, enregistrerAssurance } from './services/garanties';
import { rendrePret } from './services/prets';
import { obtenirRetour, telechargerBonRetour } from './services/retours-fabricant';
import { obtenirTicket } from './services/tickets-sav';
import { lireParametresReservation } from './services/reservation-parametres';
import { imprimerDevis, lireScanDevis, obtenirDevis } from './services/devis';
import { lireScan, obtenirDossier } from './services/dossiers';
import { compteRenduEssai, lireJustificatif, obtenirEssai } from './services/essais';
import { emettreAvoir } from './services/avoirs';
import { verifierChaineCaisse } from './services/chaine-caisse';
import { obtenirFactureDetail, telechargerPdf, validerFacture } from './services/facturation';
import { lireJustificatifPec, obtenirFacture } from './services/factures';
import { preparerFse } from './services/fse';
import { modifierPatient, obtenirPatient } from './services/patients';
import { obtenirPraticien } from './services/praticiens';
import { changerActivationPrescripteur, obtenirPrescripteur } from './services/prescripteurs';
import { obtenirCommande, produitsDuFournisseur, soumettreCommande } from './services/commandes';
import { modifierFournisseur, obtenirCentrale, obtenirFournisseur } from './services/fournisseurs';
import { telechargerBon } from './services/envoi-commandes';
import {
  obtenirFactureFournisseur,
  telechargerFactureFournisseur,
} from './services/factures-fournisseurs';
import { traiterEcart } from './services/ecarts-achat';
import { proposerReappro } from './services/reappro';
import { obtenirRegleCommande } from './services/regles-commande';
import { obtenirReleve, repointerReleve } from './services/releves-centrale';
import { changerStatut, historiqueAccessoire, obtenirFicheAppareil } from './services/stock';
import { obtenirUtilisateur } from './services/utilisateurs';

const V908 = path.join(import.meta.dirname, '../../../fixtures/lpp/908');

/** Tables isolées par organisation : chaque nouvelle table doit figurer ici (voir le garde-fou). */
const TABLES_ISOLEES = [
  'accessoire',
  'appareil',
  'bilan_audiologique',
  'compteur_sav',
  'garantie_appareil',
  'parametres_sav',
  'pret_appareil',
  'retour_fabricant',
  'ticket_sav',
  'cabine',
  'centrale_achat',
  'centre',
  'commande',
  'commande_ligne',
  'compteur_commande',
  'compte',
  'compteur_devis',
  'couverture_amc',
  'couverture_amo',
  'delivrance',
  'deux_facteurs',
  'devis',
  'devis_ligne',
  'devis_offre',
  'dossier',
  'essai',
  'essai_appareil',
  'essai_rdv',
  'evenement_domaine',
  'exception_agenda',
  'fabricant',
  'facture',
  'ecart_achat',
  'facture_fournisseur',
  'facture_fournisseur_ligne',
  'fournisseur',
  'fournisseur_compte_centre',
  'fournisseur_contact',
  'parametres_commande',
  'reception',
  'reception_ligne',
  'reception_ligne_appareil',
  'regle_commande',
  'releve_centrale',
  'releve_centrale_ligne',
  'archive_caisse',
  'chaine_caisse',
  'cloture_caisse',
  'comptage_caisse',
  'complementaire',
  'creance',
  'encaissement',
  'lettrage',
  'reglement_organisme',
  'regularisation_creance',
  'rejet_creance',
  'evenement_caisse',
  'parametres_comptables',
  'session_caisse',
  'fse',
  'ligne_facture',
  'serie_facture',
  'inventaire',
  'inventaire_ligne',
  'journal_audit',
  'lecture_vitale',
  'lien_document',
  'mesure_audiologique',
  'modele_aide_auditive',
  'modele_code_lpp',
  'modele_formulaire',
  'mouvement_accessoire',
  'mouvement_appareil',
  'notification',
  'organisation',
  'otoscopie',
  'parametres_reservation',
  'patient',
  'praticien',
  'praticien_centre',
  'prescripteur',
  'prescription',
  'prise_en_charge',
  'prolongation_essai',
  'rendez_vous',
  'reponse_formulaire',
  'reservation_en_ligne',
  'seuil_stock',
  'session',
  'signature_devis',
  'stock_accessoire',
  'transition_dossier',
  'type_rdv',
  'type_rdv_en_ligne',
  'utilisateur',
  'utilisateur_centre',
] as const;
type TableIsolee = (typeof TABLES_ISOLEES)[number];

/** Référentiel commun et tables techniques : lecture seule ou aucun droit pour ha_app. */
const TABLES_GLOBALES: Readonly<Record<string, 'LECTURE' | 'AUCUN'>> = {
  _prisma_migrations: 'AUCUN',
  app_meta: 'AUCUN',
  limitation_debit: 'AUCUN',
  verification: 'AUCUN',
  lpp_code: 'LECTURE',
  lpp_fiche: 'LECTURE',
  lpp_lien: 'LECTURE',
  lpp_tarif: 'LECTURE',
  lpp_version: 'LECTURE',
  quota_piles: 'LECTURE',
  taux_tva: 'LECTURE',
};

const TABLES_IDENTITE: readonly string[] = ['compte', 'deux_facteurs', 'session'];

/** Condition SQL « cette ligne appartient à l'organisation $1 ». */
function appartient(table: TableIsolee): string {
  if (table === 'organisation') {
    return 'id = $1';
  }
  if (TABLES_IDENTITE.includes(table)) {
    return 'utilisateur_id IN (SELECT id FROM utilisateur WHERE organisation_id = $1)';
  }
  return 'organisation_id = $1';
}

function colonneNeutre(table: TableIsolee): string {
  return TABLES_IDENTITE.includes(table) ? 'utilisateur_id' : 'organisation_id';
}

/** Une requête SQL sous le rôle ha_app, dans le contexte d'une organisation. */
function sousContexte<T>(
  organisationId: string,
  requete: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return clientApplication().$transaction(async (tx) => {
    await poserContexte(tx, organisationId);
    return requete(tx);
  });
}

async function compter(
  client: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>,
  table: string,
  condition = 'TRUE',
  ...parametres: unknown[]
): Promise<number> {
  const [ligne] = await client.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "${table}" WHERE ${condition}`,
    ...parametres,
  );
  return Number(ligne?.n);
}

/** Une liste sans ligne vaut refus : le service ne distingue pas un id inconnu d'un id sans historique. */
async function rejeterSiVide(liste: Promise<readonly unknown[]>): Promise<void> {
  if ((await liste).length === 0) {
    throw new AccesRefuseError();
  }
}

let a: ClientComplet;
let b: ClientComplet;
let idA: string;
let idB: string;

beforeAll(async () => {
  await viderBase();
  await importerLpp(V908);
  a = await creerClientComplet('');
  b = await creerClientComplet('-b');
  idA = a.d.organisation.id;
  idB = b.d.organisation.id;
}, 120_000);

describe('garde-fou sur le catalogue PostgreSQL', () => {
  it('toute table est soit isolée, soit déclarée globale', async () => {
    const tables = await prisma().$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    expect(tables.map((t) => t.tablename).sort()).toEqual(
      [...TABLES_ISOLEES, ...Object.keys(TABLES_GLOBALES)].sort(),
    );
  });

  it('chaque table isolée a la RLS activée, forcée, et une politique', async () => {
    const lignes = await prisma().$queryRaw<
      { table: string; forcee: boolean; politiques: bigint }[]
    >`
      SELECT c.relname AS "table",
             c.relrowsecurity AND c.relforcerowsecurity AS forcee,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS politiques
      FROM pg_class c
      WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace`;
    const parTable = new Map(lignes.map((l) => [l.table, l]));
    for (const table of TABLES_ISOLEES) {
      expect(parTable.get(table)?.forcee, table).toBe(true);
      expect(Number(parTable.get(table)?.politiques), table).toBeGreaterThan(0);
    }
  });

  it('ha_app n’a ni superuser, ni BYPASSRLS, et ne possède aucune table', async () => {
    const [role] = await prisma().$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'ha_app'`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    const possedees = await prisma().$queryRaw<unknown[]>`
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'ha_app'`;
    expect(possedees).toHaveLength(0);
  });

  it('ha_plateforme ne lit aucune table de données patient', async () => {
    const droits = await prisma().$queryRaw<{ table_name: string }[]>`
      SELECT DISTINCT table_name FROM information_schema.role_table_grants
      WHERE grantee = 'ha_plateforme' AND privilege_type = 'SELECT'`;
    const tables = droits.map((d) => d.table_name);
    expect(tables).toEqual(
      expect.arrayContaining(['organisation', 'utilisateur', 'session', 'compte']),
    );
    for (const table of [
      'patient',
      'couverture_amo',
      'dossier',
      'devis',
      'prescription',
      'appareil',
      'rendez_vous',
      'exception_agenda',
    ]) {
      expect(tables).not.toContain(table);
    }
  });

  it('ha_plateforme ne lit de l’outbox que l’organisation et l’état de diffusion', async () => {
    // `role_table_grants` ignore les droits par colonne : seul `column_privileges` prouve que la charge reste illisible.
    const colonnes = await prisma().$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'ha_plateforme' AND table_name = 'evenement_domaine'
        AND privilege_type = 'SELECT'`;
    expect(colonnes.map((c) => c.column_name).sort()).toEqual(['diffuse_le', 'organisation_id']);
  });

  it('ha_plateforme ne lit des notifications ni le destinataire ni les paramètres', async () => {
    const colonnes = await prisma().$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'ha_plateforme' AND table_name = 'notification' AND privilege_type = 'SELECT'`;
    expect(colonnes.map((c) => c.column_name).sort()).toEqual([
      'organisation_id',
      'prochain_essai_le',
      'statut',
    ]);
  });

  it('ha_plateforme ne lit rien des réservations en ligne', async () => {
    const colonnes = await prisma().$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'ha_plateforme' AND table_name = 'reservation_en_ligne'`;
    expect(colonnes).toEqual([]);
  });

  it.each(Object.entries(TABLES_GLOBALES))('table globale %s : droits %s', async (table, droit) => {
    const lecture = clientApplication().$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
    if (droit === 'LECTURE') {
      await expect(lecture).resolves.toBeDefined();
    } else {
      await expect(lecture).rejects.toThrow(/permission denied/);
    }
    await expect(clientApplication().$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe.each(TABLES_ISOLEES)('isolation de %s', (table) => {
  it('le jeu de test couvre la table chez les deux clients', async () => {
    expect(await compter(prisma(), table, appartient(table), idA)).toBeGreaterThan(0);
    expect(await compter(prisma(), table, appartient(table), idB)).toBeGreaterThan(0);
  });

  it('A voit toutes ses lignes et aucune de B', async () => {
    const attendu = await compter(prisma(), table, appartient(table), idA);
    const [total, deB] = await sousContexte(idA, async (tx) => [
      await compter(tx, table),
      await compter(tx, table, appartient(table), idB),
    ]);
    expect(total).toBe(attendu);
    expect(deB).toBe(0);
  });

  it('sans contexte, aucune ligne', async () => {
    expect(await compter(clientApplication(), table)).toBe(0);
  });

  it('A ne lit pas une ligne de B par son identifiant', async () => {
    const [ligne] = await prisma().$queryRawUnsafe<{ ligne: Record<string, unknown> }[]>(
      `SELECT to_jsonb(t) AS ligne FROM "${table}" t WHERE ${appartient(table)} LIMIT 1`,
      idB,
    );
    const id = ligne?.ligne.id;
    const vues = await sousContexte(idA, (tx) =>
      typeof id === 'string'
        ? compter(tx, table, 'id = $1', id)
        : compter(tx, table, appartient(table), idB),
    );
    expect(vues).toBe(0);
  });

  it('A ne modifie ni ne supprime une ligne de B', async () => {
    const avant = await compter(prisma(), table, appartient(table), idB);
    const colonne = colonneNeutre(table);
    const ecritures = [
      table === 'organisation'
        ? null
        : `UPDATE "${table}" SET ${colonne} = ${colonne} WHERE ${appartient(table)}`,
      `DELETE FROM "${table}" WHERE ${appartient(table)}`,
    ].filter((e) => e !== null);
    for (const ecriture of ecritures) {
      // Écriture sans effet (0 ligne), ou refusée d'emblée pour les tables sans ce droit.
      const resultat = await sousContexte(idA, (tx) => tx.$executeRawUnsafe(ecriture, idB)).catch(
        (erreur: Error) => {
          expect(erreur.message).toMatch(/permission denied/);
          return 0;
        },
      );
      expect(resultat).toBe(0);
    }
    expect(await compter(prisma(), table, appartient(table), idB)).toBe(avant);
  });

  it('A ne crée pas de ligne chez B', async () => {
    const [source] = await prisma().$queryRawUnsafe<{ ligne: unknown }[]>(
      `SELECT to_jsonb(t) AS ligne FROM "${table}" t WHERE ${appartient(table)} LIMIT 1`,
      idB,
    );
    const avant = await compter(prisma(), table);
    await expect(
      sousContexte(idA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}", $1::jsonb)`,
          JSON.stringify(source?.ligne),
        ),
      ),
    ).rejects.toThrow(/row-level security|null value|permission denied|hors organisation/);
    expect(await compter(prisma(), table)).toBe(avant);
  });
});

describe('garanties propres à certaines tables', () => {
  it('le journal reste en ajout seul pour ha_app, même sur ses propres lignes', async () => {
    await expect(
      sousContexte(idA, (tx) => tx.$executeRawUnsafe('DELETE FROM journal_audit')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sousContexte(idA, (tx) => tx.$executeRawUnsafe(`UPDATE journal_audit SET action = 'READ'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('une ligne de journal sans organisation n’est visible d’aucun client', async () => {
    const ligne = await prisma().journalAudit.create({
      data: {
        utilisateurLibelle: 'inconnu@exemple.test',
        action: 'ECHEC_CONNEXION',
        entiteType: 'SESSION',
      },
    });
    expect(await sousContexte(idA, (tx) => compter(tx, 'journal_audit', 'id = $1', ligne.id))).toBe(
      0,
    );
  });

  it('chaque référence entre tables d’organisation est contrôlée par la base', async () => {
    const references = await prisma().$queryRaw<{ enfant: string; colonne: string }[]>`
      SELECT DISTINCT e.relname AS enfant, a.attname AS colonne
      FROM pg_constraint c
      JOIN pg_class e ON e.oid = c.conrelid
      CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(enfant_att, parent_att)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.enfant_att
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = k.parent_att
      WHERE c.contype = 'f' AND pa.attname = 'id'
        AND c.confrelid <> 'organisation'::regclass
        AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.conrelid AND x.attname = 'organisation_id')
        AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.confrelid AND x.attname = 'organisation_id')`;
    const triggers = await prisma().$queryRaw<{ enfant: string; nom: string }[]>`
      SELECT tgrelid::regclass::text AS enfant, tgname AS nom FROM pg_trigger
      WHERE tgname LIKE 'zz_meme_organisation_%'`;
    expect(references.length).toBeGreaterThan(50);
    expect(triggers.map((t) => `${t.enfant}.${t.nom}`).sort()).toEqual(
      references.map((r) => `${r.enfant}.zz_meme_organisation_${r.colonne}`).sort(),
    );
  });

  it('une table à plusieurs parents refuse un parent d’un autre client', async () => {
    await expect(
      base(a.d.acteurs.admin).stockAccessoire.create({
        data: { accessoireId: a.catalogue.kit, centreId: b.d.centres.a.id, quantite: 1 },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('un UPDATE ne peut pas rattacher une ligne au parent d’un autre client', async () => {
    await expect(
      base(a.d.acteurs.admin).couvertureAmc.updateMany({
        where: { patientId: a.patientId },
        data: { patientId: b.patientId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      base(a.d.acteurs.admin).appareil.update({
        where: { id: a.appareilId },
        data: { centreId: b.d.centres.a.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('même le rôle propriétaire ne peut pas croiser deux clients', async () => {
    await expect(
      prisma().couvertureAmc.updateMany({
        where: { patientId: a.patientId },
        data: { patientId: b.patientId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('un enfant rattaché au parent d’un autre client est refusé par la base', async () => {
    await expect(
      base(a.d.acteurs.admin).couvertureAmc.create({
        data: { patientId: b.patientId, organismeNom: 'Mutuelle forcée' },
      }),
    ).rejects.toThrow();
  });

  it('un même RPPS et un même FINESS coexistent chez deux clients', async () => {
    const praticiens = await prisma().praticien.findMany({ where: { rpps: '19999999907' } });
    expect(praticiens).toHaveLength(2);
    for (const { d } of [a, b]) {
      await prisma().centre.update({
        where: { id: d.centres.b.id },
        data: { finess: '123456789' },
      });
    }
  });
});

describe('identifiant d’un autre client forcé dans l’URL', () => {
  /** Pour chaque page ou route : le service appelé par A avec l'identifiant de B. */
  const CAS: readonly {
    entite: string;
    appel: (acteur: UtilisateurConnecte, cible: ClientComplet) => Promise<unknown>;
  }[] = [
    { entite: 'patient', appel: (x, c) => obtenirPatient(x, c.patientId) },
    { entite: 'dossier', appel: (x, c) => obtenirDossier(x, c.dossierId) },
    { entite: 'bilan audiologique', appel: (x, c) => obtenirBilan(x, c.bilanId) },
    { entite: 'bilans du patient', appel: (x, c) => listerBilans(x, c.patientId) },
    { entite: 'synthèse du bilan', appel: (x, c) => syntheseBilan(x, c.bilanId) },
    { entite: 'photo d’otoscopie', appel: (x, c) => lirePhotoOtoscopie(x, c.bilanId, 'DROITE') },
    {
      entite: 'modification d’un audiogramme',
      appel: (x, c) =>
        enregistrerTonale(x, c.bilanId, {
          appareil: null,
          audiogramme: {
            droite: {
              aerienne: [{ frequence: 1000, seuil: 40, masque: null }],
              osseuse: [],
              inconfort: [],
            },
            gauche: { aerienne: [], osseuse: [], inconfort: [] },
          },
        }),
    },
    { entite: 'devis', appel: (x, c) => obtenirDevis(x, c.devisId) },
    { entite: 'scan du devis', appel: (x, c) => lireScanDevis(x, c.devisId) },
    { entite: 'PDF du devis', appel: (x, c) => imprimerDevis(x, c.devisId) },
    { entite: 'scan de l’ordonnance', appel: (x, c) => lireScan(x, c.dossierId, c.prescriptionId) },
    { entite: 'essai', appel: (x, c) => obtenirEssai(x, c.dossierId) },
    { entite: 'justificatif d’essai', appel: (x, c) => lireJustificatif(x, c.dossierId) },
    { entite: 'compte rendu', appel: (x, c) => compteRenduEssai(x, c.dossierId) },
    { entite: 'facture', appel: (x, c) => obtenirFacture(x, c.dossierId) },
    { entite: 'pièce validée', appel: (x, c) => obtenirFactureDetail(x, c.venteId) },
    { entite: 'PDF de facture', appel: (x, c) => telechargerPdf(x, c.venteId) },
    { entite: 'validation de facture', appel: (x, c) => validerFacture(x, c.venteId) },
    {
      entite: 'avoir',
      appel: (x, c) => emettreAvoir(x, c.venteId, { mode: 'TOTAL', motif: 'Test' }),
    },
    { entite: 'FSE', appel: (x, c) => preparerFse(x, c.venteId) },
    {
      entite: 'chaîne de caisse',
      appel: (x, c) => verifierChaineCaisse(x, c.d.centres.a.id),
    },
    { entite: 'justificatif de PEC', appel: (x, c) => lireJustificatifPec(x, c.dossierId) },
    { entite: 'appareil', appel: (x, c) => obtenirFicheAppareil(x, c.appareilId) },
    { entite: 'prescripteur', appel: (x, c) => obtenirPrescripteur(x, c.prescripteurId) },
    { entite: 'centre', appel: (x, c) => obtenirCentre(x, c.d.centres.a.id) },
    { entite: 'utilisateur', appel: (x, c) => obtenirUtilisateur(x, c.d.utilisateurs.audioAB.id) },
    { entite: 'praticien', appel: (x, c) => obtenirPraticien(x, c.d.praticiens.praticienAB.id) },
    { entite: 'fabricant', appel: (x, c) => obtenirFabricant(x, c.fabricantId) },
    { entite: 'fournisseur', appel: (x, c) => obtenirFournisseur(x, c.fournisseurId) },
    { entite: 'centrale d’achat', appel: (x, c) => obtenirCentrale(x, c.centraleId) },
    { entite: 'commande', appel: (x, c) => obtenirCommande(x, c.commandeId) },
    { entite: 'soumission de commande', appel: (x, c) => soumettreCommande(x, c.commandeId) },
    { entite: 'bon de commande', appel: (x, c) => telechargerBon(x, c.commandeId) },
    { entite: 'appareils du patient', appel: (x, c) => appareilsDuPatient(x, c.patientId) },
    { entite: 'ticket SAV', appel: (x, c) => obtenirTicket(x, c.ticketId) },
    { entite: 'retour fabricant', appel: (x, c) => obtenirRetour(x, c.retourId) },
    {
      entite: 'prêt',
      appel: (x, c) => rendrePret(x, c.pretId, { etatRetour: '' }),
    },
    { entite: 'bon de retour', appel: (x, c) => telechargerBonRetour(x, c.retourId) },
    {
      entite: 'assurance d’un appareil',
      appel: (x, c) =>
        enregistrerAssurance(x, c.appareilId, { assureur: '', contrat: '', assuranceFin: '' }),
    },
    {
      entite: 'facture fournisseur',
      appel: (x, c) => obtenirFactureFournisseur(x, c.factureFournisseurId),
    },
    {
      entite: 'PDF d’une facture fournisseur',
      appel: (x, c) => telechargerFactureFournisseur(x, c.factureFournisseurId),
    },
    { entite: 'relevé de centrale', appel: (x, c) => obtenirReleve(x, c.releveId) },
    { entite: 'pointage d’un relevé', appel: (x, c) => repointerReleve(x, c.releveId) },
    { entite: 'réapprovisionnement', appel: (x, c) => proposerReappro(x, c.d.centres.a.id) },
    {
      entite: 'traitement d’un écart',
      appel: (x, c) => traiterEcart(x, c.ecartId, { statut: 'RESOLU', commentaire: 'Forcé' }),
    },
    { entite: 'règle de commande', appel: (x, c) => obtenirRegleCommande(x, c.regleCommandeId) },
    {
      entite: 'produits d’un fournisseur',
      appel: (x, c) => produitsDuFournisseur(x, c.fournisseurId),
    },
    {
      entite: 'modification d’un fournisseur',
      appel: (x, c) =>
        modifierFournisseur(x, c.fournisseurId, { type: 'FOURNISSEUR', nom: 'Forcé', actif: true }),
    },
    { entite: 'règlement d’organisme', appel: (x, c) => obtenirReglement(x, c.reglementId) },
    { entite: 'relance d’une créance', appel: (x, c) => marquerRelancee(x, c.creanceId) },
    {
      entite: 'modification d’une complémentaire',
      appel: (x, c) =>
        modifierComplementaire(x, c.complementaireId, {
          nom: 'Mutuelle fictive',
          identifiant: 'AMC-TEST',
          modePec: 'PORTAIL',
          delaiPaiementJours: '30',
        }),
    },
    { entite: 'modèle', appel: (x, c) => obtenirModele(x, c.catalogue.classeI) },
    { entite: 'accessoire', appel: (x, c) => obtenirAccessoire(x, c.catalogue.piles) },
    {
      entite: 'historique accessoire',
      appel: (x, c) => rejeterSiVide(historiqueAccessoire(x, { type: 'tous' }, c.catalogue.piles)),
    },
    { entite: 'rendez-vous', appel: (x, c) => lireRdv(x, c.rdvId) },
    {
      entite: 'réglages de réservation',
      appel: (x, c) => lireParametresReservation(x, c.d.centres.a.id),
    },
    {
      entite: 'demandes en ligne',
      appel: (x, c) => listerDemandesEnLigne(x, c.d.centres.a.id),
    },
    {
      entite: 'agenda',
      appel: (x, c) => lireAgenda(x, c.d.centres.a.id, '2030-01-07', '2030-01-07'),
    },
    {
      entite: 'salle d’attente',
      appel: (x, c) => lireSalleAttente(x, c.d.centres.a.id, '2030-01-07'),
    },
    { entite: 'cabines', appel: (x, c) => listerCabines(x, c.d.centres.a.id) },
    { entite: 'exceptions', appel: (x, c) => listerExceptions(x, c.d.centres.a.id, '2030-01-01') },
    {
      entite: 'modification de patient',
      appel: (x, c) => modifierPatient(x, c.patientId, {}),
    },
    {
      entite: 'modification de centre',
      appel: (x, c) => modifierCentre(x, c.d.centres.a.id, {}),
    },
    {
      entite: 'désactivation de prescripteur',
      appel: (x, c) => changerActivationPrescripteur(x, c.prescripteurId, false),
    },
    {
      entite: 'déplacement de rendez-vous',
      appel: (x, c) =>
        deplacerRdv(x, c.rdvId, {
          version: 1,
          date: '2030-01-08',
          heure: '09:00',
          dureeMinutes: 60,
        }),
    },
    { entite: 'annulation de rendez-vous', appel: (x, c) => annulerRdv(x, c.rdvId, 1) },
    {
      entite: 'désactivation de cabine',
      appel: (x, c) => changerActivationCabine(x, c.cabineId, false),
    },
    {
      entite: 'modification de type de rendez-vous',
      appel: (x, c) =>
        modifierTypeRdv(x, c.typeRdvId, {
          nom: 'Forcé',
          dureeMinutes: 30,
          couleur: '#000000',
          requierePraticien: true,
          requiereCabine: false,
          reservableEnLigne: false,
          delaiMinimalMinutes: 0,
          natureEssai: null,
        }),
    },
    {
      entite: 'changement de statut d’appareil',
      appel: (x, c) =>
        changerStatut(x, c.appareilId, { statut: 'SAV', statutAttendu: 'RESERVE', motif: 'Forcé' }),
    },
  ];

  it.each(CAS)('$entite', async ({ appel }) => {
    await expect(appel(a.d.acteurs.admin, b)).rejects.toBeInstanceOf(AccesRefuseError);
  });

  /** Les mêmes lectures chez soi, sur de vrais fichiers : sans ce témoin, un refus ne prouverait rien. */
  const TEMOINS = CAS.filter(
    ({ entite }) =>
      !entite.startsWith('modification') &&
      !entite.startsWith('désactivation') &&
      ![
        'changement de statut d’appareil',
        'déplacement de rendez-vous',
        'annulation de rendez-vous',
        // Déjà validée et déjà transmise : ces écritures ne se rejouent pas chez soi.
        'validation de facture',
        'avoir',
        'FSE',
      ].includes(entite),
  );

  it.each(TEMOINS)('témoin : $entite réussit chez soi', async ({ appel }) => {
    await expect(appel(a.d.acteurs.admin, a)).resolves.not.toThrow();
  });

  it('une ligne ne change pas de client, même pour le rôle propriétaire', async () => {
    await expect(
      prisma().couvertureAmc.updateMany({
        where: { patientId: a.patientId },
        data: { organisationId: idB },
      }),
    ).rejects.toThrow();
    await expect(
      prisma().utilisateur.update({
        where: { id: a.d.utilisateurs.assistantA.id },
        data: { organisationId: idB },
      }),
    ).rejects.toThrow();
  });

  it('chaque table d’organisation interdit de changer de client', async () => {
    const tables = await prisma().$queryRaw<{ table: string }[]>`
      SELECT tgrelid::regclass::text AS "table" FROM pg_trigger
      WHERE tgname = 'zz_organisation_immuable'`;
    const attendues = TABLES_ISOLEES.filter(
      (t) => t !== 'organisation' && !TABLES_IDENTITE.includes(t),
    );
    expect(tables.map((t) => t.table).sort()).toEqual([...attendues].sort());
  });
});
