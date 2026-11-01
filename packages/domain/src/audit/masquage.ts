import type { TypeEntite } from './actions';

/** Valeur que le journal d'audit peut stocker (JSON). */
export type ValeurJson =
  string | number | boolean | null | readonly ValeurJson[] | { readonly [cle: string]: ValeurJson };

export const VALEUR_MASQUEE = '[masqué]';

// Filet de sécurité, pas une validation : toute valeur qui ressemble à un NIR est masquée.
// Forme retenue : 1er chiffre 1, 2, 3, 4, 7 ou 8, puis 12 caractères (département 2A/2B compris),
// suivis éventuellement de la clé ; espaces ignorés. Volontairement large.
// À VÉRIFIER : format du NIR absent de docs/ref.
const NIR = /(?<!\d)[1-478]\d{4}(?:\d{2}|2[AB])\d{6}\d{0,2}(?!\d)/i;

export function contientNir(texte: string): boolean {
  return NIR.test(texte.replace(/\s+/g, ''));
}

/**
 * Rend une valeur quelconque stockable dans le journal : `undefined` devient `null`, les objets
 * sont parcourus, et toute chaîne qui contient un NIR est remplacée par « [masqué] ».
 */
export function assainirPourAudit(valeur: unknown): ValeurJson {
  if (valeur === null || valeur === undefined) {
    return null;
  }
  if (typeof valeur === 'string') {
    return contientNir(valeur) ? VALEUR_MASQUEE : valeur;
  }
  if (typeof valeur === 'number' || typeof valeur === 'boolean') {
    return valeur;
  }
  if (Array.isArray(valeur)) {
    return valeur.map(assainirPourAudit);
  }
  if (typeof valeur === 'object') {
    return Object.fromEntries(
      Object.entries(valeur).map(([cle, v]) => [cle, assainirPourAudit(v)]),
    );
  }
  return VALEUR_MASQUEE;
}

/**
 * Champs dont la valeur peut figurer en clair dans le journal, par type d'entité (liste blanche).
 * Tout autre champ modifié est journalisé sans sa valeur. Patients et dossiers : rien en clair
 * (données de santé), sauf le centre de rattachement d'un patient (identifiant technique).
 */
export const CHAMPS_VISIBLES_AUDIT: Readonly<Record<TypeEntite, readonly string[]>> = {
  ORGANISATION: ['raisonSociale', 'siren', 'statut'],
  CENTRE: [
    'nom',
    'adresseLigne1',
    'adresseLigne2',
    'codePostal',
    'ville',
    'finess',
    'numeroFacturationAm',
    'raisonSociale',
    'siret',
    'rcs',
    'tvaIntracommunautaire',
    'email',
    'telephone',
    'horairesOuverture',
    'actif',
  ],
  UTILISATEUR: [
    'prenom',
    'nom',
    'email',
    'role',
    'actif',
    'centreIds',
    'doitChangerMotDePasse',
    'deuxFacteursActif',
  ],
  PRATICIEN: ['utilisateurId', 'rpps', 'adeli', 'centreIds', 'horaires'],
  SESSION: [],
  JOURNAL_AUDIT: [],
  PATIENT: ['centreId'],
  DOSSIER: [],
  PRESCRIPTION: [],
  DEVIS: [],
  ESSAI: [],
  FACTURE_PREPAREE: [],
  FACTURE: ['numero', 'nature', 'motif'],
  FSE: ['statut'],
  ENCAISSEMENT: ['mode', 'montantCentimes'],
  CREANCE: ['type', 'statut', 'montantCentimes', 'nature', 'resolution'],
  REGLEMENT_ORGANISME: ['partAmoCentimes', 'partAmcCentimes', 'montantCentimes'],
  COMPLEMENTAIRE: ['nom', 'identifiant', 'modePec', 'actif'],
  CAISSE: [],
  PARAMETRES_COMPTABLES: [],
  TAUX_TVA: ['type', 'taux', 'debut'],
  SERIE_FACTURE: ['prefixe'],
  FABRICANT: ['nom', 'adresse', 'mandataire', 'actif'],
  MODELE_AIDE_AUDITIVE: [
    'fabricantId',
    'gamme',
    'nom',
    'type',
    'classe',
    'codesLpp',
    'prixConseilleCentimes',
    'marque',
    'referenceCommerciale',
    'lieuFabrication',
    'nombreCanaux',
    'connectivite',
    'antiLarsen',
    'reducteurAcouphenes',
    'bobineT',
    'options',
    'actif',
  ],
  ACCESSOIRE: [
    'nom',
    'nature',
    'codeLpp',
    'prixCentimes',
    'fournisseurId',
    'marque',
    'referenceCommerciale',
    'actif',
  ],
  PRESCRIPTEUR: [
    'nom',
    'prenom',
    'rpps',
    'specialite',
    'formationOtologie',
    'cabinet',
    'contact',
    'actif',
  ],
  // Le prix d'achat et les motifs restent hors liste blanche.
  APPAREIL: [
    'numeroSerie',
    'modeleId',
    'referenceBonLivraison',
    'referenceFactureFabricant',
    'enConsignation',
  ],
  RENDEZ_VOUS: [
    'centreId',
    'typeRdvId',
    'praticienId',
    'cabineId',
    'debut',
    'fin',
    'statut',
    'origine',
  ],
  TYPE_RDV: [
    'nom',
    'dureeMinutes',
    'couleur',
    'requierePraticien',
    'requiereCabine',
    'reservableEnLigne',
    'delaiMinimalMinutes',
    'natureEssai',
    'actif',
  ],
  CABINE: ['centreId', 'nom', 'actif'],
  BILAN_AUDIOLOGIQUE: [],
  MESURE_AUDIOLOGIQUE: [],
  OTOSCOPIE: [],
  MODELE_FORMULAIRE: ['nom', 'nature', 'version', 'actif'],
  REPONSE_FORMULAIRE: [],
  PARAMETRES_RESERVATION: [
    'actif',
    'delaiMinimalMinutes',
    'horizonJours',
    'validation',
    'delaiModificationHeures',
    'typeRdvIds',
    'slug',
  ],
  EXCEPTION_AGENDA: ['type', 'praticienId', 'cabineId', 'centreId', 'debut', 'fin'],
  STOCK_ACCESSOIRE: [],
  INVENTAIRE: [],
  FOURNISSEUR: [],
  CENTRALE_ACHAT: [],
  PARAMETRES_COMMANDE: [],
  REGLE_COMMANDE: [],
  COMMANDE: [],
  RECEPTION_COMMANDE: [],
  ECART_ACHAT: [],
  FACTURE_FOURNISSEUR: [],
  RELEVE_CENTRALE: [],
  SEUIL_STOCK: [],
  GARANTIE_APPAREIL: [],
  PARAMETRES_SAV: [],
};

