import type { Oreille } from './code-prestation';

export const CODES_CONTROLE = [
  'AUCUNE_OREILLE_APPAREILLEE',
  'OFFRE_CLASSE_I_MANQUANTE',
  'PRIX_SUPERIEUR_PRIX_LIMITE',
  'PRIX_SUPERIEUR_PLAFOND_C2S',
  'PRESCRIPTION_ABSENTE',
  'PRESCRIPTION_POSTERIEURE_AU_DEVIS',
  'OREILLE_NON_PRESCRITE',
  'VALIDITE_DEVIS_INSUFFISANTE',
  'BOBINE_T_NON_PRESENTEE',
  'FICHE_TECHNIQUE_MANQUANTE',
  'RENOUVELLEMENT_AVANT_DELAI',
  'TRANCHE_AGE_CHANGE_AVANT_DELIVRANCE',
  'PRESCRIPTEUR_NON_CONFORME',
  'FORMATION_OTOLOGIE_INCONNUE',
  'SPECIALITE_A_CONTROLER',
  'RPPS_PRESCRIPTEUR_MANQUANT',
  'PLAFOND_CONTRAT_RESPONSABLE_DEPASSE',
  'DEPASSEMENT_C2S_A_MENTIONNER',
] as const;
export type CodeControle = (typeof CODES_CONTROLE)[number];

export const LIBELLES_CONTROLES: Readonly<Record<CodeControle, string>> = {
  AUCUNE_OREILLE_APPAREILLEE: 'Le devis ne comporte aucune oreille à appareiller.',
  OFFRE_CLASSE_I_MANQUANTE: 'Proposer au moins une aide auditive de classe I pour cette oreille.',
  PRIX_SUPERIEUR_PRIX_LIMITE: 'Le prix de l’aide de classe I dépasse le prix limite de vente.',
  PRIX_SUPERIEUR_PLAFOND_C2S:
    'Le prix dépasse le prix maximal applicable au bénéficiaire de la C2S.',
  PRESCRIPTION_ABSENTE: 'La prescription médicale préalable est obligatoire.',
  PRESCRIPTION_POSTERIEURE_AU_DEVIS: 'La prescription doit être antérieure au devis.',
  OREILLE_NON_PRESCRITE: 'La prescription ne couvre pas cette oreille du dossier.',
  VALIDITE_DEVIS_INSUFFISANTE: 'Le devis doit rester valable au moins 2 mois.',
  BOBINE_T_NON_PRESENTEE: 'La présentation de la bobine T n’est pas réalisée.',
  FICHE_TECHNIQUE_MANQUANTE: 'La fiche technique doit être jointe au devis.',
  RENOUVELLEMENT_AVANT_DELAI:
    'Moins de 4 ans depuis la dernière délivrance sur cette oreille : pas de prise en charge, sauf renouvellement anticipé accepté par la caisse.',
  TRANCHE_AGE_CHANGE_AVANT_DELIVRANCE:
    'Le patient atteint 20 ans avant la délivrance possible : prix limite et base peuvent changer.',
  PRESCRIPTEUR_NON_CONFORME: 'Le prescripteur ne semble pas habilité pour ce patient (à vérifier).',
  FORMATION_OTOLOGIE_INCONNUE: 'Préciser la formation en otologie du médecin généraliste.',
  SPECIALITE_A_CONTROLER: 'Vérifier que le prescripteur est bien médecin.',
  RPPS_PRESCRIPTEUR_MANQUANT: 'Compléter le numéro RPPS du prescripteur (à vérifier).',
  PLAFOND_CONTRAT_RESPONSABLE_DEPASSE:
    'Le remboursement total dépasse le plafond du contrat responsable (à vérifier).',
  DEPASSEMENT_C2S_A_MENTIONNER:
    'Le devis doit faire apparaître le dépassement restant à la charge du bénéficiaire de la C2S.',
};

/** Résultat d'un contrôle ; `oreille` est `null` s'il concerne tout le devis. */
export interface Constat {
  readonly code: CodeControle;
  readonly oreille: Oreille | null;
}

export function sansDoublons(constats: readonly Constat[]): Constat[] {
  const uniques = new Map(constats.map((c) => [`${c.code}|${String(c.oreille)}`, c]));
  return [...uniques.values()];
}
