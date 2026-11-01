import { randomBytes } from 'node:crypto';

import { SystemClock } from '@ha/adapters';
import type { Prisma } from '@ha/db';
import {
  calculerPagination,
  commandeAnnulable,
  commandeCloturable,
  commandeCreationSchema,
  commandeModifiable,
  deciderApprobation,
  filtreCommandesSchema,
  ligneCommandeSaisieSchema,
  montantCommande,
  motifCommandeSchema,
  OCTETS_REFERENCE_PATIENT,
  peutApprouverCommande,
  peutVoirPrixAchat,
  prixCommandeModifiable,
  prixLigneSaisieSchema,
  referencePatientDepuis,
  statutSelonQuantites,
  transitionCommandeAutorisee,
  type Clock,
  type FiltreCommandes,
  type LigneCommandeSaisie,
  type OreilleCommande,
  type Pagination,
  type Perimetre,
  type StatutCommande,
  type TypeProduitCommande,
} from '@ha/domain';

import {
  AccesRefuseError,
  verifierAccesCentre,
  verifierPerimetre,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { centresDuPerimetre } from '../perimetre';
import { aujourdhui } from './patients';
import { verifierCentreActif, verifierPatient } from './stock';

const horloge: Clock = new SystemClock();
const LIGNES_PAR_PAGE = 50;

export interface CommandeListee {
  id: string;
  numero: string;
  statut: StatutCommande;
  centre: string;
  fournisseur: string;
  createdAt: Date;
  /** Null si un prix manque, ou pour un rôle qui ne voit pas les prix d'achat. */
  montantCentimes: number | null;
}

export interface ListeCommandes {
  lignes: CommandeListee[];
  pagination: Pagination;
  filtre: FiltreCommandes;
}

export interface LigneCommandeVue {
  id: string;
  type: TypeProduitCommande;
  modeleId: string | null;
  accessoireId: string | null;
  designation: string;
  referenceCommerciale: string | null;
  quantite: number;
  quantiteRecue: number;
  quantiteFacturee: number;
  quantiteAbandonnee: number;
  /** Toujours null pour un rôle qui n'y a pas droit. */
  prixAchatCentimes: number | null;
  enConsignation: boolean;
  patient: { id: string; nom: string } | null;
  referencePatient: string | null;
  oreille: OreilleCommande | null;
}

export interface CommandeDetail {
  id: string;
  numero: string;
  statut: StatutCommande;
  centreId: string;
  centre: string;
  fournisseurId: string;
  fournisseur: string;
  demandeur: string;
  approbateur: string | null;
  approuveeLe: Date | null;
  envoiDirect: boolean;
  motifRefus: string | null;
  motifAnnulation: string | null;
  createdAt: Date;
  montantCentimes: number | null;
  lignes: LigneCommandeVue[];
}

export interface ProduitCommandable {
  /** Valeur du champ `produit`. */
  valeur: string;
  libelle: string;
}

const selectionLigne = {
  id: true,
  modeleId: true,
  accessoireId: true,
  quantite: true,
  quantiteRecue: true,
  quantiteFacturee: true,
  quantiteAbandonnee: true,
  prixAchatCentimes: true,
  enConsignation: true,
  patientId: true,
  referencePatient: true,
  oreille: true,
  modele: {
    select: {
      gamme: true,
      nom: true,
      referenceCommerciale: true,
      fabricant: { select: { nom: true } },
    },
  },
  accessoire: { select: { nom: true, nature: true, referenceCommerciale: true } },
} as const;

type LigneLue = Prisma.CommandeLigneGetPayload<{ select: typeof selectionLigne }>;

const selectionCommande = {
  id: true,
  numero: true,
  statut: true,
  centreId: true,
  fournisseurId: true,
  regleId: true,
  motifRefus: true,
  motifAnnulation: true,
  approuveeLe: true,
  createdAt: true,
  centre: { select: { nom: true } },
  fournisseur: { select: { nom: true, actif: true } },
  demandeur: { select: { name: true } },
  approbateur: { select: { name: true } },
  lignes: { select: selectionLigne, orderBy: { id: 'asc' } },
} as const;

type CommandeLue = Prisma.CommandeGetPayload<{ select: typeof selectionCommande }>;

export function typeDeLigne(ligne: Pick<LigneLue, 'accessoire'>): TypeProduitCommande {
  if (ligne.accessoire === null) {
    return 'APPAREIL';
  }
  return ligne.accessoire.nature === 'PILE' ? 'PILE' : 'ACCESSOIRE';
}

function designation(ligne: LigneLue): string {
  return ligne.modele
    ? `${ligne.modele.fabricant.nom} ${ligne.modele.gamme} ${ligne.modele.nom}`
    : (ligne.accessoire?.nom ?? '');
}

function versLigneVue(
  ligne: LigneLue,
  acteur: UtilisateurConnecte,
  patients: ReadonlyMap<string, string>,
): LigneCommandeVue {
  return {
    id: ligne.id,
    type: typeDeLigne(ligne),
    modeleId: ligne.modeleId,
    accessoireId: ligne.accessoireId,
    designation: designation(ligne),
    referenceCommerciale:
      ligne.modele?.referenceCommerciale ?? ligne.accessoire?.referenceCommerciale ?? null,
    quantite: ligne.quantite,
    quantiteRecue: ligne.quantiteRecue,
    quantiteFacturee: ligne.quantiteFacturee,
    quantiteAbandonnee: ligne.quantiteAbandonnee,
    prixAchatCentimes: peutVoirPrixAchat(acteur.role) ? ligne.prixAchatCentimes : null,
    enConsignation: ligne.enConsignation,
    patient:
      ligne.patientId === null
        ? null
        : { id: ligne.patientId, nom: patients.get(ligne.patientId) ?? '' },
    referencePatient: ligne.referencePatient,
    oreille: ligne.oreille,
  };
}

function evenement(
  commande: { id: string; centreId: string },
  details: Readonly<Record<string, unknown>>,
  action: EvenementAudit['action'] = 'UPDATE',
): EvenementAudit {
  return {
    action,
    entiteType: 'COMMANDE',
    entiteId: commande.id,
    centreId: commande.centreId,
    details,
  };
}

/** Sérialise tout ce qui touche à une commande. Le droit se juge sur le centre de la commande. */
export async function verrouillerCommande(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<CommandeLue> {
  await tx.$queryRaw`SELECT id FROM commande WHERE id = ${commandeId} FOR UPDATE`;
  const commande = await tx.commande.findFirst({
    where: { id: commandeId, organisationId: acteur.organisationId },
    select: selectionCommande,
  });
  if (!commande) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, commande.centreId);
  return commande;
}

function exigerTransition(de: StatutCommande, vers: StatutCommande): void {
  if (!transitionCommandeAutorisee(de, vers)) {
    throw ErreurSaisie.surChamp('statut', 'Cette action n’est pas possible à ce stade.');
  }
}

function exigerApprobateur(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutApprouverCommande(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

async function prochainNumero(tx: ClientTransaction, organisationId: string): Promise<string> {
  const annee = Number(aujourdhui().slice(0, 4));
  const { dernier } = await tx.compteurCommande.upsert({
    where: { organisationId_annee: { organisationId, annee } },
    create: { organisationId, annee, dernier: 1 },
    update: { dernier: { increment: 1 } },
    select: { dernier: true },
  });
  return `CMD-${String(annee)}-${String(dernier).padStart(6, '0')}`;
}

function clauseListe(acteur: UtilisateurConnecte, perimetre: Perimetre, filtre: FiltreCommandes) {
  verifierPerimetre(acteur, perimetre);
  const centres = centresDuPerimetre(acteur, perimetre);
  return {
    organisationId: acteur.organisationId,
    ...(centres === null ? {} : { centreId: { in: [...centres] } }),
    ...(filtre.statut ? { statut: filtre.statut } : {}),
    ...(filtre.fournisseurId ? { fournisseurId: filtre.fournisseurId } : {}),
  };
}

export async function listerCommandes(
  acteur: UtilisateurConnecte,
  perimetre: Perimetre,
  saisie: unknown,
): Promise<ListeCommandes> {
  const filtre = valider(filtreCommandesSchema, saisie);
  const client = base(acteur);
  const where = clauseListe(acteur, perimetre, filtre);
  const total = await client.commande.count({ where });
  const pagination = calculerPagination(filtre.page, LIGNES_PAR_PAGE, total);
  const lignes = await client.commande.findMany({
    where,
    orderBy: { id: 'desc' },
    skip: pagination.decalage,
    take: LIGNES_PAR_PAGE,
    select: {
      id: true,
      numero: true,
      statut: true,
      createdAt: true,
      centre: { select: { nom: true } },
      fournisseur: { select: { nom: true } },
      lignes: { select: { quantite: true, prixAchatCentimes: true } },
    },
  });
  const voitPrix = peutVoirPrixAchat(acteur.role);
  return {
    lignes: lignes.map((l) => ({
      id: l.id,
      numero: l.numero,
      statut: l.statut,
      createdAt: l.createdAt,
      centre: l.centre.nom,
      fournisseur: l.fournisseur.nom,
      montantCentimes: voitPrix ? montantCommande(l.lignes) : null,
    })),
    pagination,
    filtre,
  };
}

async function nomsPatients(
  acteur: UtilisateurConnecte,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const patients = await base(acteur).patient.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, nomNaissance: true, nomUsage: true, prenoms: true },
  });
  return new Map(patients.map((p) => [p.id, `${p.nomUsage ?? p.nomNaissance} ${p.prenoms}`]));
}

