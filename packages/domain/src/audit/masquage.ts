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
 * par défaut (données de santé).
 */
export const CHAMPS_VISIBLES_AUDIT: Readonly<Record<TypeEntite, readonly string[]>> = {
  CENTRE: [
    'nom',
    'adresseLigne1',
    'adresseLigne2',
    'codePostal',
    'ville',
    'finess',
    'numeroFacturationAm',
    'email',
    'telephone',
    'actif',
  ],
  UTILISATEUR: ['prenom', 'nom', 'email', 'role', 'actif', 'centreIds', 'doitChangerMotDePasse'],
  PRATICIEN: ['utilisateurId', 'rpps', 'adeli', 'centreIds'],
  SESSION: [],
  JOURNAL_AUDIT: [],
  PATIENT: [],
  DOSSIER: [],
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
