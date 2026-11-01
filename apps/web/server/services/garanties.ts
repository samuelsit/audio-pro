import {
  assuranceSaisieSchema,
  finGarantie,
  PARAMETRES_SAV_DEFAUT,
  parametresSavSaisieSchema,
  periodeEnCours,
  peutParametrerSav,
  peutSuivreSav,
  type ParametresSav,
  type StatutAppareil,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { versDate } from './dossiers';
import { aujourdhui } from './patients';
import { lireAppareil } from './stock';

function depuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// --- Paramètres ---------------------------------------------------------------------------------

export async function parametresSav(
  client: Pick<ClientTransaction, 'parametresSav'>,
  organisationId: string,
): Promise<ParametresSav> {
  const ligne = await client.parametresSav.findUnique({
    where: { organisationId },
    select: { dureeGarantieMois: true, suiviMois: true, suiviParAn: true, pretDureeJours: true },
  });
  return ligne ?? PARAMETRES_SAV_DEFAUT;
}

export function lireParametresSav(acteur: UtilisateurConnecte): Promise<ParametresSav> {
  return parametresSav(base(acteur), acteur.organisationId);
}

export async function enregistrerParametresSav(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  if (!peutParametrerSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const donnees = valider(parametresSavSaisieSchema, saisie);
  await withAudit(
    acteur,
    (tx) =>
      tx.parametresSav.upsert({
        where: { organisationId: acteur.organisationId },
        create: { ...donnees, organisationId: acteur.organisationId },
        update: donnees,
      }),
    {
      action: 'UPDATE',
      entiteType: 'PARAMETRES_SAV',
      entiteId: acteur.organisationId,
      details: { ...donnees },
    },
  );
}

// --- Garantie -----------------------------------------------------------------------------------

/** La garantie naît avec la vente, dans sa transaction. La durée en vigueur ce jour-là reste acquise. */
export async function creerGarantie(
  tx: ClientTransaction,
  { appareilId, patientId, jour }: { appareilId: string; patientId: string; jour: string },
  organisationId: string,
): Promise<void> {
  const { dureeGarantieMois } = await parametresSav(tx, organisationId);
  await tx.garantieAppareil.create({
    data: {
      organisationId,
      appareilId,
      patientId,
      dateDebut: versDate(jour),
      dateFin: versDate(finGarantie(jour, dureeGarantieMois)),
    },
  });
}

/** Après un échange, le remplaçant reprend la fin d'origine et l'assurance (ADR-032). À VÉRIFIER (R52). */
export async function reprendreGarantie(
  tx: ClientTransaction,
  { ancienId, nouveauId, patientId }: { ancienId: string; nouveauId: string; patientId: string },
): Promise<void> {
  const origine = await tx.garantieAppareil.findUnique({ where: { appareilId: ancienId } });
  if (!origine) {
    return;
  }
  await tx.garantieAppareil.create({
    data: {
      organisationId: origine.organisationId,
      appareilId: nouveauId,
      patientId,
      dateDebut: origine.dateDebut,
      dateFin: origine.dateFin,
      origineId: origine.id,
      assureur: origine.assureur,
      contrat: origine.contrat,
      assuranceFin: origine.assuranceFin,
    },
  });
}

export interface GarantieAffichee {
  dateDebut: string;
  dateFin: string;
  enCours: boolean;
  reprise: boolean;
  assureur: string | null;
  contrat: string | null;
  assuranceFin: string | null;
  assuranceEnCours: boolean;
}

const selectionGarantie = {
  dateDebut: true,
  dateFin: true,
  origineId: true,
  assureur: true,
  contrat: true,
  assuranceFin: true,
} as const;

function versAffichage(
  ligne: {
    dateDebut: Date;
    dateFin: Date;
    origineId: string | null;
    assureur: string | null;
    contrat: string | null;
    assuranceFin: Date | null;
  },
  jour: string,
): GarantieAffichee {
  const dateFin = depuisDate(ligne.dateFin);
  const assuranceFin = ligne.assuranceFin && depuisDate(ligne.assuranceFin);
  return {
    dateDebut: depuisDate(ligne.dateDebut),
    dateFin,
    enCours: periodeEnCours(dateFin, jour),
    reprise: ligne.origineId !== null,
    assureur: ligne.assureur,
    contrat: ligne.contrat,
    assuranceFin,
    assuranceEnCours: periodeEnCours(assuranceFin, jour),
  };
}

export async function garantieDeLAppareil(
  client: Pick<ClientTransaction, 'garantieAppareil'>,
  appareilId: string,
): Promise<GarantieAffichee | null> {
  const ligne = await client.garantieAppareil.findUnique({
    where: { appareilId },
    select: selectionGarantie,
  });
  return ligne && versAffichage(ligne, aujourdhui());
}

export async function enregistrerAssurance(
  acteur: UtilisateurConnecte,
  appareilId: string,
  saisie: unknown,
): Promise<void> {
  if (!peutSuivreSav(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { assuranceFin, ...reste } = valider(assuranceSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const appareil = await lireAppareil(tx, acteur, appareilId);
      const garantie = await tx.garantieAppareil.findUnique({
        where: { appareilId },
        select: { id: true, patientId: true },
      });
      if (!garantie) {
        throw new ErreurSaisie({}, 'Cet appareil n’a pas de garantie : il n’a pas été vendu.');
      }
      await tx.garantieAppareil.update({
        where: { id: garantie.id },
        data: { ...reste, assuranceFin: assuranceFin === null ? null : versDate(assuranceFin) },
      });
      return { garantie, centreId: appareil.centreId };
    },
    ({ garantie, centreId }) => ({
      action: 'UPDATE',
      entiteType: 'GARANTIE_APPAREIL',
      entiteId: garantie.id,
      patientId: garantie.patientId,
      centreId,
      details: { assurance: reste.assureur !== null },
    }),
  );
}

/** Patient de la page demandée : hors périmètre, l'accès est refusé, comme toute ressource d'un autre client. */
export async function exigerPatient(
  client: Pick<ClientTransaction, 'patient'>,
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<void> {
  const patient = await client.patient.findFirst({
    where: { id: patientId, organisationId: acteur.organisationId },
    select: { centreId: true },
  });
  if (!patient) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, patient.centreId);
}

export interface AppareilDuPatient {
  id: string;
  numeroSerie: string;
  designation: string;
  statut: StatutAppareil;
  garantie: GarantieAffichee;
}

/** Appareils vendus au patient, pour sa fiche : `obtenirPatient` journalise déjà la lecture. */
export async function appareilsDuPatient(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<AppareilDuPatient[]> {
  const client = base(acteur);
  await exigerPatient(client, acteur, patientId);
  const lignes = await client.garantieAppareil.findMany({
    where: { organisationId: acteur.organisationId, patientId, appareil: { patientId } },
    select: {
      ...selectionGarantie,
      appareil: {
        select: {
          id: true,
          numeroSerie: true,
          statut: true,
          modele: { select: { gamme: true, nom: true } },
          fabricant: { select: { nom: true } },
        },
      },
    },
    orderBy: { dateFin: 'desc' },
  });
  const jour = aujourdhui();
  return lignes.map(({ appareil, ...garantie }) => ({
    id: appareil.id,
    numeroSerie: appareil.numeroSerie,
    designation: `${appareil.fabricant.nom} ${appareil.modele.gamme} ${appareil.modele.nom}`,
    statut: appareil.statut,
    garantie: versAffichage(garantie, jour),
  }));
}