/** Ouvrir une commande nominative, c'est lire un lien avec un patient : une ligne de journal par patient. */
export async function obtenirCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<CommandeDetail> {
  const commande = await base(acteur).commande.findFirst({
    where: { id: commandeId, organisationId: acteur.organisationId },
    select: selectionCommande,
  });
  if (!commande) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, commande.centreId);
  const patientIds = [
    ...new Set(commande.lignes.flatMap((l) => (l.patientId === null ? [] : [l.patientId]))),
  ];
  if (patientIds.length > 0) {
    await withAudit(
      acteur,
      () => Promise.resolve(),
      patientIds.map((patientId) => ({
        action: 'READ',
        entiteType: 'COMMANDE',
        entiteId: commande.id,
        centreId: commande.centreId,
        patientId,
      })),
    );
  }
  const patients = await nomsPatients(acteur, patientIds);
  return {
    id: commande.id,
    numero: commande.numero,
    statut: commande.statut,
    centreId: commande.centreId,
    centre: commande.centre.nom,
    fournisseurId: commande.fournisseurId,
    fournisseur: commande.fournisseur.nom,
    demandeur: commande.demandeur.name,
    approbateur: commande.approbateur?.name ?? null,
    approuveeLe: commande.approuveeLe,
    envoiDirect: commande.regleId !== null,
    motifRefus: commande.motifRefus,
    motifAnnulation: commande.motifAnnulation,
    createdAt: commande.createdAt,
    montantCentimes: peutVoirPrixAchat(acteur.role) ? montantCommande(commande.lignes) : null,
    lignes: commande.lignes.map((l) => versLigneVue(l, acteur, patients)),
  };
}

