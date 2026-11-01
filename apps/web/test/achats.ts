import { prisma } from '@ha/db/admin';

import type { CatalogueDevis } from './devis';
import type { JeuDeDonnees } from './donnees';

/** Fiche d'achat d'un fabricant déjà au catalogue, écrite directement. */
export async function creerFournisseurDe(
  organisationId: string,
  fabricantId: string,
  donnees: { emailCommande?: string | null; delaiRelanceJours?: number | null } = {},
) {
  const { nom } = await prisma().fabricant.findUniqueOrThrow({
    where: { id: fabricantId },
    select: { nom: true },
  });
  return prisma().fournisseur.create({
    data: {
      organisationId,
      type: 'FABRICANT',
      nom,
      fabricantId,
      emailCommande: 'commandes@fabricant.exemple.test',
      ...donnees,
    },
  });
}

/** Un fournisseur de fabricant et un fournisseur d'accessoires, prêts à recevoir des commandes. */
export async function creerAchats(d: JeuDeDonnees, catalogue: CatalogueDevis) {
  const organisationId = d.organisation.id;
  const { fabricantId } = await prisma().modeleAideAuditive.findUniqueOrThrow({
    where: { id: catalogue.classeI },
    select: { fabricantId: true },
  });
  const fabricant = await creerFournisseurDe(organisationId, fabricantId);
  const accessoires = await prisma().fournisseur.create({
    data: {
      organisationId,
      type: 'FOURNISSEUR',
      nom: 'Piles fictives',
      emailCommande: 'commandes@piles.exemple.test',
    },
  });
  await prisma().accessoire.update({
    where: { id: catalogue.piles },
    data: { fournisseurId: accessoires.id, prixAchatCentimes: 60 },
  });
  await prisma().modeleAideAuditive.update({
    where: { id: catalogue.classeI },
    data: { prixAchatCentimes: 60_000 },
  });
  return { fabricantId: fabricant.id, accessoiresId: accessoires.id };
}
