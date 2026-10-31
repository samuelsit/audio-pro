import { z } from 'zod';

import { texteObligatoire } from '../commun/texte';

export const NATURES_FORMULAIRE = ['ANAMNESE', 'BENEFICE', 'SATISFACTION'] as const;
export type NatureFormulaire = (typeof NATURES_FORMULAIRE)[number];

export const LIBELLES_NATURES_FORMULAIRE: Readonly<Record<NatureFormulaire, string>> = {
  ANAMNESE: 'Anamnèse',
  BENEFICE: 'Questionnaire de bénéfice',
  SATISFACTION: 'Questionnaire de satisfaction',
};

export const TYPES_QUESTION = ['TEXTE', 'OUI_NON', 'CHOIX', 'ECHELLE'] as const;
export type TypeQuestion = (typeof TYPES_QUESTION)[number];

export const LIBELLES_TYPES_QUESTION: Readonly<Record<TypeQuestion, string>> = {
  TEXTE: 'Texte libre',
  OUI_NON: 'Oui ou non',
  CHOIX: 'Choix dans une liste',
  ECHELLE: 'Échelle',
};

export const MODES_SCORE = ['SOMME', 'MOYENNE'] as const;
export type ModeScore = (typeof MODES_SCORE)[number];

export const LIBELLES_MODES_SCORE: Readonly<Record<ModeScore, string>> = {
  SOMME: 'Somme',
  MOYENNE: 'Moyenne',
};

const identifiantSchema = texteObligatoire('Identifiant manquant.', 40);
const libelleSchema = texteObligatoire('Le libellé est obligatoire.', 300);

const champsQuestion = {
  id: identifiantSchema,
  libelle: libelleSchema,
  obligatoire: z.boolean(),
};

const questionSchema = z.discriminatedUnion(
  'type',
  [
    z.object({ ...champsQuestion, type: z.literal('TEXTE') }),
    z.object({ ...champsQuestion, type: z.literal('OUI_NON') }),
    z.object({
      ...champsQuestion,
      type: z.literal('CHOIX'),
      options: z.array(libelleSchema).min(2, 'Prévoir au moins deux options.'),
    }),
    z
      .object({
        ...champsQuestion,
        type: z.literal('ECHELLE'),
        min: z.number({ error: 'Saisir le minimum.' }).int('Saisir un nombre entier.'),
        max: z.number({ error: 'Saisir le maximum.' }).int('Saisir un nombre entier.'),
      })
      .refine(({ min, max }) => min < max, {
        path: ['max'],
        message: 'Le maximum doit dépasser le minimum.',
      }),
  ],
  { error: 'Type de question inconnu.' },
);
export type Question = z.output<typeof questionSchema>;

const scoreSchema = z.object({
  id: identifiantSchema,
  libelle: libelleSchema,
  mode: z.enum(MODES_SCORE, { error: 'Mode de calcul inconnu.' }),
  questions: z
    .array(
      z.object({
        questionId: identifiantSchema,
        /** Échelle retournée : `min + max - réponse`. */
        inverse: z.boolean(),
      }),
    )
    .min(1, 'Un score porte sur au moins une question.'),
});
export type Score = z.output<typeof scoreSchema>;

export const definitionFormulaireSchema = z
  .object({
    sections: z
      .array(
        z.object({
          titre: libelleSchema,
          questions: z.array(questionSchema).min(1, 'Une section contient au moins une question.'),
        }),
      )
      .min(1, 'Prévoir au moins une section.'),
    scores: z.array(scoreSchema),
  })
  .superRefine(({ sections, scores }, ctx) => {
    const questions = sections.flatMap((s) => s.questions);
    const ids = questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Deux questions portent le même identifiant.',
      });
    }
    const scoresIds = scores.map((s) => s.id);
    if (new Set(scoresIds).size !== scoresIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['scores'],
        message: 'Deux scores portent le même identifiant.',
      });
    }
    scores.forEach((score, indice) => {
      for (const { questionId } of score.questions) {
        const question = questions.find((q) => q.id === questionId);
        if (question?.type !== 'ECHELLE') {
          ctx.addIssue({
            code: 'custom',
            path: ['scores', indice, 'questions'],
            message: `« ${score.libelle} » : un score ne porte que sur des échelles.`,
          });
        }
      }
    });
  });
export type DefinitionFormulaire = z.output<typeof definitionFormulaireSchema>;

export const modeleFormulaireSaisieSchema = z.object({
  nature: z.enum(NATURES_FORMULAIRE, { error: 'Choisir la nature du formulaire.' }),
  nom: texteObligatoire('Le nom est obligatoire.', 120),
  definition: definitionFormulaireSchema,
});
export type ModeleFormulaireSaisie = z.output<typeof modeleFormulaireSaisieSchema>;