/** Produits actifs qu'un fournisseur livre : les modèles de son fabricant, les accessoires qui le désignent. */
export async function produitsDuFournisseur(
  acteur: UtilisateurConnecte,
  fournisseurId: string,
): Promise<ProduitCommandable[]> {
  const client = base(acteur);
  const fournisseur = await client.fournisseur.findFirst({
    where: { id: fournisseurId, organisationId: acteur.organisationId },
    select: { fabricantId: true },
  });
  if (!fournisseur) {
    throw new AccesRefuseError();
  }
  const [modeles, accessoires] = await Promise.all([
    fournisseur.fabricantId === null
      ? []
      : client.modeleAideAuditive.findMany({
          where: { fabricantId: fournisseur.fabricantId, actif: true },
          select: { id: true, gamme: true, nom: true },
          orderBy: [{ gamme: 'asc' }, { nom: 'asc' }],
        }),
    client.accessoire.findMany({
      where: { fournisseurId, actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    }),
  ]);
  return [
    ...modeles.map((m) => ({ valeur: `modele:${m.id}`, libelle: `${m.gamme} ${m.nom}` })),
    ...accessoires.map((a) => ({ valeur: `accessoire:${a.id}`, libelle: a.nom })),
  ];
}

export async function creerCommande(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  const { centreId, fournisseurId } = valider(commandeCreationSchema, saisie);
  verifierAccesCentre(acteur, centreId);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      await verifierCentreActif(tx, acteur, centreId, 'centreId');
      const fournisseur = await tx.fournisseur.findFirst({
        where: { id: fournisseurId, organisationId: acteur.organisationId, actif: true },
        select: { id: true },
      });
      if (!fournisseur) {
        throw ErreurSaisie.surChamp('fournisseurId', 'Fournisseur inconnu.');
      }
      return tx.commande.create({
        data: {
          organisationId: acteur.organisationId,
          centreId,
          fournisseurId,
          demandeurId: acteur.id,
          numero: await prochainNumero(tx, acteur.organisationId),
        },
        select: { id: true },
      });
    },
    (creee) => evenement({ id: creee.id, centreId }, { fournisseurId }, 'CREATE'),
  );
  return id;
}

