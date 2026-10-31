import { describe, expect, it } from 'vitest';

import {
  calculerScores,
  definitionFormulaireSchema,
  formaterScore,
  libelleReponse,
  MODELES_PAR_DEFAUT,
  validerReponses,
  type DefinitionFormulaire,
  type Question,
} from './formulaire';

const DEFINITION: DefinitionFormulaire = {
  sections: [
    {
      titre: 'Section',
      questions: [
        { id: 'texte', libelle: 'Texte', type: 'TEXTE', obligatoire: true },
        { id: 'oui', libelle: 'Oui ?', type: 'OUI_NON', obligatoire: false },
        {
          id: 'choix',
          libelle: 'Choix',
          type: 'CHOIX',
          options: ['A', 'B'],
          obligatoire: false,
        },
        { id: 'e1', libelle: 'E1', type: 'ECHELLE', min: 0, max: 10, obligatoire: false },
        { id: 'e2', libelle: 'E2', type: 'ECHELLE', min: 1, max: 5, obligatoire: false },
      ],
    },
  ],
  scores: [
    {
      id: 'somme',
      libelle: 'Somme',
      mode: 'SOMME',
      questions: [
        { questionId: 'e1', inverse: false },
        { questionId: 'e2', inverse: true },
      ],
    },
    {
      id: 'moyenne',
      libelle: 'Moyenne',
      mode: 'MOYENNE',
      questions: [
        { questionId: 'e1', inverse: false },
        { questionId: 'e2', inverse: false },
      ],
    },
  ],
};

describe('definitionFormulaireSchema', () => {
  it('accepte une définition valide', () => {
    expect(definitionFormulaireSchema.safeParse(DEFINITION).success).toBe(true);
  });

  it.each(MODELES_PAR_DEFAUT.map((m) => ({ code: m.code, definition: m.definition })))(
    'modèle livré $code',
    ({ definition }) => {
      expect(definitionFormulaireSchema.safeParse(definition).success).toBe(true);
    },
  );

  it('l’anamnèse livrée couvre les cinq rubriques demandées', () => {
    const anamnese = MODELES_PAR_DEFAUT.find((m) => m.nature === 'ANAMNESE');
    expect(anamnese?.definition.sections.map((s) => s.titre)).toEqual([
      'Antécédents ORL',
      'Gêne ressentie',
      'Environnement sonore',
      'Acouphènes',
      'Appareillage antérieur',
    ]);
  });

  const question = { id: 'q', libelle: 'Q', obligatoire: false };
  const section = (questions: unknown[]) => ({ titre: 'S', questions });

  it.each([
    { cas: 'sans section', definition: { sections: [], scores: [] } },
    { cas: 'section vide', definition: { sections: [section([])], scores: [] } },
    {
      cas: 'identifiant en double',
      definition: {
        sections: [
          section([
            { ...question, type: 'TEXTE' },
            { ...question, type: 'OUI_NON' },
          ]),
        ],
        scores: [],
      },
    },
    {
      cas: 'choix à une option',
      definition: {
        sections: [section([{ ...question, type: 'CHOIX', options: ['A'] }])],
        scores: [],
      },
    },
    {
      cas: 'échelle inversée',
      definition: {
        sections: [section([{ ...question, type: 'ECHELLE', min: 5, max: 1 }])],
        scores: [],
      },
    },
    {
      cas: 'score sur une question inconnue',
      definition: {
        sections: [section([{ ...question, type: 'TEXTE' }])],
        scores: [
          {
            id: 's',
            libelle: 'S',
            mode: 'SOMME',
            questions: [{ questionId: 'x', inverse: false }],
          },
        ],
      },
    },
    {
      cas: 'score sur un texte',
      definition: {
        sections: [section([{ ...question, type: 'TEXTE' }])],
        scores: [
          {
            id: 's',
            libelle: 'S',
            mode: 'SOMME',
            questions: [{ questionId: 'q', inverse: false }],
          },
        ],
      },
    },
    {
      cas: 'score en double',
      definition: {
        sections: [section([{ ...question, type: 'ECHELLE', min: 0, max: 5 }])],
        scores: [
          {
            id: 's',
            libelle: 'S',
            mode: 'SOMME',
            questions: [{ questionId: 'q', inverse: false }],
          },
          {
            id: 's',
            libelle: 'T',
            mode: 'SOMME',
            questions: [{ questionId: 'q', inverse: false }],
          },
        ],
      },
    },
  ])('refuse : $cas', ({ definition }) => {
    expect(definitionFormulaireSchema.safeParse(definition).success).toBe(false);
  });
});

