import { randomUUID } from 'node:crypto';

import { prisma, type Prisma } from '@ha/db';
import {
  abandonDossierSaisieSchema,
  CODES_CONTROLE,
  controlePrescription,
  dossierSaisieSchema,
  extensionDocument,
  MESSAGE_TRANSITION_DOSSIER_REFUSEE,
  OREILLES,
  oreillesConcernees,
  oreillesDuDossier,
  peutAbandonnerDossier,
  peutAccederAuCentre,
  peutForcerPrescription,
  prescriptionModifiable,
  prescriptionSaisieSchema,
  transitionDossierAutorisee,
  TYPES_DOCUMENT,
  verifierDocument,
  type Constat,
  type OreillesDossier,
  type PrescriptionSaisie,
  type ResultatControlePrescription,
  type RefusRenouvellement,
  type SpecialitePrescripteur,
  type StatutDossier,
  type TypeAppareillage,
  type TypeDocument,
} from '@ha/domain';
import { z } from 'zod';

import {
  AccesRefuseError,
  centresSelectionnables,
  verifierAccesCentre,
  type CentreSelectionnable,
  type UtilisateurConnecte,
} from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { documents } from '../documents';
import { ErreurSaisie, valider, type ErreursChamps } from '../erreurs';
import { aujourdhui, lireFiche, type Client, type PatientDetail } from './patients';

function versDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Le dossier a changé depuis que l'utilisateur l'a vu, ou une opération concurrente est passée avant. */
export class ErreurConflitDossier extends ErreurSaisie {
  constructor() {
    super({}, 'Ce dossier vient d’être modifié par ailleurs : rechargez la page et recommencez.');
    this.name = 'ErreurConflitDossier';
  }
}

/** Une prescription s'arrête sur une erreur bloquante : rien n'est écrit, ni en base ni au stockage. */
export class ErreurPrescriptionBloquee extends ErreurSaisie {
  constructor(
    readonly controle: ResultatControlePrescription,
    readonly forcable: boolean,
    erreurs: ErreursChamps = {},
  ) {
    super(erreurs, 'La prescription n’a pas été enregistrée.');
    this.name = 'ErreurPrescriptionBloquee';
  }
}

// --- Écriture : chemin unique d'un changement de statut ------------------------------------------

const selectionDossier = {
  id: true,
  organisationId: true,
  patientId: true,
  centreId: true,
  statut: true,
  typeDroite: true,
  typeGauche: true,
} as const;

type DossierLu = Prisma.DossierGetPayload<{ select: typeof selectionDossier }>;

/** Lit le dossier et vérifie le droit sur son centre. */
async function lireDossier(
  client: Client,
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<DossierLu> {
  const dossier = await client.dossier.findFirst({
    where: { id: dossierId, organisationId: acteur.organisationId },
    select: selectionDossier,
  });
  if (!dossier) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, dossier.centreId);
  return dossier;
}

/**
 * Seule écriture de `statut` : met à jour le dossier si son statut n'a pas bougé depuis sa lecture et
 * ajoute la transition dans la même transaction. Sur un conflit, le perdant attend le verrou de la ligne,
 * le `where` est réévalué et aucune ligne ne correspond : tout est annulé.
 * Les étapes 9 à 11 l'appellent une fois leurs propres conditions vérifiées (devis, essai, facture).
 */
export async function appliquerTransition(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  dossier: Pick<DossierLu, 'id' | 'statut'>,
  vers: StatutDossier,
  motif: string | null = null,
): Promise<void> {
  if (!transitionDossierAutorisee(dossier.statut, vers)) {
    throw ErreurSaisie.surChamp('statut', MESSAGE_TRANSITION_DOSSIER_REFUSEE);
  }
  const { count } = await tx.dossier.updateMany({
    where: { id: dossier.id, statut: dossier.statut },
    data: { statut: vers },
  });
  if (count !== 1) {
    throw new ErreurConflitDossier();
  }
  await tx.transitionDossier.create({
    data: {
      dossierId: dossier.id,
      statutAvant: dossier.statut,
      statutApres: vers,
      utilisateurId: acteur.id,
      motif,
    },
  });
}

/** Le motif n'entre jamais dans le journal : texte libre, chiffré dans la transition. */
function evenementTransition(dossier: DossierLu, vers: StatutDossier): EvenementAudit {
  return {
    action: 'UPDATE',
    entiteType: 'DOSSIER',
    entiteId: dossier.id,
    patientId: dossier.patientId,
    centreId: dossier.centreId,
    details: { statutAvant: dossier.statut, statutApres: vers },
  };
}

