import { describe, expect, it } from 'vitest';

import {
  champsDifferents,
  choixFusionSchema,
  fusionnerFiches,
  sourceParDefaut,
  type FicheFusion,
} from './fusion';

const conservee: FicheFusion = {
  centreId: 'a',
  civilite: 'MME',
  nomNaissance: 'Lefèvre',
  nomUsage: null,
  prenoms: 'Jeanne',
  dateNaissance: '1950-03-05',
  sexe: 'FEMININ',
  adresse: { ligne1: null, ligne2: null, codePostal: null, ville: null },
  telephone: '0600000001',
  email: null,
  medecinTraitant: 'Dr Fictif',
  consentementSms: true,
  consentementEmail: false,
  consentementCourrier: false,
  amo: { nir: '269014999912339', c2s: false },
  amc: null,
  notes: 'Appareillée en 2020.',
};

const doublon: FicheFusion = {
  ...conservee,
  centreId: 'b',
  nomUsage: 'Martin',
  adresse: { ligne1: '1 rue Fictive', ligne2: null, codePostal: '75000', ville: 'Paris' },
  telephone: '0600000002',
  email: 'jeanne@exemple.test',
  consentementSms: false,
  amo: null,
  amc: { organismeNom: 'Mutuelle Démo' },
  notes: '  Préfère le matin. ',
};

describe('champsDifferents', () => {
  it('liste les champs qui diffèrent, dans l’ordre d’affichage', () => {
    expect(champsDifferents(conservee, doublon)).toEqual([
      'centreId',
      'nomUsage',
      'adresse',
      'telephone',
      'email',
      'consentementSms',
      'amo',
      'amc',
    ]);
  });

  it('aucun champ pour deux fiches identiques (notes exclues)', () => {
    expect(champsDifferents(conservee, { ...conservee, notes: 'autre' })).toEqual([]);
  });
});

describe('sourceParDefaut', () => {
  it.each([
    { champ: 'telephone', attendu: 'conservee', cas: 'les deux renseignés' },
    { champ: 'email', attendu: 'doublon', cas: 'conservée vide' },
    { champ: 'adresse', attendu: 'doublon', cas: 'bloc conservé entièrement vide' },
    { champ: 'amo', attendu: 'conservee', cas: 'doublon vide' },
    { champ: 'consentementSms', attendu: 'conservee', cas: 'booléen jamais vide' },
  ] as const)('$champ : $cas → $attendu', ({ champ, attendu }) => {
    expect(sourceParDefaut(conservee, doublon, champ)).toBe(attendu);
  });

  it('deux valeurs vides : la fiche conservée', () => {
    expect(sourceParDefaut(conservee, { ...doublon, email: '' }, 'email')).toBe('conservee');
  });
});

describe('fusionnerFiches', () => {
  it('applique les sources par défaut et concatène les notes', () => {
    expect(fusionnerFiches(conservee, doublon, {})).toEqual({
      ...conservee,
      nomUsage: 'Martin',
      adresse: doublon.adresse,
      email: 'jeanne@exemple.test',
      amc: { organismeNom: 'Mutuelle Démo' },
      notes: 'Appareillée en 2020.\n\nPréfère le matin.',
    });
  });

  it('respecte les choix explicites', () => {
    const fiche = fusionnerFiches(conservee, doublon, {
      centreId: 'doublon',
      telephone: 'doublon',
      email: 'conservee',
      consentementSms: 'doublon',
    });
    expect(fiche).toMatchObject({
      centreId: 'b',
      telephone: '0600000002',
      email: null,
      consentementSms: false,
    });
  });

  it.each([
    { cas: 'notes identiques', a: 'Même note', b: ' Même note ', attendu: 'Même note' },
    { cas: 'aucune note', a: null, b: null, attendu: null },
    { cas: 'note du doublon seule', a: null, b: 'Note B', attendu: 'Note B' },
  ])('notes : $cas', ({ a, b, attendu }) => {
    expect(fusionnerFiches({ ...conservee, notes: a }, { ...doublon, notes: b }, {}).notes).toBe(
      attendu,
    );
  });
});

describe('choixFusionSchema', () => {
  it('accepte des choix partiels', () => {
    expect(choixFusionSchema.parse({ email: 'doublon', amo: 'conservee' })).toEqual({
      email: 'doublon',
      amo: 'conservee',
    });
  });

  it.each([{ email: 'les-deux' }, { inconnu: 'doublon' }])('refuse %o', (choix) => {
    expect(choixFusionSchema.safeParse(choix).success).toBe(false);
  });
});
