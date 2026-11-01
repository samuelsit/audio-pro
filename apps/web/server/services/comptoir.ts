import {
  boitesRemboursees,
  etatQuotaPiles,
  LIBELLES_NATURES_ACCESSOIRE,
  peutVendreAuComptoir,
  quotaPilesEnVigueur,
  venteComptoirSchema,
  centimes,
  type EtatQuotaPiles,
  type NatureAccessoire,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';
import { versDate } from './dossiers';
import { ecrireLigneBrouillon, ouvrirVenteDirecte } from './facturation';
import { exigerPatient } from './garanties';
import { aujourdhui } from './patients';
import { quotasPilesDates } from './quota-piles';

export interface ArticleComptoir {
  id: string;
  nom: string;
  nature: NatureAccessoire;
  categorie: string;
  prixCentimes: number;
  quantiteEnStock: number;
}

/** Articles du catalogue en stock dans ce centre : la validation de la vente les sort du stock. */
export async function articlesComptoir(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<ArticleComptoir[]> {
  verifierAccesCentre(acteur, centreId);
  const lignes = await base(acteur).stockAccessoire.findMany({
    where: { centreId, quantite: { gt: 0 }, accessoire: { actif: true } },
    select: {
      quantite: true,
      accessoire: { select: { id: true, nom: true, nature: true, prixCentimes: true } },
    },
    orderBy: [{ accessoire: { nature: 'desc' } }, { accessoire: { nom: 'asc' } }],
  });
  return lignes.map(({ quantite, accessoire }) => ({
    id: accessoire.id,
    nom: accessoire.nom,
    nature: accessoire.nature,
    categorie: LIBELLES_NATURES_ACCESSOIRE[accessoire.nature],
    prixCentimes: accessoire.prixCentimes,
    quantiteEnStock: quantite,
  }));
}

/**
 * Compteur de boîtes remboursées de l'année civile. Avertit sans bloquer, voir `etatQuotaPiles`.
 * À VÉRIFIER : aucun quota dans docs/ref (R15).
 */
export async function compteurPiles(
  acteur: UtilisateurConnecte,
  patientId: string,
): Promise<EtatQuotaPiles> {
  const client = base(acteur);
  await exigerPatient(client, acteur, patientId);
  const jour = aujourdhui();
  const annee = Number(jour.slice(0, 4));
  const lignes = await client.ligneFacture.findMany({
    where: {
      nature: 'PILE',
      amoCentimes: { gt: 0 },
      facture: {
        patientId,
        organisationId: acteur.organisationId,
        nature: 'FACTURE',
        statut: 'VALIDEE',
        dateFacture: {
          gte: versDate(`${String(annee)}-01-01`),
          lte: versDate(`${String(annee)}-12-31`),
        },
      },
    },
    select: { id: true, quantite: true, prixTtcCentimes: true },
  });
  const reprises = await client.ligneFacture.findMany({
    where: { ligneOrigineId: { in: lignes.map((l) => l.id) }, facture: { statut: 'VALIDEE' } },
    select: { ligneOrigineId: true, prixTtcCentimes: true },
  });
  const boites = boitesRemboursees(
    lignes.map((l) => ({
      quantite: l.quantite,
      prixTtcCentimes: l.prixTtcCentimes,
      repriseTtcCentimes: reprises
        .filter((r) => r.ligneOrigineId === l.id)
        .reduce((cumul, r) => cumul + r.prixTtcCentimes, 0),
    })),
  );
  return etatQuotaPiles(annee, boites, quotaPilesEnVigueur(await quotasPilesDates(client), jour));
}

/** Prépare la vente d'un seul geste : le brouillon s'ouvre sur l'écran de la facture, qui la valide. */
export async function venteComptoir(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  if (!peutVendreAuComptoir(acteur.role)) {
    throw new AccesRefuseError();
  }
  const { patientId, centreId, prescriptionId, lignes, entretienLibelle, entretienPrix } = valider(
    venteComptoirSchema,
    saisie,
  );
  verifierAccesCentre(acteur, centreId);
  return withAudit(
    acteur,
    async (tx) => {
      const factureId = await ouvrirVenteDirecte(tx, acteur, {
        patientId,
        centreId,
        prescriptionId,
      });
      for (const { accessoireId, quantite } of lignes) {
        const article = await tx.accessoire.findFirst({
          where: { id: accessoireId, organisationId: acteur.organisationId, actif: true },
          select: { nom: true, nature: true, prixCentimes: true },
        });
        if (!article) {
          throw ErreurSaisie.surChamp('lignes', 'Article inconnu.');
        }
        await ecrireLigneBrouillon(tx, acteur, factureId, {
          nature: article.nature,
          accessoireId,
          libelle: article.nom,
          quantite,
          prixUnitaire: centimes(article.prixCentimes),
        });
      }
      if (entretienLibelle !== null && entretienPrix !== null) {
        await ecrireLigneBrouillon(tx, acteur, factureId, {
          nature: 'ENTRETIEN',
          accessoireId: null,
          libelle: entretienLibelle,
          quantite: 1,
          prixUnitaire: centimes(entretienPrix),
        });
      }
      return factureId;
    },
    (factureId) => ({
      action: 'CREATE',
      entiteType: 'FACTURE',
      entiteId: factureId,
      patientId,
      centreId,
    }),
  );
}
