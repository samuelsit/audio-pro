import { prisma } from '@ha/db/admin';

import type { UtilisateurConnecte } from '@/server/auth/acces';
import {
  ajouterLigneBrouillon,
  creerVenteDirecte,
  validerFacture,
} from '@/server/services/facturation';

import type { JeuDeDonnees } from './donnees';

/** Ouvre une vente directe de deux boîtes de piles, sans la valider. */
export async function venteDirecte(
  d: JeuDeDonnees,
  acteur: UtilisateurConnecte,
  patientId: string,
  accessoireId: string,
  prescriptionId: string | null = null,
  centreId: string = d.centres.a.id,
): Promise<string> {
  const factureId = await creerVenteDirecte(acteur, { patientId, centreId, prescriptionId });
  await ajouterLigneBrouillon(acteur, factureId, {
    nature: 'PILE',
    accessoireId,
    libelle: 'Piles 312',
    quantite: '2',
    prixUnitaire: '3,00',
  });
  return factureId;
}

export async function venteDirecteValidee(
  d: JeuDeDonnees,
  acteur: UtilisateurConnecte,
  patientId: string,
  accessoireId: string,
  prescriptionId: string | null = null,
): Promise<string> {
  const factureId = await venteDirecte(d, acteur, patientId, accessoireId, prescriptionId);
  await validerFacture(acteur, factureId);
  return factureId;
}

/** Stock fictif d'un article dans un centre, remplacé s'il existe. */
export async function approvisionner(
  centreId: string,
  accessoireId: string,
  quantite: number,
): Promise<void> {
  await prisma().stockAccessoire.upsert({
    where: { centreId_accessoireId: { centreId, accessoireId } },
    create: { centreId, accessoireId, quantite },
    update: { quantite },
  });
}
