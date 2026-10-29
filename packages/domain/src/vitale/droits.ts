import type { DroitsAmo } from '../ports/vitale-reader';

/** État des droits AMO à une date donnée. */
export const ETATS_DROITS_AMO = ['OUVERTS', 'EXPIRES', 'NON_OUVERTS', 'INCONNUS'] as const;
export type EtatDroitsAmo = (typeof ETATS_DROITS_AMO)[number];

export const LIBELLES_ETAT_DROITS_AMO: Readonly<Record<EtatDroitsAmo, string>> = {
  OUVERTS: 'Droits ouverts',
  EXPIRES: 'Droits expirés',
  NON_OUVERTS: 'Droits pas encore ouverts',
  INCONNUS: 'Fin de droits non renseignée',
};

/**
 * Ouverture des droits AMO au jour `jour` (AAAA-MM-JJ), bornes comprises : l'audioprothésiste vérifie
 * l'ouverture du droit aux prestations sur les données de la carte.
 * Source : convention-audioprothesistes.pdf, art. 27 (p. 27) et art. 35 § 1 (p. 32).
 * La convention apprécie les droits à la date de délivrance (art. 27) : ici on alerte au jour de la
 * lecture ou de la consultation ; le contrôle à la date de délivrance viendra avec la facture (étape 11).
 */
export function etatDroitsAmo(droits: DroitsAmo, jour: string): EtatDroitsAmo {
  if (droits.debut !== null && droits.debut > jour) {
    return 'NON_OUVERTS';
  }
  if (droits.fin === null) {
    return 'INCONNUS';
  }
  return droits.fin < jour ? 'EXPIRES' : 'OUVERTS';
}

/** Les droits ne couvrent pas `jour` : bandeau d'alerte. */
export function droitsAmoEnAlerte(droits: DroitsAmo, jour: string): boolean {
  const etat = etatDroitsAmo(droits, jour);
  return etat === 'EXPIRES' || etat === 'NON_OUVERTS';
}
