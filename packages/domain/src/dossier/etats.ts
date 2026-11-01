export const STATUTS_DOSSIER = [
  'BROUILLON',
  'PRESCRIPTION_OK',
  'DEVIS_EMIS',
  'EN_ESSAI',
  'DEVIS_SIGNE',
  'A_FACTURER',
  'FACTURE',
  'CLOS',
  'ABANDONNE',
] as const;
export type StatutDossier = (typeof STATUTS_DOSSIER)[number];

export const LIBELLES_STATUTS_DOSSIER: Readonly<Record<StatutDossier, string>> = {
  BROUILLON: 'Brouillon',
  PRESCRIPTION_OK: 'Prescription OK',
  DEVIS_EMIS: 'Devis émis',
  EN_ESSAI: 'En essai',
  DEVIS_SIGNE: 'Devis signé',
  A_FACTURER: 'À facturer',
  FACTURE: 'Facturé',
  CLOS: 'Clos',
  ABANDONNE: 'Abandonné',
};

/** Parcours du dossier, dans l'ordre. ABANDONNE n'en fait pas partie. */
export const ETAPES_DOSSIER: readonly StatutDossier[] = STATUTS_DOSSIER.filter(
  (statut) => statut !== 'ABANDONNE',
);

/** Une fois le dossier à facturer, l'aide est délivrée : un abandon n'a plus de sens. */
const ABANDON_POSSIBLE: readonly StatutDossier[] = [
  'BROUILLON',
  'PRESCRIPTION_OK',
  'DEVIS_EMIS',
  'EN_ESSAI',
  'DEVIS_SIGNE',
];

/** Une nouvelle prescription changerait la base d'un devis déjà émis. */
const PRESCRIPTION_MODIFIABLE: readonly StatutDossier[] = ['BROUILLON', 'PRESCRIPTION_OK'];

export const MESSAGE_TRANSITION_DOSSIER_REFUSEE = 'Ce changement de statut n’est pas autorisé.';

/**
 * Le dossier passe à l'étape suivante, sans en sauter, ou est abandonné. Deux retours arrière : un devis
 * signé remplacé par une nouvelle version, dont la signature reste à recueillir (ADR-012), et un avoir
 * total, qui annule la vente et rouvre la facturation (ADR-028).
 * L'essai précède la signature : modele-devis-audio.pdf p. 1 et p. 2 § 5.
 * L'enchaînement reste un choix d'organisation (ADR-011), pas une règle réglementaire.
 */
export function transitionDossierAutorisee(de: StatutDossier, vers: StatutDossier): boolean {
  if (vers === 'ABANDONNE') {
    return ABANDON_POSSIBLE.includes(de);
  }
  if (
    (de === 'DEVIS_SIGNE' && vers === 'EN_ESSAI') ||
    (de === 'FACTURE' && vers === 'A_FACTURER')
  ) {
    return true;
  }
  const rang = ETAPES_DOSSIER.indexOf(de);
  return rang !== -1 && ETAPES_DOSSIER[rang + 1] === vers;
}

export function prescriptionModifiable(statut: StatutDossier): boolean {
  return PRESCRIPTION_MODIFIABLE.includes(statut);
}

/** Dossier sorti du parcours actif : il n'attend plus rien. */
export function dossierEnCours(statut: StatutDossier): boolean {
  return statut !== 'CLOS' && statut !== 'ABANDONNE';
}

export interface PassageStatut {
  readonly statut: StatutDossier;
  /** Instant ISO du passage. */
  readonly horodatage: string;
}

export type EtatEtape = 'FAITE' | 'COURANTE' | 'A_VENIR';

export interface EtapeFrise {
  readonly statut: StatutDossier;
  readonly etat: EtatEtape;
  readonly horodatage: string | null;
}

/** Frise du dossier. Un dossier abandonné n'a pas d'étape courante : son abandon s'affiche à part. */
export function friseDossier(
  statut: StatutDossier,
  passages: readonly PassageStatut[],
): EtapeFrise[] {
  return ETAPES_DOSSIER.map((etape) => {
    const passage = passages.find((p) => p.statut === etape);
    const etat: EtatEtape =
      etape === statut ? 'COURANTE' : passage === undefined ? 'A_VENIR' : 'FAITE';
    return { statut: etape, etat, horodatage: passage?.horodatage ?? null };
  });
}
