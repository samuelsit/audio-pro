export const STATUTS_RDV = ['PLANIFIE', 'CONFIRME', 'ARRIVE', 'VU', 'ABSENT', 'ANNULE'] as const;
export type StatutRdv = (typeof STATUTS_RDV)[number];

export const LIBELLES_STATUTS_RDV: Readonly<Record<StatutRdv, string>> = {
  PLANIFIE: 'Planifié',
  CONFIRME: 'Confirmé',
  ARRIVE: 'Arrivé',
  VU: 'Vu',
  ABSENT: 'Absent',
  ANNULE: 'Annulé',
};

export const ORIGINES_RDV = ['INTERNE', 'EN_LIGNE', 'TELEPHONE'] as const;
export type OrigineRdv = (typeof ORIGINES_RDV)[number];

export const LIBELLES_ORIGINES_RDV: Readonly<Record<OrigineRdv, string>> = {
  INTERNE: 'Interne',
  EN_LIGNE: 'En ligne',
  TELEPHONE: 'Téléphone',
};

const TRANSITIONS: Readonly<Record<StatutRdv, readonly StatutRdv[]>> = {
  PLANIFIE: ['CONFIRME', 'ARRIVE', 'ABSENT', 'ANNULE'],
  CONFIRME: ['ARRIVE', 'ABSENT', 'ANNULE'],
  ARRIVE: ['VU', 'ANNULE'],
  VU: [],
  // Marqué absent à tort, ou arrivé en retard.
  ABSENT: ['ARRIVE'],
  ANNULE: [],
};

export function peutPasserA(depuis: StatutRdv, vers: StatutRdv): boolean {
  return TRANSITIONS[depuis].includes(vers);
}

/** Seul un rendez-vous à venir bouge : un patient arrivé n'a plus d'horaire à changer. */
export function estDeplacable(statut: StatutRdv): boolean {
  return statut === 'PLANIFIE' || statut === 'CONFIRME';
}

/** Un absent ou un annulé libère le créneau ; la contrainte d'exclusion en base suit la même liste. */
export function occupeLeCreneau(statut: StatutRdv): boolean {
  return statut !== 'ANNULE' && statut !== 'ABSENT';
}

export const ETAPES_SALLE_ATTENTE = ['ARRIVE', 'EN_COURS', 'TERMINE'] as const;
export type EtapeSalleAttente = (typeof ETAPES_SALLE_ATTENTE)[number];

export const LIBELLES_ETAPES_SALLE_ATTENTE: Readonly<Record<EtapeSalleAttente, string>> = {
  ARRIVE: 'Arrivé',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
};

/** Colonne de la salle d'attente ; `null` pour un rendez-vous qui n'y figure pas. */
export function etapeSalleAttente(
  statut: StatutRdv,
  priseEnCharge: boolean,
): EtapeSalleAttente | null {
  if (statut === 'VU') {
    return 'TERMINE';
  }
  if (statut !== 'ARRIVE') {
    return null;
  }
  return priseEnCharge ? 'EN_COURS' : 'ARRIVE';
}
