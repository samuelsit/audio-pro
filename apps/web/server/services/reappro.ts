import {
  brouillonsReapproSchema,
  peutGererAchats,
  quantiteAReapprovisionner,
  seuilSaisieSchema,
} from '@ha/domain';

import { AccesRefuseError, verifierAccesCentre, type UtilisateurConnecte } from '../auth/acces';
import { withAudit } from '../audit/journal';
import { base } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';
import { ajouterLigne, creerCommande } from './commandes';

/** Statuts où une quantité est attendue. Le brouillon compte : deux propositions ne s'additionnent pas. */
const STATUTS_EN_COURS = [
  'BROUILLON',
  'A_APPROUVER',
  'APPROUVEE',
  'ENVOYEE',
  'PARTIELLEMENT_RECUE',
] as const;

const DOUBLON_SEUIL = {
  seuil_stock_modele_unique: ['produit', 'Ce produit a déjà un seuil dans ce centre.'],
  seuil_stock_accessoire_unique: ['produit', 'Ce produit a déjà un seuil dans ce centre.'],
} as const;

export interface LigneReappro {
  seuilId: string;
  /** Valeur du champ `produit`. */
  produit: string;
  designation: string;
  minimum: number;
  cible: number;
  stock: number;
  enCommande: number;
  aCommander: number;
  fournisseurId: string | null;
  fournisseur: string | null;
}

function exigerGestion(acteur: UtilisateurConnecte, centreId: string): void {
  if (!peutGererAchats(acteur.role)) {
    throw new AccesRefuseError();
  }
  verifierAccesCentre(acteur, centreId);
}

/** État des seuils d'un centre : le calcul se refait à chaque lecture, sans travail de nuit. */
export async function proposerReappro(
  acteur: UtilisateurConnecte,
  centreId: string,
): Promise<LigneReappro[]> {
  exigerGestion(acteur, centreId);
  const client = base(acteur);
  // L'administrateur a tous les centres de son client : encore faut-il que celui-ci en soit un.
  const centre = await client.centre.findFirst({
    where: { id: centreId, organisationId: acteur.organisationId },
    select: { id: true },
  });
  if (!centre) {
    throw new AccesRefuseError();
  }
  const seuils = await client.seuilStock.findMany({
    where: { centreId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      minimum: true,
      cible: true,
      modeleId: true,
      accessoireId: true,
      modele: {
        select: {
          gamme: true,
          nom: true,
          fabricant: {
            select: { nom: true, fournisseur: { select: { id: true, nom: true, actif: true } } },
          },
        },
      },
      accessoire: {
        select: { nom: true, fournisseur: { select: { id: true, nom: true, actif: true } } },
      },
    },
  });
  const [stocksAppareils, stocksAccessoires, enCours] = await Promise.all([
    client.appareil.groupBy({
      by: ['modeleId'],
      where: { centreId, statut: 'EN_STOCK', enConsignation: false },
      _count: { _all: true },
    }),
    client.stockAccessoire.findMany({
      where: { centreId },
      select: { accessoireId: true, quantite: true },
    }),
    client.commandeLigne.findMany({
      where: {
        patientId: null,
        commande: { centreId, statut: { in: [...STATUTS_EN_COURS] } },
      },
      select: {
        modeleId: true,
        accessoireId: true,
        quantite: true,
        quantiteRecue: true,
        quantiteAbandonnee: true,
      },
    }),
  ]);
  return seuils.map((s) => {
    const stock =
      s.modeleId !== null
        ? (stocksAppareils.find((a) => a.modeleId === s.modeleId)?._count._all ?? 0)
        : (stocksAccessoires.find((a) => a.accessoireId === s.accessoireId)?.quantite ?? 0);
    const enCommande = enCours
      .filter((l) =>
        s.modeleId !== null ? l.modeleId === s.modeleId : l.accessoireId === s.accessoireId,
      )
      .reduce((t, l) => t + Math.max(0, l.quantite - l.quantiteAbandonnee - l.quantiteRecue), 0);
    const lie = s.modele?.fabricant.fournisseur ?? s.accessoire?.fournisseur ?? null;
    const fournisseur = lie?.actif ? lie : null;
    return {
      seuilId: s.id,
      produit: s.modeleId !== null ? `modele:${s.modeleId}` : `accessoire:${s.accessoireId ?? ''}`,
      designation: s.modele
        ? `${s.modele.fabricant.nom} ${s.modele.gamme} ${s.modele.nom}`
        : (s.accessoire?.nom ?? ''),
      minimum: s.minimum,
      cible: s.cible,
      stock,
      enCommande,
      aCommander: quantiteAReapprovisionner(s, { stock, enCommande }),
      fournisseurId: fournisseur?.id ?? null,
      fournisseur: fournisseur?.nom ?? null,
    };
  });
}