export interface ChampModifie {
  readonly champ: string;
  readonly masque: boolean;
  readonly avant?: ValeurJson;
  readonly apres?: ValeurJson;
}

export type Instantane = Readonly<Record<string, unknown>>;

/** Comparaison de valeurs, insensible à l'ordre des listes (ex. centres). */
function cleComparaison(valeur: ValeurJson): string {
  return JSON.stringify(
    Array.isArray(valeur) ? valeur.map((v) => JSON.stringify(v)).sort() : valeur,
  );
}

/**
 * Champs modifiés entre deux états d'une entité (`avant` nul : création ; `apres` nul : suppression).
 * Les valeurs hors liste blanche sont omises (`masque: true`) ; les autres passent par le filet NIR.
 */
export function differencesAuditees(
  type: TypeEntite,
  avant: Instantane | null,
  apres: Instantane | null,
): ChampModifie[] {
  const visibles = CHAMPS_VISIBLES_AUDIT[type];
  const champs = [...new Set([...Object.keys(apres ?? {}), ...Object.keys(avant ?? {})])];
  const differences: ChampModifie[] = [];
  for (const champ of champs) {
    const valeurAvant = assainirPourAudit(avant?.[champ]);
    const valeurApres = assainirPourAudit(apres?.[champ]);
    if (cleComparaison(valeurAvant) === cleComparaison(valeurApres)) {
      continue;
    }
    if (!visibles.includes(champ)) {
      differences.push({ champ, masque: true });
      continue;
    }
    differences.push({
      champ,
      masque: false,
      ...(avant ? { avant: valeurAvant } : {}),
      ...(apres ? { apres: valeurApres } : {}),
    });
  }
  return differences;
}

function valeurLisible(valeur: ValeurJson | undefined): string {
  if (valeur === undefined || valeur === null || valeur === '') {
    return '(vide)';
  }
  if (typeof valeur === 'boolean') {
    return valeur ? 'oui' : 'non';
  }
  if (Array.isArray(valeur)) {
    return valeur.length === 0 ? '(vide)' : valeur.map(valeurLisible).join(', ');
  }
  return typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
}

/** Résumé d'une ligne pour l'écran et l'export : « nom : A → B ; motDePasse : modifié ». */
export function resumerChampsModifies(champs: readonly ChampModifie[]): string {
  return champs
    .map((c) => {
      if (c.masque) {
        return `${c.champ} : modifié`;
      }
      if (!('avant' in c)) {
        return `${c.champ} : ${valeurLisible(c.apres)}`;
      }
      if (!('apres' in c)) {
        return `${c.champ} : ${valeurLisible(c.avant)} → (supprimé)`;
      }
      return `${c.champ} : ${valeurLisible(c.avant)} → ${valeurLisible(c.apres)}`;
    })
    .join(' ; ');
}
