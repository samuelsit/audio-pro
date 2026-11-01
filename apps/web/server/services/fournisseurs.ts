import {
  centraleAchatSaisieSchema,
  comptesCentresSaisieSchema,
  contactFournisseurSaisieSchema,
  fournisseurSaisieSchema,
  PARAMETRES_COMMANDE_DEFAUT,
  parametresCommandeSaisieSchema,
  peutGererFournisseurs,
  type CentraleAchatSaisie,
  type FournisseurSaisie,
  type ParametresCommande,
  type TypeFournisseur,
} from '@ha/domain';

import { AccesRefuseError, type UtilisateurConnecte } from '../auth/acces';
import { withAudit, type EvenementAudit } from '../audit/journal';
import { base, type ClientTransaction } from '../chiffrement';
import { ErreurSaisie, traduireDoublon, valider } from '../erreurs';

export interface FournisseurResume {
  id: string;
  type: TypeFournisseur;
  nom: string;
  emailCommande: string | null;
  centraleAchat: string | null;
  actif: boolean;
}

export interface ContactVue {
  id: string;
  nom: string;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
}

export interface FournisseurDetail extends FournisseurResume {
  fabricantId: string | null;
  centraleAchatId: string | null;
  emailFacturation: string | null;
  telephone: string | null;
  adresse: string | null;
  siret: string | null;
  conditions: string | null;
  delaiRelanceJours: number | null;
  contacts: ContactVue[];
  comptes: { centreId: string; numeroClient: string }[];
}

export interface CentraleResume {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  actif: boolean;
}

const DOUBLON_FOURNISSEUR = {
  fournisseur_organisation_id_nom_key: ['nom', 'Ce fournisseur existe déjà.'],
  fournisseur_fabricant_id_key: ['fabricantId', 'Ce fabricant a déjà sa fiche.'],
} as const;

const DOUBLON_CENTRALE = {
  centrale_achat_organisation_id_nom_key: ['nom', 'Cette centrale existe déjà.'],
} as const;

const DOUBLON_COMPTE = {
  fournisseur_compte_centre_fournisseur_id_numero_client_key: [
    'comptes',
    'Deux centres ne peuvent pas partager un numéro de client.',
  ],
} as const;

function exigerGestion(acteur: UtilisateurConnecte): void {
  if (!peutGererFournisseurs(acteur.role)) {
    throw new AccesRefuseError();
  }
}

function evenementFournisseur(
  action: EvenementAudit['action'],
  id: string,
  s: FournisseurSaisie,
): EvenementAudit {
  return {
    action,
    entiteType: 'FOURNISSEUR',
    entiteId: id,
    details: { nom: s.nom, type: s.type, actif: s.actif, centraleAchatId: s.centraleAchatId },
  };
}

const selectionResume = {
  id: true,
  type: true,
  nom: true,
  emailCommande: true,
  actif: true,
  centraleAchat: { select: { nom: true } },
} as const;

/** Lecture ouverte : la demande de commande choisit parmi ces fiches. */
export async function listerFournisseurs(
  acteur: UtilisateurConnecte,
): Promise<FournisseurResume[]> {
  const lignes = await base(acteur).fournisseur.findMany({
    where: { organisationId: acteur.organisationId },
    select: selectionResume,
    orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
  });
  return lignes.map((l) => ({ ...l, centraleAchat: l.centraleAchat?.nom ?? null }));
}

export async function obtenirFournisseur(
  acteur: UtilisateurConnecte,
  fournisseurId: string,
): Promise<FournisseurDetail> {
  const client = base(acteur);
  const f = await client.fournisseur.findFirst({
    where: { id: fournisseurId, organisationId: acteur.organisationId },
    select: {
      ...selectionResume,
      fabricantId: true,
      centraleAchatId: true,
      emailFacturation: true,
      telephone: true,
      adresse: true,
      siret: true,
      conditions: true,
      delaiRelanceJours: true,
      contacts: {
        select: { id: true, nom: true, fonction: true, email: true, telephone: true },
        orderBy: { nom: 'asc' },
      },
      comptes: { select: { centreId: true, numeroClient: true } },
    },
  });
  if (!f) {
    throw new AccesRefuseError();
  }
  return { ...f, centraleAchat: f.centraleAchat?.nom ?? null };
}