export async function enregistrerSeuil(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  const donnees = valider(seuilSaisieSchema, saisie);
  exigerGestion(acteur, donnees.centreId);
  const { centreId, modeleId, accessoireId, minimum, cible } = donnees;
  try {
    await withAudit(
      acteur,
      async (tx) => {
        const produit =
          modeleId !== null
            ? await tx.modeleAideAuditive.findFirst({
                where: { id: modeleId, organisationId: acteur.organisationId },
                select: { id: true },
              })
            : await tx.accessoire.findFirst({
                where: { id: accessoireId ?? '', organisationId: acteur.organisationId },
                select: { id: true },
              });
        if (!produit) {
          throw ErreurSaisie.surChamp('produit', 'Produit inconnu.');
        }
        const existant = await tx.seuilStock.findFirst({
          where: { centreId, modeleId, accessoireId },
          select: { id: true },
        });
        if (existant) {
          await tx.seuilStock.update({
            where: { id: existant.id },
            data: { minimum, cible },
          });
          return existant.id;
        }
        const { id } = await tx.seuilStock.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        });
        return id;
      },
      (id) => ({
        action: 'UPDATE',
        entiteType: 'SEUIL_STOCK',
        entiteId: id,
        centreId,
        details: { minimum, cible },
      }),
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_SEUIL, 'Ce produit a déjà un seuil dans ce centre.');
  }
}

export async function retirerSeuil(
  acteur: UtilisateurConnecte,
  centreId: string,
  seuilId: string,
): Promise<void> {
  exigerGestion(acteur, centreId);
  await withAudit(acteur, (tx) => tx.seuilStock.deleteMany({ where: { id: seuilId, centreId } }), {
    action: 'DELETE',
    entiteType: 'SEUIL_STOCK',
    entiteId: seuilId,
    centreId,
  });
}

/**
 * Transforme la proposition retenue en demandes, une par fournisseur. Ce ne sont que des brouillons : les règles
 * d'approbation s'appliquent à leur soumission. Rend les commandes créées.
 */
export async function creerBrouillonsReappro(
  acteur: UtilisateurConnecte,
  centreId: string,
  saisie: unknown,
): Promise<string[]> {
  exigerGestion(acteur, centreId);
  const retenues = valider(brouillonsReapproSchema, saisie).filter((r) => r.quantite > 0);
  const lignes = await proposerReappro(acteur, centreId);
  const parFournisseur = new Map<string, { produit: string; quantite: number }[]>();
  for (const retenue of retenues) {
    const ligne = lignes.find((l) => l.produit === retenue.produit);
    if (!ligne) {
      throw ErreurSaisie.surChamp('lignes', 'Ce produit n’a pas de seuil dans ce centre.');
    }
    if (ligne.fournisseurId === null) {
      throw ErreurSaisie.surChamp('lignes', `Aucun fournisseur pour ${ligne.designation}.`);
    }
    parFournisseur.set(ligne.fournisseurId, [
      ...(parFournisseur.get(ligne.fournisseurId) ?? []),
      retenue,
    ]);
  }
  const commandes: string[] = [];
  for (const [fournisseurId, produits] of parFournisseur) {
    const commandeId = await creerCommande(acteur, { centreId, fournisseurId });
    commandes.push(commandeId);
    for (const { produit, quantite } of produits) {
      await ajouterLigne(acteur, commandeId, {
        produit,
        quantite: String(quantite),
        enConsignation: false,
      });
    }
  }
  return commandes;
}