describe('validerReponses', () => {
  it('normalise les réponses et omet les vides', () => {
    expect(
      validerReponses(DEFINITION, { texte: ' Bonjour ', oui: 'OUI', choix: 'A', e1: '7', e2: '' }),
    ).toEqual({
      valide: true,
      reponses: { texte: 'Bonjour', oui: 'OUI', choix: 'A', e1: 7 },
    });
  });

  it.each([
    { cas: 'obligatoire absente', saisie: {}, champ: 'texte', message: 'Réponse obligatoire.' },
    {
      cas: 'obligatoire en espaces',
      saisie: { texte: '   ' },
      champ: 'texte',
      message: 'Réponse obligatoire.',
    },
    {
      cas: 'texte trop long',
      saisie: { texte: 'x'.repeat(2001) },
      champ: 'texte',
      message: '2000 caractères au maximum.',
    },
    {
      cas: 'oui/non inconnu',
      saisie: { texte: 'a', oui: 'PEUT-ETRE' },
      champ: 'oui',
      message: 'Répondre par oui ou par non.',
    },
    {
      cas: 'option inconnue',
      saisie: { texte: 'a', choix: 'C' },
      champ: 'choix',
      message: 'Choisir une option de la liste.',
    },
    {
      cas: 'échelle dépassée',
      saisie: { texte: 'a', e1: '11' },
      champ: 'e1',
      message: 'Saisir un entier de 0 à 10.',
    },
    {
      cas: 'échelle sous le minimum',
      saisie: { texte: 'a', e2: '0' },
      champ: 'e2',
      message: 'Saisir un entier de 1 à 5.',
    },
    {
      cas: 'échelle décimale',
      saisie: { texte: 'a', e1: '2.5' },
      champ: 'e1',
      message: 'Saisir un entier de 0 à 10.',
    },
    {
      cas: 'échelle non numérique',
      saisie: { texte: 'a', e1: 'abc' },
      champ: 'e1',
      message: 'Saisir un entier de 0 à 10.',
    },
  ])('$cas', ({ saisie, champ, message }) => {
    expect(validerReponses(DEFINITION, saisie)).toEqual({
      valide: false,
      erreurs: { [champ]: [message] },
    });
  });
});

describe('calculerScores', () => {
  it('somme avec inversion, moyenne', () => {
    expect(calculerScores(DEFINITION, { e1: 8, e2: 2 })).toEqual([
      { id: 'somme', libelle: 'Somme', valeur: 12 },
      { id: 'moyenne', libelle: 'Moyenne', valeur: 5 },
    ]);
  });

  it('sans estimation si une réponse manque', () => {
    expect(calculerScores(DEFINITION, { e1: 8 }).map((s) => s.valeur)).toEqual([null, null]);
  });

  it('reste nul si la définition lue référence une question absente', () => {
    const definition: DefinitionFormulaire = {
      ...DEFINITION,
      sections: [{ titre: 'S', questions: [] }],
    };
    expect(calculerScores(definition, { e1: 8, e2: 2 })[0]?.valeur).toBeNull();
  });
});

describe('affichage', () => {
  it.each([
    { valeur: null, attendu: 'Incomplet' },
    { valeur: 7, attendu: '7' },
    { valeur: 6.666, attendu: '6,7' },
  ])('formaterScore($valeur)', ({ valeur, attendu }) => {
    expect(formaterScore(valeur)).toBe(attendu);
  });

  const oui: Question = { id: 'oui', libelle: 'O', type: 'OUI_NON', obligatoire: false };
  const echelle: Question = {
    id: 'e',
    libelle: 'E',
    type: 'ECHELLE',
    min: 0,
    max: 3,
    obligatoire: false,
  };

  it.each([
    { question: oui, reponses: {}, attendu: '—' },
    { question: oui, reponses: { oui: 'OUI' }, attendu: 'Oui' },
    { question: oui, reponses: { oui: 'NON' }, attendu: 'Non' },
    { question: echelle, reponses: { e: 2 }, attendu: '2' },
  ])('libelleReponse $attendu', ({ question, reponses, attendu }) => {
    expect(libelleReponse(question, reponses)).toBe(attendu);
  });
});