// --- Création ------------------------------------------------------------------------------------

export interface ChoixCentreDossier extends CentreSelectionnable {
  praticiens: { id: string; nom: string }[];
}

export interface DonneesCreationDossier {
  centres: ChoixCentreDossier[];
  centreParDefaut: string | null;
  praticienParDefaut: string | null;
}

/** Centres accessibles et audioprothésistes qui y exercent, pour le formulaire de création. */
export async function donneesCreationDossier(
  acteur: UtilisateurConnecte,
  fiche: Pick<PatientDetail, 'centre'>,
): Promise<DonneesCreationDossier> {
  const centres = await centresSelectionnables(acteur);
  const exercices = await prisma().praticienCentre.findMany({
    where: {
      centreId: { in: centres.map((c) => c.id) },
      praticien: { utilisateur: { actif: true, organisationId: acteur.organisationId } },
    },
    select: {
      centreId: true,
      praticien: {
        select: {
          id: true,
          utilisateurId: true,
          utilisateur: { select: { prenom: true, nom: true } },
        },
      },
    },
    orderBy: { praticien: { utilisateur: { nom: 'asc' } } },
  });
  return {
    centres: centres.map((centre) => ({
      ...centre,
      praticiens: exercices
        .filter((e) => e.centreId === centre.id)
        .map(({ praticien: { id, utilisateur } }) => ({
          id,
          nom: `${utilisateur.prenom} ${utilisateur.nom}`,
        })),
    })),
    centreParDefaut: centres.some((c) => c.id === fiche.centre.id) ? fiche.centre.id : null,
    praticienParDefaut:
      exercices.find((e) => e.praticien.utilisateurId === acteur.id)?.praticien.id ?? null,
  };
}

export async function creerDossier(
  acteur: UtilisateurConnecte,
  patientId: string,
  saisie: unknown,
): Promise<string> {
  const donnees = valider(dossierSaisieSchema, saisie);
  return withAudit(
    acteur,
    async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, organisationId: acteur.organisationId, fusionneDansId: null },
        select: { centreId: true },
      });
      if (!patient || !peutAccederAuCentre(acteur, patient.centreId)) {
        throw new AccesRefuseError();
      }
      verifierAccesCentre(acteur, donnees.centreId);
      const centre = await tx.centre.findFirst({
        where: { id: donnees.centreId, organisationId: acteur.organisationId, actif: true },
        select: { id: true },
      });
      if (!centre) {
        throw ErreurSaisie.surChamp('centreId', 'Centre inconnu ou fermé.');
      }
      const praticien = await tx.praticien.findFirst({
        where: {
          id: donnees.praticienId,
          utilisateur: { actif: true, organisationId: acteur.organisationId },
          centres: { some: { centreId: donnees.centreId } },
        },
        select: { id: true },
      });
      if (!praticien) {
        throw ErreurSaisie.surChamp(
          'praticienId',
          'Cet audioprothésiste n’exerce pas dans ce centre.',
        );
      }
      const dossier = await tx.dossier.create({
        data: {
          organisationId: acteur.organisationId,
          patientId,
          centreId: donnees.centreId,
          praticienId: donnees.praticienId,
          oreilles: donnees.oreilles,
          typeDroite: donnees.typeDroite,
          typeGauche: donnees.typeGauche,
          dateOuverture: versDate(aujourdhui()),
          surdicecite: donnees.surdicecite ? 'OUI' : 'NON',
        },
        select: { id: true },
      });
      await tx.transitionDossier.create({
        data: { dossierId: dossier.id, statutApres: 'BROUILLON', utilisateurId: acteur.id },
      });
      return dossier.id;
    },
    (id) => ({
      action: 'CREATE',
      entiteType: 'DOSSIER',
      entiteId: id,
      patientId,
      centreId: donnees.centreId,
    }),
  );
}

// --- Lecture -------------------------------------------------------------------------------------

export interface DossierResume {
  id: string;
  statut: StatutDossier;
  oreilles: OreillesDossier;
  typeDroite: TypeAppareillage | null;
  typeGauche: TypeAppareillage | null;
  dateOuverture: string;
  centre: string;
  praticien: string;
}

const selectionResume = {
  id: true,
  statut: true,
  oreilles: true,
  typeDroite: true,
  typeGauche: true,
  dateOuverture: true,
  centre: { select: { nom: true } },
  praticien: { select: { utilisateur: { select: { prenom: true, nom: true } } } },
} as const;