async function verifierLiens(
  tx: ClientTransaction,
  acteur: UtilisateurConnecte,
  donnees: FournisseurSaisie,
): Promise<void> {
  const { organisationId } = acteur;
  if (donnees.fabricantId !== null) {
    const fabricant = await tx.fabricant.findFirst({
      where: { id: donnees.fabricantId, organisationId },
      select: { id: true },
    });
    if (!fabricant) {
      throw ErreurSaisie.surChamp('fabricantId', 'Fabricant inconnu.');
    }
  }
  if (donnees.centraleAchatId !== null) {
    const centrale = await tx.centraleAchat.findFirst({
      where: { id: donnees.centraleAchatId, organisationId },
      select: { id: true },
    });
    if (!centrale) {
      throw ErreurSaisie.surChamp('centraleAchatId', 'Centrale inconnue.');
    }
  }
}

export async function creerFournisseur(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<string> {
  exigerGestion(acteur);
  const donnees = valider(fournisseurSaisieSchema, saisie);
  try {
    const { id } = await withAudit(
      acteur,
      async (tx) => {
        await verifierLiens(tx, acteur, donnees);
        return tx.fournisseur.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        });
      },
      (cree) => evenementFournisseur('CREATE', cree.id, donnees),
    );
    return id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_FOURNISSEUR, 'Ce fournisseur existe déjà.');
  }
}

/** Un fournisseur s'archive sans se supprimer : les commandes et les factures gardent leur lien. */
export async function modifierFournisseur(
  acteur: UtilisateurConnecte,
  fournisseurId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const donnees = valider(fournisseurSaisieSchema, saisie);
  await obtenirFournisseur(acteur, fournisseurId);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        await verifierLiens(tx, acteur, donnees);
        await tx.fournisseur.update({ where: { id: fournisseurId }, data: donnees });
      },
      evenementFournisseur('UPDATE', fournisseurId, donnees),
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_FOURNISSEUR, 'Ce fournisseur existe déjà.');
  }
}

export async function ajouterContact(
  acteur: UtilisateurConnecte,
  fournisseurId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const donnees = valider(contactFournisseurSaisieSchema, saisie);
  await obtenirFournisseur(acteur, fournisseurId);
  await withAudit(
    acteur,
    (tx) =>
      tx.fournisseurContact.create({
        data: { ...donnees, fournisseurId, organisationId: acteur.organisationId },
      }),
    {
      action: 'UPDATE',
      entiteType: 'FOURNISSEUR',
      entiteId: fournisseurId,
      details: { contactAjoute: true },
    },
  );
}

export async function retirerContact(
  acteur: UtilisateurConnecte,
  fournisseurId: string,
  contactId: string,
): Promise<void> {
  exigerGestion(acteur);
  await obtenirFournisseur(acteur, fournisseurId);
  await withAudit(
    acteur,
    (tx) => tx.fournisseurContact.deleteMany({ where: { id: contactId, fournisseurId } }),
    {
      action: 'UPDATE',
      entiteType: 'FOURNISSEUR',
      entiteId: fournisseurId,
      details: { contactRetire: true },
    },
  );
}

/** Remplace les numéros de client : un numéro vide retire le centre. */
export async function enregistrerComptes(
  acteur: UtilisateurConnecte,
  fournisseurId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const comptes = valider(comptesCentresSaisieSchema, saisie);
  await obtenirFournisseur(acteur, fournisseurId);
  try {
    await withAudit(
      acteur,
      async (tx) => {
        await tx.fournisseurCompteCentre.deleteMany({ where: { fournisseurId } });
        await tx.fournisseurCompteCentre.createMany({
          data: comptes.flatMap(({ centreId, numeroClient }) =>
            numeroClient === null
              ? []
              : [{ fournisseurId, centreId, numeroClient, organisationId: acteur.organisationId }],
          ),
        });
      },
      {
        action: 'UPDATE',
        entiteType: 'FOURNISSEUR',
        entiteId: fournisseurId,
        details: { comptes: comptes.filter((c) => c.numeroClient !== null).length },
      },
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_COMPTE, 'Ce numéro de client est déjà utilisé.');
  }
}

