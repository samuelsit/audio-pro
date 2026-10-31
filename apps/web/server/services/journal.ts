import { bornesJourneeParis, formaterInstantParis } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  calculerPagination,
  filtreJournalSchema,
  LIBELLES_ACTIONS_AUDIT,
  LIBELLES_ROLES_COMPTE,
  LIBELLES_TYPES_ENTITE,
  ligneCsv,
  resumerChampsModifies,
  typeEntiteSchema,
  type ActionAudit,
  type ChampModifie,
  type FiltreJournal,
  type Pagination,
  type Perimetre,
  type RoleCompte,
} from '@ha/domain';

import { verifierPerimetre, verifierRole, type UtilisateurConnecte } from '../auth/acces';
import { journaliser, auteurDepuisActeur } from '../audit/journal';
import { base } from '../chiffrement';
import { valider } from '../erreurs';

export const LIGNES_PAR_PAGE = 50;
const LOT_EXPORT = 1000;

export interface LigneJournal {
  id: string;
  horodatage: Date;
  utilisateurId: string | null;
  utilisateurLibelle: string;
  role: RoleCompte | null;
  centreNom: string | null;
  action: ActionAudit;
  /** Libellé du type d'entité (le code brut s'il est inconnu du domaine). */
  entite: string;
  entiteId: string | null;
  patientId: string | null;
  /** Résumé des champs modifiés (valeurs déjà masquées à l'écriture). */
  champs: string;
  details: string;
}

/** Réservé à l'ADMIN_CLIENT ; le périmètre (centre courant) n'est jamais cru sur parole. */
function verifierAcces(acteur: UtilisateurConnecte, perimetre: Perimetre): void {
  verifierRole(acteur, 'ADMIN_CLIENT');
  verifierPerimetre(acteur, perimetre);
}

/**
 * Lignes de l'organisation, limitées au centre courant s'il y en a un : les lignes sans centre (comptes, connexions) n'apparaissent
 * alors pas. Période en jours Europe/Paris, bornes incluses.
 */
function clauseFiltre(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  filtre: FiltreJournal,
): Prisma.JournalAuditWhereInput {
  const horodatage: Prisma.DateTimeFilter = {};
  if (filtre.du) {
    horodatage.gte = new Date(bornesJourneeParis(filtre.du).debut);
  }
  if (filtre.au) {
    horodatage.lt = new Date(bornesJourneeParis(filtre.au).fin);
  }
  return {
    organisationId: acteur.organisationId,
    ...(perimetre.type === 'centre' ? { centreId: perimetre.centreId } : {}),
    ...(filtre.utilisateurId ? { utilisateurId: filtre.utilisateurId } : {}),
    ...(filtre.patientId ? { patientId: filtre.patientId } : {}),
    ...(filtre.du || filtre.au ? { horodatage } : {}),
  };
}

const ORDRE = [
  { horodatage: 'desc' },
  { id: 'desc' },
] satisfies Prisma.JournalAuditOrderByWithRelationInput[];

type LigneBrute = Prisma.JournalAuditGetPayload<object>;

async function nomsDesCentres(acteur: UtilisateurConnecte): Promise<Map<string, string>> {
  const centres = await base(acteur).centre.findMany({
    where: { organisationId: acteur.organisationId },
    select: { id: true, nom: true },
  });
  return new Map(centres.map((c) => [c.id, c.nom]));
}

function versLigne(l: LigneBrute, centres: ReadonlyMap<string, string>): LigneJournal {
  const type = typeEntiteSchema.safeParse(l.entiteType);
  return {
    id: l.id,
    horodatage: l.horodatage,
    utilisateurId: l.utilisateurId,
    utilisateurLibelle: l.utilisateurLibelle,
    role: l.role,
    centreNom: l.centreId ? (centres.get(l.centreId) ?? l.centreId) : null,
    action: l.action,
    entite: type.success ? LIBELLES_TYPES_ENTITE[type.data] : l.entiteType,
    entiteId: l.entiteId,
    patientId: l.patientId,
    champs: Array.isArray(l.champs)
      ? resumerChampsModifies(l.champs as unknown as ChampModifie[])
      : '',
    details: l.details === null ? '' : JSON.stringify(l.details),
  };
}