type ResumeLu = Prisma.DossierGetPayload<{ select: typeof selectionResume }>;

function versResume({ centre, praticien, dateOuverture, ...reste }: ResumeLu): DossierResume {
  return {
    ...reste,
    dateOuverture: depuisDate(dateOuverture),
    centre: centre.nom,
    praticien: `${praticien.utilisateur.prenom} ${praticien.utilisateur.nom}`,
  };
}

/** Dossiers du patient dans les centres de l'utilisateur. Une liste n'ouvre aucun dossier : pas de READ. */
export async function listerDossiersDuPatient(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<DossierResume[]> {
  const dossiers = await base().dossier.findMany({
    where: {
      patientId,
      organisationId: acteur.organisationId,
      ...(acteur.role === 'ADMIN' ? {} : { centreId: { in: [...acteur.centreIds] } }),
    },
    select: selectionResume,
    orderBy: [{ dateOuverture: 'desc' }, { id: 'desc' }],
  });
  return dossiers.map(versResume);
}

const constatSchema = z.object({
  code: z.enum(CODES_CONTROLE),
  oreille: z.enum(OREILLES).nullable(),
});

const controlesEnregistresSchema = z.object({
  erreursForcees: z.array(constatSchema),
  avertissements: z.array(constatSchema),
  refusRenouvellement: z.array(
    z.object({ oreille: z.enum(OREILLES), dateEligibilite: z.iso.date().nullable() }),
  ),
});

export interface ControlesEnregistres {
  erreursForcees: readonly Constat[];
  avertissements: readonly Constat[];
  refusRenouvellement: readonly RefusRenouvellement[];
}

export interface PrescriptionAffichee {
  id: string;
  prescripteur: string;
  specialite: SpecialitePrescripteur;
  datePrescription: string;
  oreilles: OreillesDossier;
  mentionRenouvellement: boolean;
  scanTaille: number;
  controles: ControlesEnregistres;
  forceePar: string | null;
  motifForcage: string | null;
  saisieLe: string;
  saisiePar: string;
}

export interface PassageAffiche {
  statut: StatutDossier;
  horodatage: string;
  motif: string | null;
}

export interface DossierDetail extends DossierResume {
  patientId: string;
  centreId: string;
  surdicecite: boolean;
  fiche: PatientDetail;
  passages: PassageAffiche[];
  /** La plus récente d'abord : c'est elle qui fait foi. */
  prescriptions: PrescriptionAffichee[];
  prescriptionModifiable: boolean;
  abandonnable: boolean;
  forcage: boolean;
}

function nomComplet({ prenom, nom }: { prenom: string; nom: string }): string {
  return `${prenom} ${nom}`;
}

/**
 * Ouvre un dossier : une ligne READ dans le journal. Tout est lu sur le client et non sur la connexion
 * de la transaction de `withAudit` : Prisma charge les relations en parallèle (voir ADR-010).
 */
export async function obtenirDossier(
  acteur: UtilisateurConnecte,
  dossierId: string,
): Promise<DossierDetail> {
  const client = base();
  const dossierLu = await lireDossier(client, acteur, dossierId);
  const [resume, chiffre, transitions, prescriptions, fiche] = await Promise.all([
    client.dossier.findUniqueOrThrow({ where: { id: dossierId }, select: selectionResume }),
    client.dossier.findUniqueOrThrow({
      where: { id: dossierId },
      select: { surdicecite: true },
    }),
    client.transitionDossier.findMany({
      where: { dossierId },
      orderBy: [{ horodatage: 'asc' }, { id: 'asc' }],
    }),
    client.prescription.findMany({
      where: { dossierId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        prescripteur: { select: { prenom: true, nom: true, specialite: true } },
        forceePar: { select: { prenom: true, nom: true } },
        createdBy: { select: { prenom: true, nom: true } },
      },
    }),
    // L'accès vient du centre du dossier : la fiche peut être rattachée à un autre centre.
    lireFiche(client, acteur, dossierLu.patientId, { accesVerifie: true }),
  ]);
  const detail: DossierDetail = {
    ...versResume(resume),
    patientId: dossierLu.patientId,
    centreId: dossierLu.centreId,
    surdicecite: chiffre.surdicecite === 'OUI',
    fiche,
    passages: transitions.map((t) => ({
      statut: t.statutApres,
      horodatage: t.horodatage.toISOString(),
      motif: t.motif,
    })),
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      prescripteur: nomComplet(p.prescripteur),
      specialite: p.prescripteur.specialite,
      datePrescription: depuisDate(p.datePrescription),
      oreilles: p.oreilles,
      mentionRenouvellement: p.mentionRenouvellement,
      scanTaille: p.scanTaille,
      controles: controlesEnregistresSchema.parse(p.controles),
      forceePar: p.forceePar && nomComplet(p.forceePar),
      motifForcage: p.motifForcage,
      saisieLe: p.createdAt.toISOString(),
      saisiePar: nomComplet(p.createdBy),
    })),
    prescriptionModifiable: prescriptionModifiable(dossierLu.statut),
    abandonnable:
      transitionDossierAutorisee(dossierLu.statut, 'ABANDONNE') &&
      peutAbandonnerDossier(acteur.role),
    forcage: peutForcerPrescription(acteur.role),
  };
  await withAudit(acteur, async () => undefined, {
    action: 'READ',
    entiteType: 'DOSSIER',
    entiteId: dossierId,
    patientId: dossierLu.patientId,
    centreId: dossierLu.centreId,
  });
  return detail;
}