/** Le produit doit être actif et livré par ce fournisseur ; il donne son prix d'achat par défaut. */
async function lirePrixCatalogue(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  fournisseurId: string,
  { modeleId, accessoireId }: Pick<LigneCommandeSaisie, 'modeleId' | 'accessoireId'>,
): Promise<number | null> {
  const fournisseur = await tx.fournisseur.findFirst({
    where: { id: fournisseurId, organisationId: acteur.organisationId },
    select: { fabricantId: true },
  });
  const produit =
    modeleId !== null
      ? await tx.modeleAideAuditive.findFirst({
          where: {
            id: modeleId,
            organisationId: acteur.organisationId,
            actif: true,
            ...(fournisseur?.fabricantId ? { fabricantId: fournisseur.fabricantId } : { id: '' }),
          },
          select: { prixAchatCentimes: true },
        })
      : await tx.accessoire.findFirst({
          where: {
            id: accessoireId ?? '',
            organisationId: acteur.organisationId,
            actif: true,
            fournisseurId,
          },
          select: { prixAchatCentimes: true },
        });
  if (!produit) {
    throw ErreurSaisie.surChamp('produit', 'Ce fournisseur ne livre pas ce produit.');
  }
  return produit.prixAchatCentimes;
}

export async function ajouterLigne(
  acteur: UtilisateurConnecte,
  commandeId: string,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(ligneCommandeSaisieSchema, saisie);
  if (donnees.prixAchatCentimes !== null && !peutVoirPrixAchat(acteur.role)) {
    throw new AccesRefuseError();
  }
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (!commandeModifiable(commande.statut)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande ne se modifie plus.');
      }
      const prixCatalogue = await lirePrixCatalogue(tx, acteur, commande.fournisseurId, donnees);
      if (donnees.patientId !== null) {
        await verifierPatient(tx, acteur, donnees.patientId);
      }
      await tx.commandeLigne.create({
        data: {
          organisationId: acteur.organisationId,
          commandeId,
          modeleId: donnees.modeleId,
          accessoireId: donnees.accessoireId,
          quantite: donnees.quantite,
          prixAchatCentimes: donnees.prixAchatCentimes ?? prixCatalogue,
          enConsignation: donnees.enConsignation,
          patientId: donnees.patientId,
          referencePatient:
            donnees.patientId === null
              ? null
              : referencePatientDepuis(randomBytes(OCTETS_REFERENCE_PATIENT)),
          oreille: donnees.oreille,
        },
      });
      return commande;
    },
    (commande) => ({
      ...evenement(commande, { ligneAjoutee: true, quantite: donnees.quantite }),
      patientId: donnees.patientId,
    }),
  );
}

export async function retirerLigne(
  acteur: UtilisateurConnecte,
  commandeId: string,
  ligneId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (!commandeModifiable(commande.statut)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande ne se modifie plus.');
      }
      const ligne = commande.lignes.find((l) => l.id === ligneId);
      if (!ligne) {
        throw new AccesRefuseError();
      }
      await tx.commandeLigne.delete({ where: { id: ligneId } });
      return { commande, patientId: ligne.patientId };
    },
    ({ commande, patientId }) => ({
      ...evenement(commande, { ligneRetiree: true }),
      patientId,
    }),
  );
}

/** Le prix se complète ou se corrige jusqu'à l'approbation, par un rôle qui voit les prix. */
export async function fixerPrixLigne(
  acteur: UtilisateurConnecte,
  commandeId: string,
  ligneId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutVoirPrixAchat(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { prixAchatCentimes } = valider(prixLigneSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (!prixCommandeModifiable(commande.statut)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande ne se modifie plus.');
      }
      if (!commande.lignes.some((l) => l.id === ligneId)) {
        throw new AccesRefuseError();
      }
      await tx.commandeLigne.update({ where: { id: ligneId }, data: { prixAchatCentimes } });
      return commande;
    },
    (commande) => evenement(commande, { prixModifie: true, ligneId }),
  );
}