// --- Centrales d'achat --------------------------------------------------------------------------

const selectionCentrale = {
  id: true,
  nom: true,
  email: true,
  telephone: true,
  adresse: true,
  actif: true,
} as const;

function evenementCentrale(
  action: EvenementAudit['action'],
  id: string,
  s: CentraleAchatSaisie,
): EvenementAudit {
  return {
    action,
    entiteType: 'CENTRALE_ACHAT',
    entiteId: id,
    details: { nom: s.nom, actif: s.actif },
  };
}

export async function listerCentrales(acteur: UtilisateurConnecte): Promise<CentraleResume[]> {
  return base(acteur).centraleAchat.findMany({
    where: { organisationId: acteur.organisationId },
    select: selectionCentrale,
    orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
  });
}

export async function obtenirCentrale(
  acteur: UtilisateurConnecte,
  centraleId: string,
): Promise<CentraleResume> {
  const centrale = await base(acteur).centraleAchat.findFirst({
    where: { id: centraleId, organisationId: acteur.organisationId },
    select: selectionCentrale,
  });
  if (!centrale) {
    throw new AccesRefuseError();
  }
  return centrale;
}

export async function creerCentrale(acteur: UtilisateurConnecte, saisie: unknown): Promise<string> {
  exigerGestion(acteur);
  const donnees = valider(centraleAchatSaisieSchema, saisie);
  try {
    const { id } = await withAudit(
      acteur,
      (tx) =>
        tx.centraleAchat.create({
          data: { ...donnees, organisationId: acteur.organisationId },
          select: { id: true },
        }),
      (creee) => evenementCentrale('CREATE', creee.id, donnees),
    );
    return id;
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_CENTRALE, 'Cette centrale existe déjà.');
  }
}

export async function modifierCentrale(
  acteur: UtilisateurConnecte,
  centraleId: string,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const donnees = valider(centraleAchatSaisieSchema, saisie);
  await obtenirCentrale(acteur, centraleId);
  try {
    await withAudit(
      acteur,
      (tx) => tx.centraleAchat.update({ where: { id: centraleId }, data: donnees }),
      evenementCentrale('UPDATE', centraleId, donnees),
    );
  } catch (erreur) {
    traduireDoublon(erreur, DOUBLON_CENTRALE, 'Cette centrale existe déjà.');
  }
}

// --- Paramètres ---------------------------------------------------------------------------------

export async function lireParametresCommande(
  acteur: UtilisateurConnecte,
): Promise<ParametresCommande> {
  const ligne = await base(acteur).parametresCommande.findUnique({
    where: { organisationId: acteur.organisationId },
    select: {
      delaiRelanceJours: true,
      relancesMax: true,
      tolerancePrixCentimes: true,
      adresseBoiteFactures: true,
    },
  });
  return ligne ?? PARAMETRES_COMMANDE_DEFAUT;
}

export async function enregistrerParametresCommande(
  acteur: UtilisateurConnecte,
  saisie: unknown,
): Promise<void> {
  exigerGestion(acteur);
  const { tolerancePrix, ...reste } = valider(parametresCommandeSaisieSchema, saisie);
  const donnees = { ...reste, tolerancePrixCentimes: tolerancePrix };
  await withAudit(
    acteur,
    (tx) =>
      tx.parametresCommande.upsert({
        where: { organisationId: acteur.organisationId },
        create: { ...donnees, organisationId: acteur.organisationId },
        update: donnees,
      }),
    {
      action: 'UPDATE',
      entiteType: 'PARAMETRES_COMMANDE',
      entiteId: acteur.organisationId,
      details: {
        delaiRelanceJours: donnees.delaiRelanceJours,
        relancesMax: donnees.relancesMax,
        tolerancePrixCentimes: donnees.tolerancePrixCentimes,
      },
    },
  );
}