export interface ScanPrescription {
  contenu: Uint8Array;
  type: TypeDocument;
  nomFichier: string;
}

/** Ouvre le scan d'une ordonnance : une ligne READ, le nom d'origine n'étant pas conservé. */
export async function lireScan(
  acteur: UtilisateurConnecte,
  dossierId: string,
  prescriptionId: string,
): Promise<ScanPrescription> {
  const { scanCle, scanType } = await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      const prescription = await tx.prescription.findFirst({
        where: { id: prescriptionId, dossierId },
        select: { scanCle: true, scanType: true },
      });
      if (!prescription) {
        throw new AccesRefuseError();
      }
      return { ...prescription, dossier };
    },
    ({ dossier }) => ({
      action: 'READ',
      entiteType: 'PRESCRIPTION',
      entiteId: prescriptionId,
      patientId: dossier.patientId,
      centreId: dossier.centreId,
      details: { document: 'SCAN_ORDONNANCE', dossierId },
    }),
  );
  const type = z.enum(TYPES_DOCUMENT).parse(scanType);
  return {
    contenu: await documents().get(scanCle),
    type,
    nomFichier: `ordonnance.${extensionDocument(type)}`,
  };
}

// --- Prescription --------------------------------------------------------------------------------

interface PrescriptionPreparee {
  readonly controle: ResultatControlePrescription;
  readonly forcee: boolean;
}

function verifierStatutPrescription(dossier: DossierLu, statutAttendu: StatutDossier): void {
  if (dossier.statut !== statutAttendu) {
    throw new ErreurConflitDossier();
  }
  if (!prescriptionModifiable(dossier.statut)) {
    throw new ErreurSaisie({}, 'La prescription ne se modifie plus après l’émission du devis.');
  }
}

/** Contrôle la prescription avant tout dépôt du scan. L'historique couvre tous les centres. */
async function preparerPrescription(
  acteur: UtilisateurConnecte,
  dossierId: string,
  donnees: PrescriptionSaisie,
  jour: string,
): Promise<PrescriptionPreparee> {
  const client = base();
  const dossier = await lireDossier(client, acteur, dossierId);
  verifierStatutPrescription(dossier, donnees.statutAttendu);
  const [prescripteur, patient, delivrances] = await Promise.all([
    client.prescripteur.findFirst({
      where: { id: donnees.prescripteurId, organisationId: acteur.organisationId, actif: true },
      select: { specialite: true, formationOtologie: true, rpps: true },
    }),
    client.patient.findUniqueOrThrow({
      where: { id: dossier.patientId },
      select: { dateNaissance: true },
    }),
    client.delivrance.findMany({
      where: { patientId: dossier.patientId, organisationId: acteur.organisationId },
      select: { oreille: true, dateDelivrance: true },
    }),
  ]);
  if (!prescripteur) {
    throw ErreurSaisie.surChamp('prescripteurId', 'Prescripteur inconnu ou désactivé.');
  }
  const controle = controlePrescription({
    dateNaissance: depuisDate(patient.dateNaissance),
    dateDuJour: jour,
    oreilles: oreillesDuDossier(dossier),
    oreillesPrescrites: oreillesConcernees(donnees.oreilles),
    prescripteur,
    datePrescription: donnees.datePrescription,
    historiqueDelivrances: delivrances.map((d) => ({
      oreille: d.oreille,
      dateDelivrance: depuisDate(d.dateDelivrance),
    })),
  });
  const forcable = peutForcerPrescription(acteur.role);
  if (controle.erreurs.length === 0) {
    return { controle, forcee: false };
  }
  if (!donnees.forcer) {
    throw new ErreurPrescriptionBloquee(controle, forcable);
  }
  if (!forcable) {
    throw new AccesRefuseError();
  }
  if (donnees.motifForcage === null) {
    throw new ErreurPrescriptionBloquee(controle, forcable, {
      motifForcage: ['Le motif est obligatoire pour forcer.'],
    });
  }
  return { controle, forcee: true };
}