/** Applique les règles. Rend le statut obtenu : `APPROUVEE` si la commande part sans approbation. */
export async function soumettreCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<StatutCommande> {
  return withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (commande.statut !== 'BROUILLON') {
        throw ErreurSaisie.surChamp('statut', 'Cette commande est déjà soumise.');
      }
      if (commande.lignes.length === 0) {
        throw ErreurSaisie.surChamp('lignes', 'Ajouter au moins une ligne.');
      }
      if (!commande.fournisseur.actif) {
        throw ErreurSaisie.surChamp('fournisseurId', 'Ce fournisseur est archivé.');
      }
      const regles = await tx.regleCommande.findMany({
        where: { organisationId: acteur.organisationId, actif: true },
        select: {
          id: true,
          priorite: true,
          montantMaxCentimes: true,
          typeProduit: true,
          fournisseurId: true,
          centreId: true,
          decision: true,
        },
      });
      const { decision, regleId } = deciderApprobation(regles, {
        montantCentimes: montantCommande(commande.lignes),
        typesProduit: commande.lignes.map(typeDeLigne),
        fournisseurId: commande.fournisseurId,
        centreId: commande.centreId,
      });
      const direct = decision === 'ENVOI_DIRECT';
      const statut: StatutCommande = direct ? 'APPROUVEE' : 'A_APPROUVER';
      await tx.commande.update({
        where: { id: commandeId },
        data: {
          statut,
          regleId: direct ? regleId : null,
          approuveeLe: direct ? new Date(horloge.now()) : null,
          motifRefus: null,
        },
      });
      return { commande, statut, regleId };
    },
    ({ commande, statut, regleId }) => evenement(commande, { soumise: true, statut, regleId }),
  ).then(({ statut }) => statut);
}

export async function approuverCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      exigerApprobateur(acteur, commande.centreId);
      if (commande.statut !== 'A_APPROUVER') {
        throw ErreurSaisie.surChamp('statut', 'Cette commande n’attend pas d’approbation.');
      }
      await tx.commande.update({
        where: { id: commandeId },
        data: {
          statut: 'APPROUVEE',
          approbateurId: acteur.id,
          approuveeLe: new Date(horloge.now()),
        },
      });
      return commande;
    },
    (commande) => evenement(commande, { approuvee: true }),
  );
}

/** Rend la demande en brouillon, avec le motif : son auteur peut la corriger. */
export async function refuserCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
  saisie: unknown,
): Promise<void> {
  const { motif } = valider(motifCommandeSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      exigerApprobateur(acteur, commande.centreId);
      if (commande.statut !== 'A_APPROUVER') {
        throw ErreurSaisie.surChamp('statut', 'Cette commande n’attend pas d’approbation.');
      }
      await tx.commande.update({
        where: { id: commandeId },
        data: { statut: 'BROUILLON', motifRefus: motif },
      });
      return commande;
    },
    (commande) => evenement(commande, { refusee: true }),
  );
}

/** Le demandeur abandonne sa demande ; au-delà du brouillon, l'annulation revient à la gestion. */
export async function annulerCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
  saisie: unknown,
): Promise<void> {
  const { motif } = valider(motifCommandeSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      if (commande.statut !== 'BROUILLON') {
        exigerApprobateur(acteur, commande.centreId);
      }
      if (!commandeAnnulable(commande.statut, commande.lignes)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande ne s’annule plus.');
      }
      await tx.commande.update({
        where: { id: commandeId },
        data: { statut: 'ANNULEE', motifAnnulation: motif },
      });
      return commande;
    },
    (commande) => evenement(commande, { annulee: true }),
  );
}

/** Aligne le statut sur les quantités. À appeler après toute réception ou facture, sous le verrou. */
export async function appliquerStatut(
  tx: ClientTransaction,
  commandeId: string,
  statut: StatutCommande,
  lignes: Parameters<typeof statutSelonQuantites>[1],
): Promise<StatutCommande> {
  const suivant = statutSelonQuantites(statut, lignes);
  if (suivant !== statut) {
    await tx.commande.update({ where: { id: commandeId }, data: { statut: suivant } });
  }
  return suivant;
}

export async function cloturerCommande(
  acteur: UtilisateurConnecte,
  commandeId: string,
): Promise<void> {
  await withAudit(
    acteur,
    async (tx) => {
      const commande = await verrouillerCommande(tx, acteur, commandeId);
      exigerApprobateur(acteur, commande.centreId);
      if (!commandeCloturable(commande.statut, commande.lignes, 0)) {
        throw ErreurSaisie.surChamp('statut', 'Cette commande ne peut pas encore être close.');
      }
      exigerTransition(commande.statut, 'CLOSE');
      await tx.commande.update({ where: { id: commandeId }, data: { statut: 'CLOSE' } });
      return commande;
    },
    (commande) => evenement(commande, { close: true }),
  );
}
