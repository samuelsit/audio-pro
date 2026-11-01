import {
  complementaireSaisieSchema,
  peutGererComplementaires,
  type ComplementaireSaisie,
  type ModePec,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, valider } from '../erreurs';

export interface ComplementaireVue {
  id: string;
  nom: string;
  identifiant: string;
  plateformeTiersPayant: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  modePec: ModePec;
  delaiPaiementJours: number;
  actif: boolean;
}

function evenement(action: EvenementAudit['action'], id: string, s: ComplementaireSaisie) {
  return {
    action,
    entiteType: 'COMPLEMENTAIRE',
    entiteId: id,
    details: { nom: s.nom, identifiant: s.identifiant, modePec: s.modePec, actif: s.actif },
  } as const;
}

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererComplementaires(acteur.role)) {
    throw new AccesRefuseError();
  }
}

async function exigerIdentifiantLibre(
  tx: ClientTransaction,
  identifiant: string,
  id: string | null,
): Promise<void> {
  const existante = await tx.complementaire.findFirst({
    where: { identifiant, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (existante) {
    throw ErreurSaisie.surChamp('identifiant', 'Cet identifiant est déjà utilisé.');
  }
}

/** Référentiel du client, les actives d'abord. Lecture ouverte : il alimente la saisie des PEC et des règlements. */
export async function listerComplementaires(
  acteur: UtilisateurConnecte,
): Promise<ComplementaireVue[]> {
  return base(acteur).complementaire.findMany({
    where: { organisationId: acteur.organisationId },
    orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
    select: {
      id: true,
      nom: true,
      identifiant: true,
      plateformeTiersPayant: true,
      telephone: true,
      email: true,
      adresse: true,
      modePec: true,
      delaiPaiementJours: true,
      actif: true,
    },
  });
}

export async function creerComplementaire(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  exigerGestion(acteur);
  const donnees = valider(complementaireSaisieSchema, saisie);
  const { id } = await withAudit(
    acteur,
    async (tx) => {
      await exigerIdentifiantLibre(tx, donnees.identifiant, null);
      return tx.complementaire.create({
        data: { ...donnees, organisationId: acteur.organisationId },
        select: { id: true },
      });
    },
    ({ id: cree }) => evenement('CREATE', cree, donnees),
  );
  return id;
}

/** Un organisme s'archive sans se supprimer : les créances et les PEC gardent leur lien. */
export async function modifierComplementaire(
  acteur: UtilisateurConnecte,
  complementaireId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const donnees = valider(complementaireSaisieSchema, saisie);
  await withAudit(
    acteur,
    async (tx) => {
      const existante = await tx.complementaire.findFirst({
        where: { id: complementaireId, organisationId: acteur.organisationId },
        select: { id: true },
      });
      if (!existante) {
        throw new AccesRefuseError();
      }
      await exigerIdentifiantLibre(tx, donnees.identifiant, complementaireId);
      await tx.complementaire.update({ where: { id: complementaireId }, data: donnees });
    },
    evenement('UPDATE', complementaireId, donnees),
  );
}
