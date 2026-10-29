import type { Chiffreur } from './chiffreur';

/**
 * Champs chiffrés par modèle Prisma (nom du modèle tel que dans le schéma), avec leur contexte :
 * `{ Patient: { nir: 'patient.nir' } }`. Les colonnes sont de type texte.
 */
export type ConfigurationChampsChiffres = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

export class ErreurChampChiffre extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurChampChiffre';
  }
}

interface ParametresOperation {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

type Objet = Record<string, unknown>;

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

const OPERATIONS_LECTURE_RESULTAT = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createManyAndReturn',
  'update',
  'updateManyAndReturn',
  'upsert',
  'delete',
]);

/**
 * Gestionnaire `$allOperations` : chiffre les champs configurés à l'écriture, les déchiffre à la lecture
 * et refuse tout filtre ou tri sur un champ chiffré (impossible sur un chiffré aléatoire).
 * Limite : les écritures et lectures imbriquées via une relation ne sont pas traitées ; on lit et on écrit
 * le modèle chiffré directement. Chaque colonne chiffrée porte en plus une contrainte CHECK en base.
 */
export function gestionnaireChampsChiffres(
  chiffreur: Chiffreur,
  configuration: ConfigurationChampsChiffres,
) {
  return async ({ model, operation, args, query }: ParametresOperation): Promise<unknown> => {
    const champs = model === undefined ? undefined : configuration[model];
    if (!champs) {
      return query(args);
    }

    const chiffrerDonnees = (donnees: unknown): unknown => {
      if (Array.isArray(donnees)) {
        return donnees.map(chiffrerDonnees);
      }
      if (!estObjet(donnees)) {
        return donnees;
      }
      const resultat: Objet = { ...donnees };
      for (const [champ, contexte] of Object.entries(champs)) {
        const valeur = resultat[champ];
        if (valeur === undefined || valeur === null) {
          continue;
        }
        if (typeof valeur === 'string') {
          resultat[champ] = chiffreur.chiffrer(valeur, contexte);
        } else if (estObjet(valeur) && typeof valeur.set === 'string') {
          resultat[champ] = { set: chiffreur.chiffrer(valeur.set, contexte) };
        } else if (!(estObjet(valeur) && valeur.set === null)) {
          throw new ErreurChampChiffre(
            `${model}.${champ} : seule une valeur texte peut être chiffrée.`,
          );
        }
      }
      return resultat;
    };

    const dechiffrerLigne = (ligne: unknown): unknown => {
      if (!estObjet(ligne)) {
        return ligne;
      }
      const resultat: Objet = { ...ligne };
      for (const [champ, contexte] of Object.entries(champs)) {
        const valeur = resultat[champ];
        if (typeof valeur === 'string') {
          resultat[champ] = chiffreur.dechiffrer(valeur, contexte);
        }
      }
      return resultat;
    };

    const nomsChiffres = Object.keys(champs);
    const verifierCritere = (critere: unknown, usage: string): void => {
      if (Array.isArray(critere)) {
        critere.forEach((c) => verifierCritere(c, usage));
        return;
      }
      if (!estObjet(critere)) {
        return;
      }
      for (const [cle, valeur] of Object.entries(critere)) {
        if (nomsChiffres.includes(cle)) {
          throw new ErreurChampChiffre(`${model}.${cle} est chiffré : ${usage} impossible.`);
        }
        if (cle === 'AND' || cle === 'OR' || cle === 'NOT') {
          verifierCritere(valeur, usage);
        }
      }
    };

    const a: Objet = estObjet(args) ? { ...args } : {};
    verifierCritere(a.where, 'filtre');
    verifierCritere(a.cursor, 'filtre');
    verifierCritere(a.orderBy, 'tri');
    for (const cle of ['distinct', 'by'] as const) {
      const liste = [a[cle]].flat();
      const interdit = liste.find((c) => typeof c === 'string' && nomsChiffres.includes(c));
      if (typeof interdit === 'string') {
        throw new ErreurChampChiffre(`${model}.${interdit} est chiffré : regroupement impossible.`);
      }
    }
    if ('data' in a) {
      a.data = chiffrerDonnees(a.data);
    }
    if (operation === 'upsert') {
      a.create = chiffrerDonnees(a.create);
      a.update = chiffrerDonnees(a.update);
    }

    const resultat = await query(estObjet(args) ? a : args);
    if (!OPERATIONS_LECTURE_RESULTAT.has(operation)) {
      return resultat;
    }
    return Array.isArray(resultat) ? resultat.map(dechiffrerLigne) : dechiffrerLigne(resultat);
  };
}

/**
 * Extension Prisma (`prisma.$extends(extensionChampsChiffres(chiffreur, config))`).
 * Objet littéral, sans dépendance au client généré.
 */
export function extensionChampsChiffres(
  chiffreur: Chiffreur,
  configuration: ConfigurationChampsChiffres,
) {
  return {
    name: 'champs-chiffres',
    query: { $allModels: { $allOperations: gestionnaireChampsChiffres(chiffreur, configuration) } },
  };
}
