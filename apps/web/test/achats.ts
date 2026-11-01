import { prisma } from '@ha/db/admin';

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
