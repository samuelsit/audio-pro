import { prisma } from '@ha/db/admin';

import type { UtilisateurConnecte } from '@/server/auth/acces';
import { validerFacture } from '@/server/services/facturation';
import { confirmerCouvertureAmo, enregistrerPec, obtenirFacture } from '@/server/services/factures';

import { dossierJusquAchat, type CatalogueDevis } from './devis';
import type { JeuDeDonnees } from './donnees';

/** Parcours complet jusqu'à la vente : la facture est validée, l'appareil vendu au patient. */
export async function appareilVendu(
  d: JeuDeDonnees,
  audio: UtilisateurConnecte,
  catalogue: CatalogueDevis,
) {
  const parcours = await dossierJusquAchat(d, audio, catalogue);
  await confirmerCouvertureAmo(audio, parcours.dossierId);
  await enregistrerPec(
    audio,
    parcours.dossierId,
    { statut: 'SANS_TIERS_PAYANT' },
    new Uint8Array(0),
  );
  const evaluee = await obtenirFacture(audio, parcours.dossierId);
  if (!evaluee) {
    throw new Error('Brouillon attendu.');
  }
  await validerFacture(audio, evaluee.factureId);
  const { id: appareilId } = await prisma().appareil.findFirstOrThrow({
    where: { organisationId: d.organisation.id, numeroSerie: parcours.numeroSerie },
    select: { id: true },
  });
  return { ...parcours, factureId: evaluee.factureId, appareilId };
}