/** Réponses stockées, relues à chaque déchiffrement. */
export const reponsesSchema = z.record(z.string(), z.union([z.string(), z.number()]));
export type Reponses = z.output<typeof reponsesSchema>;

export const REPONSE_OUI = 'OUI';
export const REPONSE_NON = 'NON';
const LONGUEUR_MAX_REPONSE = 2000;

function erreurReponse(question: Question, valeur: string): string | null {
  switch (question.type) {
    case 'TEXTE':
      return valeur.length > LONGUEUR_MAX_REPONSE
        ? `${String(LONGUEUR_MAX_REPONSE)} caractères au maximum.`
        : null;
    case 'OUI_NON':
      return [REPONSE_OUI, REPONSE_NON].includes(valeur) ? null : 'Répondre par oui ou par non.';
    case 'CHOIX':
      return question.options.includes(valeur) ? null : 'Choisir une option de la liste.';
    case 'ECHELLE': {
      const nombre = Number(valeur);
      return Number.isInteger(nombre) && nombre >= question.min && nombre <= question.max
        ? null
        : `Saisir un entier de ${String(question.min)} à ${String(question.max)}.`;
    }
  }
}

export type ResultatReponses =
  | { readonly valide: true; readonly reponses: Reponses }
  | { readonly valide: false; readonly erreurs: Readonly<Record<string, readonly string[]>> };

/**
 * Valide une saisie au regard de la version du modèle : la structure varie d'un client à l'autre,
 * un schéma figé ne peut pas la décrire. Une réponse vide est omise.
 */
export function validerReponses(
  definition: DefinitionFormulaire,
  saisie: Readonly<Record<string, string | undefined>>,
): ResultatReponses {
  const reponses: Record<string, string | number> = {};
  const erreurs: Record<string, string[]> = {};
  for (const question of definition.sections.flatMap((s) => s.questions)) {
    const valeur = saisie[question.id]?.trim() ?? '';
    if (valeur === '') {
      if (question.obligatoire) {
        erreurs[question.id] = ['Réponse obligatoire.'];
      }
      continue;
    }
    const erreur = erreurReponse(question, valeur);
    if (erreur !== null) {
      erreurs[question.id] = [erreur];
      continue;
    }
    reponses[question.id] = question.type === 'ECHELLE' ? Number(valeur) : valeur;
  }
  return Object.keys(erreurs).length > 0 ? { valide: false, erreurs } : { valide: true, reponses };
}

export interface ResultatScore {
  readonly id: string;
  readonly libelle: string;
  /** `null` : une question du score est sans réponse, aucune estimation. */
  readonly valeur: number | null;
}

function valeurScore(
  score: Score,
  questions: readonly Question[],
  reponses: Reponses,
): number | null {
  let somme = 0;
  for (const { questionId, inverse } of score.questions) {
    const question = questions.find((q) => q.id === questionId);
    const reponse = reponses[questionId];
    if (question?.type !== 'ECHELLE' || typeof reponse !== 'number') {
      return null;
    }
    somme += inverse ? question.min + question.max - reponse : reponse;
  }
  return score.mode === 'SOMME' ? somme : somme / score.questions.length;
}

/** Scores recalculés à chaque lecture, d'après la version du modèle à laquelle on a répondu. */
export function calculerScores(
  definition: DefinitionFormulaire,
  reponses: Reponses,
): ResultatScore[] {
  const questions = definition.sections.flatMap((s) => s.questions);
  return definition.scores.map((score) => ({
    id: score.id,
    libelle: score.libelle,
    valeur: valeurScore(score, questions, reponses),
  }));
}

export function formaterScore(valeur: number | null): string {
  return valeur === null ? 'Incomplet' : String(Number(valeur.toFixed(1))).replace('.', ',');
}

/** Réponse affichable d'une question, ou tiret sans réponse. */
export function libelleReponse(question: Question, reponses: Reponses): string {
  const reponse = reponses[question.id];
  if (reponse === undefined) {
    return '—';
  }
  if (question.type === 'OUI_NON') {
    return reponse === REPONSE_OUI ? 'Oui' : 'Non';
  }
  return String(reponse);
}

export interface ModeleParDefaut {
  readonly code: string;
  readonly nature: NatureFormulaire;
  readonly nom: string;
  readonly definition: DefinitionFormulaire;
}

const NOTE_DE_0_A_10 = { type: 'ECHELLE', min: 0, max: 10, obligatoire: false } as const;

/**
 * Modèles copiés chez un client à son premier bilan, ensuite libres d'évoluer.
 * À VÉRIFIER : propositions à relire par un audioprothésiste. Aucun questionnaire validé n'est repris (R26).
 */
