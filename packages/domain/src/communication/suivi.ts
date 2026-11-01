export const STATUTS_MESSAGE = [
  'A_ENVOYER',
  'ENVOYE',
  'DELIVRE',
  'ECHEC',
  'BLOQUE',
  'EXPIRE',
  'A_IMPRIMER',
  'IMPRIME',
] as const;
export type StatutMessage = (typeof STATUTS_MESSAGE)[number];

export const LIBELLES_STATUTS_MESSAGE: Readonly<Record<StatutMessage, string>> = {
  A_ENVOYER: 'À envoyer',
  ENVOYE: 'Envoyé',
  DELIVRE: 'Délivré',
  ECHEC: 'Échec',
  BLOQUE: 'Non envoyé',
  EXPIRE: 'Expiré',
  A_IMPRIMER: 'À imprimer',
  IMPRIME: 'Imprimé',
};

export const ETATS_FOURNISSEUR = ['EN_COURS', 'DELIVRE', 'ECHEC'] as const;
export type EtatFournisseur = (typeof ETATS_FOURNISSEUR)[number];

/** Seul un message confié au fournisseur attend encore un accusé. */
export function suiviAttendu(statut: StatutMessage): boolean {
  return statut === 'ENVOYE';
}

/**
 * Statut après un accusé. Un état final ne recule pas : un accusé rejoué, ou arrivé en retard, ne change rien.
 */
export function statutApresAccuse(actuel: StatutMessage, etat: EtatFournisseur): StatutMessage {
  if (!suiviAttendu(actuel) || etat === 'EN_COURS') {
    return actuel;
  }
  return etat;
}

const MILLIMES_PAR_CENTIME = 10;

/** Le tarif d'un SMS passe sous le centime : il se garde en millièmes d'euro, la somme s'arrondit à l'affichage. */
export function coutSmsMillimes(segments: number, tarifMillimes: number): number {
  return segments * tarifMillimes;
}

export function centimesDepuisMillimes(millimes: number): number {
  return Math.round(millimes / MILLIMES_PAR_CENTIME);
}
