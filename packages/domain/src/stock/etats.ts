export const STATUTS_APPAREIL = [
  'EN_STOCK',
  'RESERVE',
  'EN_ESSAI',
  'VENDU',
  'RETOUR_FABRICANT',
  'SAV',
  'PRET',
] as const;
export type StatutAppareil = (typeof STATUTS_APPAREIL)[number];

export const LIBELLES_STATUTS_APPAREIL: Readonly<Record<StatutAppareil, string>> = {
  EN_STOCK: 'En stock',
  RESERVE: 'Réservé',
  EN_ESSAI: 'En essai',
  VENDU: 'Vendu',
  RETOUR_FABRICANT: 'Retour fabricant',
  SAV: 'SAV',
  PRET: 'Prêté',
};

/**
 * Transitions autorisées, hors annulation de vente (voir `verifierAnnulationVente`).
 * VENDU s'atteint depuis RESERVE, à la validation de la facture : l'essai précède la vente. Les retours en
 * VENDU depuis SAV ou RETOUR_FABRICANT rendent au patient l'appareil qu'il a acheté. EN_ESSAI → RESERVE :
 * l'achat est confirmé, l'appareil reste réservé au patient jusqu'à la facturation (ADR-013).
 * VENDU → RESERVE : un avoir total annule la vente, et l'appareil attend la nouvelle facture (ADR-028).
 */
const TRANSITIONS: Readonly<Record<StatutAppareil, readonly StatutAppareil[]>> = {
  EN_STOCK: ['RESERVE', 'EN_ESSAI', 'PRET', 'SAV', 'RETOUR_FABRICANT'],
  RESERVE: ['EN_STOCK', 'EN_ESSAI', 'VENDU'],
  EN_ESSAI: ['EN_STOCK', 'RESERVE', 'SAV'],
  PRET: ['EN_STOCK', 'SAV'],
  VENDU: ['SAV', 'RESERVE'],
  SAV: ['RETOUR_FABRICANT', 'EN_STOCK', 'VENDU'],
  RETOUR_FABRICANT: ['SAV', 'EN_STOCK', 'VENDU'],
};

const STATUTS_AVEC_PATIENT: readonly StatutAppareil[] = ['RESERVE', 'EN_ESSAI', 'PRET'];

/** Appareil de retour de réparation : sa destination dépend du patient qui le porte. */
const STATUTS_DE_REPARATION: readonly StatutAppareil[] = ['SAV', 'RETOUR_FABRICANT'];

export interface EtatAppareil {
  readonly statut: StatutAppareil;
  /** Un patient est rattaché à l'appareil. En SAV ou en retour fabricant : l'appareil lui a été vendu. */
  readonly patientRattache: boolean;
}

export type EffetPatient = 'RATTACHER' | 'CONSERVER' | 'DETACHER';

export const CODES_REFUS_TRANSITION = [
  'TRANSITION_INTERDITE',
  'ANNULATION_REQUISE',
  'PATIENT_REQUIS',
  'APPAREIL_DU_PATIENT',
  'APPAREIL_NON_VENDU',
  'PILOTE_PAR_DOSSIER',
] as const;
export type CodeRefusTransition = (typeof CODES_REFUS_TRANSITION)[number];

export const MESSAGES_REFUS_TRANSITION: Readonly<Record<CodeRefusTransition, string>> = {
  TRANSITION_INTERDITE: 'Ce changement de statut n’est pas autorisé.',
  ANNULATION_REQUISE: 'Un appareil vendu ne revient en stock que par une annulation de la vente.',
  PATIENT_REQUIS: 'Choisir un patient.',
  APPAREIL_DU_PATIENT:
    'Cet appareil a été vendu à un patient : il lui revient, il ne peut pas retourner en stock.',
  APPAREIL_NON_VENDU: 'Cet appareil n’a pas été vendu : il ne peut que retourner en stock.',
  PILOTE_PAR_DOSSIER: 'L’essai et la vente se pilotent depuis le dossier du patient.',
};

export type ResultatTransition =
  | { readonly autorisee: true; readonly effetPatient: EffetPatient }
  | { readonly autorisee: false; readonly code: CodeRefusTransition };

function refus(code: CodeRefusTransition): ResultatTransition {
  return { autorisee: false, code };
}

function effetPatient(de: StatutAppareil, vers: StatutAppareil): EffetPatient {
  if (STATUTS_AVEC_PATIENT.includes(vers)) {
    return de === 'EN_STOCK' ? 'RATTACHER' : 'CONSERVER';
  }
  // L'appareil d'essai ou de prêt en panne n'est pas celui du patient : seul un appareil vendu le garde.
  if (vers === 'EN_STOCK' || (vers === 'SAV' && (de === 'EN_ESSAI' || de === 'PRET'))) {
    return 'DETACHER';
  }
  return 'CONSERVER';
}

/** Vérifie un changement de statut. `patientFourni` : un patient a été choisi pour cette opération. */
export function verifierTransition(
  etat: EtatAppareil,
  vers: StatutAppareil,
  patientFourni: boolean,
): ResultatTransition {
  const { statut: de, patientRattache } = etat;
  if (de === 'VENDU' && vers === 'EN_STOCK') {
    return refus('ANNULATION_REQUISE');
  }
  if (!TRANSITIONS[de].includes(vers)) {
    return refus('TRANSITION_INTERDITE');
  }
  if (STATUTS_DE_REPARATION.includes(de)) {
    if (vers === 'EN_STOCK' && patientRattache) {
      return refus('APPAREIL_DU_PATIENT');
    }
    if (vers === 'VENDU' && !patientRattache) {
      return refus('APPAREIL_NON_VENDU');
    }
  }
  const effet = effetPatient(de, vers);
  if (effet === 'RATTACHER' && !patientFourni) {
    return refus('PATIENT_REQUIS');
  }
  return { autorisee: true, effetPatient: effet };
}

/** Changement saisi sur la fiche d'un appareil : essai, achat et vente passent par le dossier et la facture. */
export function verifierTransitionManuelle(
  etat: EtatAppareil,
  vers: StatutAppareil,
  patientFourni: boolean,
): ResultatTransition {
  const resultat = verifierTransition(etat, vers, patientFourni);
  const pilote =
    vers === 'EN_ESSAI' ||
    (etat.statut === 'EN_ESSAI' && vers === 'RESERVE') ||
    (etat.statut === 'RESERVE' && vers === 'VENDU') ||
    (etat.statut === 'VENDU' && vers === 'RESERVE');
  return resultat.autorisee && pilote ? refus('PILOTE_PAR_DOSSIER') : resultat;
}

/** Statuts atteignables depuis la fiche (un patient sera demandé si le statut l'exige). */
export function transitionsPossibles(etat: EtatAppareil): StatutAppareil[] {
  return STATUTS_APPAREIL.filter((vers) => verifierTransitionManuelle(etat, vers, true).autorisee);
}

/** Le patient doit être choisi pour passer à ce statut. */
export function patientAChoisir(etat: EtatAppareil, vers: StatutAppareil): boolean {
  const resultat = verifierTransition(etat, vers, true);
  return resultat.autorisee && resultat.effetPatient === 'RATTACHER';
}

/** Seul un appareil vendu s'annule : il revient en stock, patient détaché, avec un mouvement dédié. */
export function verifierAnnulationVente(statut: StatutAppareil): boolean {
  return statut === 'VENDU';
}

/** Transfert immédiat entre centres : l'appareil doit être disponible, en stock. */
export function peutTransferer(statut: StatutAppareil): boolean {
  return statut === 'EN_STOCK';
}