/**
 * Enregistre une version de la prescription avec son scan. La première fait passer le dossier en
 * PRESCRIPTION_OK. Le scan est déposé hors transaction : une transaction ne reste pas ouverte pendant
 * un envoi réseau. Si elle échoue ensuite, l'objet déposé est retiré.
 * Le motif d'un forçage reste chiffré sur la prescription : le journal ne garde que le fait et les codes.
 */
export async function enregistrerPrescription(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
  scan: Uint8Array,
): Promise<void> {
  const donnees = valider(prescriptionSaisieSchema, saisie);
  const document = verifierDocument(scan);
  if (!document.valide) {
    throw ErreurSaisie.surChamp('scan', document.message);
  }
  const jour = aujourdhui();
  if (donnees.datePrescription > jour) {
    throw ErreurSaisie.surChamp(
      'datePrescription',
      'La date de prescription ne peut pas être future.',
    );
  }
  const { controle, forcee } = await preparerPrescription(acteur, dossierId, donnees, jour);
  const scanCle = `prescriptions/${randomUUID()}`;
  await documents().put(scanCle, scan, document.type);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const dossier = await lireDossier(tx, acteur, dossierId);
        verifierStatutPrescription(dossier, donnees.statutAttendu);
        const controles: ControlesEnregistres = {
          erreursForcees: forcee ? controle.erreurs : [],
          avertissements: controle.avertissements,
          refusRenouvellement: forcee ? controle.refusRenouvellement : [],
        };
        const prescription = await tx.prescription.create({
          data: {
            dossierId,
            prescripteurId: donnees.prescripteurId,
            datePrescription: versDate(donnees.datePrescription),
            oreilles: donnees.oreilles,
            mentionRenouvellement: donnees.mentionRenouvellement,
            scanCle,
            scanType: document.type,
            scanTaille: scan.length,
            controles: controlesEnregistresSchema.parse(controles),
            forceeParId: forcee ? acteur.id : null,
            motifForcage: forcee ? donnees.motifForcage : null,
            createdById: acteur.id,
          },
          select: { id: true },
        });
        if (dossier.statut === 'BROUILLON') {
          await appliquerTransition(tx, acteur, dossier, 'PRESCRIPTION_OK');
        } else {
          // Prend le verrou de la ligne : un devis émis en même temps ne croise pas cette version.
          const { count } = await tx.dossier.updateMany({
            where: { id: dossierId, statut: dossier.statut },
            data: { updatedAt: new Date() },
          });
          if (count !== 1) {
            throw new ErreurConflitDossier();
          }
        }
        return { dossier, prescriptionId: prescription.id };
      },
      ({ dossier, prescriptionId }): EvenementAudit[] => [
        {
          action: 'CREATE',
          entiteType: 'PRESCRIPTION',
          entiteId: prescriptionId,
          patientId: dossier.patientId,
          centreId: dossier.centreId,
          details: {
            dossierId,
            forcage: forcee,
            codesForces: forcee ? controle.erreurs.map((e) => e.code) : [],
            avertissements: controle.avertissements.map((a) => a.code),
          },
        },
        ...(dossier.statut === 'BROUILLON'
          ? [evenementTransition(dossier, 'PRESCRIPTION_OK')]
          : []),
      ],
    );
  } catch (erreur) {
    await documents()
      .delete(scanCle)
      .catch(() => undefined);
    throw erreur;
  }
}

// --- Abandon -------------------------------------------------------------------------------------

export async function abandonnerDossier(
  acteur: UtilisateurConnecte,
  dossierId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutAbandonnerDossier(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { statutAttendu, motif } = valider(abandonDossierSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const dossier = await lireDossier(tx, acteur, dossierId);
      if (dossier.statut !== statutAttendu) {
        throw new ErreurConflitDossier();
      }
      await appliquerTransition(tx, acteur, dossier, 'ABANDONNE', motif);
      return dossier;
    },
    (dossier) => evenementTransition(dossier, 'ABANDONNE'),
  );
}
