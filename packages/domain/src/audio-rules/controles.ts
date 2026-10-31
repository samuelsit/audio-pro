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
  'OPTIONS_100_SANTE_INSUFFISANTES',
  'LIGNE_NON_REMBOURSABLE_OFFRE_100_SANTE',
  'FICHE_CATALOGUE_INCOMPLETE',
  'DATE_PRECEDENT_APPAREILLAGE_MANQUANTE',
  'IDENTIFICATION_ENTREPRISE_INCOMPLETE',
  'IDENTIFIANTS_ENTREPRISE_A_COMPLETER',
  'RENOUVELLEMENT_AVANT_DELAI',
  'TRANCHE_AGE_CHANGE_AVANT_DELIVRANCE',
  'PRESCRIPTEUR_NON_CONFORME',
  'FORMATION_OTOLOGIE_INCONNUE',
  'SPECIALITE_A_CONTROLER',
  'RPPS_PRESCRIPTEUR_MANQUANT',
  'PLAFOND_CONTRAT_RESPONSABLE_DEPASSE',
  'DEPASSEMENT_C2S_A_MENTIONNER',
  'COUVERTURE_AMO_ABSENTE',
  'COUVERTURE_AMO_A_CONFIRMER',
  'DROITS_AMO_NON_OUVERTS',
  'DROITS_AMO_FIN_INCONNUE',
  'DEVIS_NON_SIGNE',
  'NUMERO_SERIE_MANQUANT',
  'VENTILATION_INCOHERENTE',
  'TARIF_LPP_INDISPONIBLE',
  'CODE_LPP_GENERIQUE',
  'ARTICLE_SANS_CODE_LPP',
  'ECART_AMO_DEVIS',
  'RESTE_A_CHARGE_CLASSE_I',
  'PEC_MANQUANTE',
  'PEC_EN_ATTENTE',
  'PEC_REFUSEE',
  'PEC_SANS_JUSTIFICATIF',
  'PEC_SUPERIEURE_AU_RESTE',
] as const;
export type CodeControle = (typeof CODES_CONTROLE)[number];

export const LIBELLES_CONTROLES: Readonly<Record<CodeControle, string>> = {
  AUCUNE_OREILLE_APPAREILLEE: 'Le devis ne comporte aucune oreille à appareiller.',
  OFFRE_CLASSE_I_MANQUANTE:
    'L’offre 100 % santé doit proposer une aide de classe I pour cette oreille.',
  PRIX_SUPERIEUR_PRIX_LIMITE: 'Le prix de l’aide de classe I dépasse le prix limite de vente.',
  PRIX_SUPERIEUR_PLAFOND_C2S:
    'Le prix dépasse le prix maximal applicable au bénéficiaire de la C2S.',
  PRESCRIPTION_ABSENTE: 'La prescription médicale préalable est obligatoire.',
  PRESCRIPTION_POSTERIEURE_AU_DEVIS: 'La prescription doit être antérieure au devis.',
  OREILLE_NON_PRESCRITE: 'La prescription ne couvre pas cette oreille du dossier.',
  VALIDITE_DEVIS_INSUFFISANTE: 'Le devis doit rester valable au moins 2 mois.',
  BOBINE_T_NON_PRESENTEE: 'La présentation de la bobine T n’est pas réalisée.',
  FICHE_TECHNIQUE_MANQUANTE: 'La fiche technique doit être jointe au devis.',
  OPTIONS_100_SANTE_INSUFFISANTES:
    'L’aide de l’offre 100 % santé doit disposer d’au moins 3 options parmi les 8 du devis normalisé.',
  LIGNE_NON_REMBOURSABLE_OFFRE_100_SANTE:
    'L’offre 100 % santé ne peut mentionner que des produits remboursables (code LPP requis).',
  FICHE_CATALOGUE_INCOMPLETE:
    'Compléter la fiche du catalogue : le devis normalisé exige ces mentions (adresse, marque, référence, caractéristiques).',
  DATE_PRECEDENT_APPAREILLAGE_MANQUANTE: 'Indiquer la date du précédent appareillage.',
  IDENTIFICATION_ENTREPRISE_INCOMPLETE:
    'Compléter la raison sociale et le SIRET du centre (écran d’administration des centres).',
  IDENTIFIANTS_ENTREPRISE_A_COMPLETER:
    'Vérifier le RCS, le FINESS et le n° de TVA intracommunautaire du centre (à vérifier).',
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
  COUVERTURE_AMO_ABSENTE: 'Renseigner la couverture AMO du patient.',
  COUVERTURE_AMO_A_CONFIRMER:
    'Couverture AMO à vérifier : relire la carte Vitale ou confirmer la saisie.',
  DROITS_AMO_NON_OUVERTS: 'Les droits AMO ne couvrent pas la date de délivrance.',
  DROITS_AMO_FIN_INCONNUE: 'La date de fin des droits AMO n’est pas renseignée.',
  DEVIS_NON_SIGNE: 'Le dossier n’a pas de devis signé avec une offre retenue.',
  NUMERO_SERIE_MANQUANT: 'Numéro de série manquant.',
  VENTILATION_INCOHERENTE: 'AMO + AMC + reste à charge ne font pas le prix TTC.',
  TARIF_LPP_INDISPONIBLE: 'La base LPP importée ne couvre pas la date de délivrance.',
  CODE_LPP_GENERIQUE:
    'Code LPP générique, de nature RJT : le code à facturer reste à confirmer (à vérifier).',
  ARTICLE_SANS_CODE_LPP: 'Article sans tarif LPP à cette date : aucun remboursement.',
  ECART_AMO_DEVIS: 'La part AMO diffère de celle du devis signé.',
  RESTE_A_CHARGE_CLASSE_I:
    'Reste à charge sur une aide de classe I malgré un contrat responsable : vérifier la prise en charge.',
  PEC_MANQUANTE: 'Renseigner la prise en charge complémentaire.',
  PEC_EN_ATTENTE: 'Prise en charge complémentaire demandée, réponse en attente.',
  PEC_REFUSEE: 'Prise en charge complémentaire refusée : la part AMC revient au patient.',
  PEC_SANS_JUSTIFICATIF: 'Joindre le justificatif de la prise en charge complémentaire.',
  PEC_SUPERIEURE_AU_RESTE: 'Le montant accordé dépasse ce qui reste après l’AMO : il a été écrêté.',
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
