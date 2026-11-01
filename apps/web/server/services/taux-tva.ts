import { clientPlateforme } from '@ha/db';
import { tauxTvaSaisieSchema, type TauxTvaDate, type TypeProduitTva } from '@ha/domain';

import type { SuperadminConnecte } from '../auth/acces';
import { withAuditPlateforme } from '../audit/journal';
import { traduireDoublon, valider } from '../erreurs';
import { depuisDate, versDate } from './dossiers';
import { verifierSuperadmin } from './organisations';
import type { Client } from './patients';

/** Taux en base, communs à tous les clients ; le choix de la date revient à `tauxTvaEnVigueur`. */
export async function tauxTvaDates(client: Client): Promise<TauxTvaDate[]> {
  return versTaux(await client.tauxTva.findMany({ select: SELECTION_TAUX }));
}

const SELECTION_TAUX = { type: true, taux: true, debut: true } as const;

function versTaux(lignes: readonly { type: TypeProduitTva; taux: number; debut: Date }[]) {
  return lignes.map((l) => ({ ...l, debut: depuisDate(l.debut) }));
}

/** Console éditeur : historique complet, du plus récent au plus ancien. */
export async function listerTauxTva(acteur: SuperadminConnecte): Promise<TauxTvaDate[]> {
  verifierSuperadmin(acteur);
  const lignes = versTaux(await clientPlateforme().tauxTva.findMany({ select: SELECTION_TAUX }));
  return lignes.sort((a, b) => b.debut.localeCompare(a.debut) || a.type.localeCompare(b.type));
}

/**
 * Ajoute un taux daté. Rien ne se modifie : une correction validée par l'expert-comptable est une nouvelle
 * ligne, et les factures figées gardent leur taux.
 * À VÉRIFIER : valeurs et fait générateur absents de docs/ref (R18).
 */
export async function ajouterTauxTva(acteur: SuperadminConnecte, saisie: unknown): Promise<void> {
  verifierSuperadmin(acteur);
  const { type, taux, debut } = valider(tauxTvaSaisieSchema, saisie);
  try {
    await withAuditPlateforme(
      acteur,
      (tx) =>
        tx.tauxTva.create({ data: { type, taux, debut: versDate(debut) }, select: { id: true } }),
      () => null,
      ({ id }) => ({
        action: 'CREATE',
        entiteType: 'TAUX_TVA',
        entiteId: id,
        details: { type, taux, debut },
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, {}, 'Un taux existe déjà à cette date pour ce type de produit.');
  }
}