export async function listerJournal(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<{ lignes: LigneJournal[]; pagination: Pagination; filtre: FiltreJournal }> {
  verifierAcces(acteur, perimetre);
  const filtre = valider(filtreJournalSchema, saisie);
  const where = clauseFiltre(acteur, perimetre, filtre);
  const total = await base(acteur).journalAudit.count({ where });
  const pagination = calculerPagination(filtre.page, LIGNES_PAR_PAGE, total);
  const [lignes, centres] = await Promise.all([
    base(acteur).journalAudit.findMany({
      where,
      orderBy: ORDRE,
      skip: pagination.decalage,
      take: LIGNES_PAR_PAGE,
    }),
    nomsDesCentres(acteur),
  ]);
  return { lignes: lignes.map((l) => versLigne(l, centres)), pagination, filtre };
}

/** Comptes proposés dans le filtre « utilisateur » (tous les comptes de l'organisation). */
export async function utilisateursPourFiltre(
  acteur: UtilisateurConnecte,
): Promise<{ id: string; libelle: string }[]> {
  verifierRole(acteur, 'ADMIN_CLIENT');
  const utilisateurs = await base(acteur).utilisateur.findMany({
    where: { organisationId: acteur.organisationId },
    select: { id: true, prenom: true, nom: true, email: true },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });
  return utilisateurs.map((u) => ({ id: u.id, libelle: `${u.nom} ${u.prenom} (${u.email})` }));
}

export const ENTETES_EXPORT = [
  'Date et heure',
  'Utilisateur',
  'Rôle',
  'Centre',
  'Action',
  'Entité',
  'Identifiant entité',
  'Patient',
  'Champs modifiés',
  'Détails',
] as const;

/**
 * Export CSV des lignes filtrées. L'export est lui-même journalisé (EXPORT, filtres en détail) avant
 * toute lecture. Les lignes sont produites par lots, sans tout charger en mémoire.
 */
export async function exporterJournal(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<AsyncGenerator<string>> {
  verifierAcces(acteur, perimetre);
  const filtre = valider(filtreJournalSchema, saisie);
  const filtresExportes = Object.fromEntries(
    Object.entries(filtre).filter(([cle]) => cle !== 'page'),
  );
  await journaliser(base(acteur), auteurDepuisActeur(acteur), {
    action: 'EXPORT',
    entiteType: 'JOURNAL_AUDIT',
    centreId: perimetre.type === 'centre' ? perimetre.centreId : null,
    details: { format: 'CSV', filtres: filtresExportes },
  });
  const where = clauseFiltre(acteur, perimetre, filtre);
  const centres = await nomsDesCentres(acteur);

  async function* lignes(): AsyncGenerator<string> {
    yield ligneCsv(ENTETES_EXPORT);
    let curseur: string | undefined;
    for (;;) {
      const lot = await base(acteur).journalAudit.findMany({
        where,
        orderBy: ORDRE,
        take: LOT_EXPORT,
        ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
      });
      for (const brute of lot) {
        const l = versLigne(brute, centres);
        yield ligneCsv([
          formaterInstantParis(l.horodatage),
          l.utilisateurLibelle,
          l.role ? LIBELLES_ROLES_COMPTE[l.role] : '',
          l.centreNom,
          LIBELLES_ACTIONS_AUDIT[l.action],
          l.entite,
          l.entiteId,
          l.patientId,
          l.champs,
          l.details,
        ]);
      }
      if (lot.length < LOT_EXPORT) {
        return;
      }
      curseur = lot.at(-1)?.id;
    }
  }
  return lignes();
}