export const MODELES_PAR_DEFAUT: readonly ModeleParDefaut[] = [
  {
    code: 'ANAMNESE_STANDARD',
    nature: 'ANAMNESE',
    nom: 'Anamnèse standard',
    definition: {
      sections: [
        {
          titre: 'Antécédents ORL',
          questions: [
            {
              id: 'otites',
              libelle: 'Otites à répétition',
              type: 'OUI_NON',
              obligatoire: false,
            },
            {
              id: 'chirurgie',
              libelle: 'Chirurgie de l’oreille',
              type: 'OUI_NON',
              obligatoire: false,
            },
            {
              id: 'exposition',
              libelle: 'Exposition prolongée au bruit',
              type: 'OUI_NON',
              obligatoire: false,
            },
            {
              id: 'vertiges',
              libelle: 'Vertiges ou troubles de l’équilibre',
              type: 'OUI_NON',
              obligatoire: false,
            },
            {
              id: 'antecedents_notes',
              libelle: 'Précisions',
              type: 'TEXTE',
              obligatoire: false,
            },
          ],
        },
        {
          titre: 'Gêne ressentie',
          questions: [
            {
              id: 'gene_calme',
              libelle: 'Gêne dans le calme',
              ...NOTE_DE_0_A_10,
            },
            {
              id: 'gene_bruit',
              libelle: 'Gêne dans le bruit',
              ...NOTE_DE_0_A_10,
            },
            {
              id: 'gene_notes',
              libelle: 'Situations les plus gênantes',
              type: 'TEXTE',
              obligatoire: false,
            },
          ],
        },
        {
          titre: 'Environnement sonore',
          questions: [
            {
              id: 'environnement',
              libelle: 'Environnement habituel',
              type: 'CHOIX',
              options: ['Calme', 'Variable', 'Bruyant'],
              obligatoire: false,
            },
            {
              id: 'environnement_notes',
              libelle: 'Activités et lieux fréquentés',
              type: 'TEXTE',
              obligatoire: false,
            },
          ],
        },
        {
          titre: 'Acouphènes',
          questions: [
            {
              id: 'acouphenes',
              libelle: 'Présence d’acouphènes',
              type: 'OUI_NON',
              obligatoire: false,
            },
            {
              id: 'acouphenes_cote',
              libelle: 'Côté',
              type: 'CHOIX',
              options: ['Droite', 'Gauche', 'Des deux côtés'],
              obligatoire: false,
            },
            {
              id: 'acouphenes_gene',
              libelle: 'Gêne due aux acouphènes',
              ...NOTE_DE_0_A_10,
            },
          ],
        },
        {
          titre: 'Appareillage antérieur',
          questions: [
            {
              id: 'deja_appareille',
              libelle: 'Déjà appareillé',
              type: 'OUI_NON',
              obligatoire: false,
            },
            {
              id: 'appareillage_notes',
              libelle: 'Appareils, ancienneté, ressenti',
              type: 'TEXTE',
              obligatoire: false,
            },
          ],
        },
      ],
      scores: [],
    },
  },
  {
    code: 'BENEFICE_SIMPLE',
    nature: 'BENEFICE',
    nom: 'Bénéfice ressenti',
    definition: {
      sections: [
        {
          titre: 'Depuis votre appareillage',
          questions: [
            {
              id: 'benefice_calme',
              libelle: 'Compréhension dans le calme',
              ...NOTE_DE_0_A_10,
            },
            {
              id: 'benefice_bruit',
              libelle: 'Compréhension dans le bruit',
              ...NOTE_DE_0_A_10,
            },
            {
              id: 'benefice_quotidien',
              libelle: 'Vie quotidienne',
              ...NOTE_DE_0_A_10,
            },
          ],
        },
      ],
      scores: [
        {
          id: 'benefice_global',
          libelle: 'Bénéfice global',
          mode: 'MOYENNE',
          questions: [
            { questionId: 'benefice_calme', inverse: false },
            { questionId: 'benefice_bruit', inverse: false },
            { questionId: 'benefice_quotidien', inverse: false },
          ],
        },
      ],
    },
  },
  {
    code: 'SATISFACTION_SIMPLE',
    nature: 'SATISFACTION',
    nom: 'Satisfaction',
    definition: {
      sections: [
        {
          titre: 'Votre appréciation',
          questions: [
            {
              id: 'satisfaction_confort',
              libelle: 'Confort des appareils',
              ...NOTE_DE_0_A_10,
            },
            {
              id: 'satisfaction_son',
              libelle: 'Qualité du son',
              ...NOTE_DE_0_A_10,
            },
            {
              id: 'satisfaction_suivi',
              libelle: 'Suivi par le centre',
              ...NOTE_DE_0_A_10,
            },
          ],
        },
      ],
      scores: [
        {
          id: 'satisfaction_globale',
          libelle: 'Satisfaction globale',
          mode: 'MOYENNE',
          questions: [
            { questionId: 'satisfaction_confort', inverse: false },
            { questionId: 'satisfaction_son', inverse: false },
            { questionId: 'satisfaction_suivi', inverse: false },
          ],
        },
      ],
    },
  },
];
