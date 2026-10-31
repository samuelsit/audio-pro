import { clientPlateforme } from '@ha/db';

import { auteurDepuisActeur, journaliser, type AuteurAudit } from '../audit/journal';
import type { CompteConnecte } from '../auth/acces';

export type MotifEchecConnexion = 'IDENTIFIANTS' | 'CODE_2FA';

const LIBELLES_MOTIFS: Readonly<Record<MotifEchecConnexion, string>> = {
  IDENTIFIANTS: 'E-mail ou mot de passe incorrect, ou compte désactivé',
  CODE_2FA: 'Code de vérification en deux étapes invalide',
};

/** Connexion complète (après le second facteur s'il est exigé). */
export async function journaliserConnexion(acteur: CompteConnecte): Promise<void> {
  await journaliser(clientPlateforme(), auteurDepuisActeur(acteur), {
    action: 'CONNEXION',
    entiteType: 'SESSION',
  });
}

export async function journaliserDeconnexion(acteur: CompteConnecte): Promise<void> {
  await journaliser(clientPlateforme(), auteurDepuisActeur(acteur), {
    action: 'DECONNEXION',
    entiteType: 'SESSION',
  });
}

/**
 * Échec de connexion. `email` (déjà validé) identifie le compte s'il existe ; sinon la ligne garde
 * l'adresse tentée, sans utilisateur. Au second facteur, l'adresse n'est pas connue (`null`).
 */
export async function journaliserEchecConnexion(
  email: string | null,
  motif: MotifEchecConnexion,
): Promise<void> {
  const compte = email
    ? await clientPlateforme().utilisateur.findUnique({
        where: { email },
        select: { id: true, prenom: true, nom: true, role: true, organisationId: true },
      })
    : null;
  const auteur: AuteurAudit = compte
    ? {
        utilisateurId: compte.id,
        libelle: `${compte.prenom} ${compte.nom} <${email}>`,
        role: compte.role,
        organisationId: compte.organisationId,
      }
    : {
        utilisateurId: null,
        libelle: email ?? 'Inconnu (second facteur)',
        role: null,
        organisationId: null,
      };
  await journaliser(clientPlateforme(), auteur, {
    action: 'ECHEC_CONNEXION',
    entiteType: 'SESSION',
    details: { motif: LIBELLES_MOTIFS[motif] },
  });
}
