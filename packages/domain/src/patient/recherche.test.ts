import { describe, expect, it } from 'vitest';

import {
  criteresRecherchePatientSchema,
  dateSaisieSchema,
  normaliserPourRecherche,
} from './recherche';

describe('normaliserPourRecherche', () => {
  it.each([
    { saisie: 'Hélène', attendu: 'HELENE' },
    { saisie: '  dupont  ', attendu: 'DUPONT' },
    { saisie: 'Le Bœuf', attendu: 'LE BOEUF' },
    { saisie: 'Lætitia', attendu: 'LAETITIA' },
    { saisie: 'd’Hérouville-Saint-Clair', attendu: 'D HEROUVILLE SAINT CLAIR' },
    { saisie: "O'Neil", attendu: 'O NEIL' },
    { saisie: 'Jean--Marie   Paul', attendu: 'JEAN MARIE PAUL' },
    { saisie: 'St. Ange', attendu: 'ST ANGE' },
    { saisie: 'Çelik', attendu: 'CELIK' },
  ])('« $saisie » → « $attendu »', ({ saisie, attendu }) => {
    expect(normaliserPourRecherche(saisie)).toBe(attendu);
  });
});

describe('dateSaisieSchema', () => {
  it.each([
    { saisie: '05/03/1950', attendu: '1950-03-05' },
    { saisie: '5/3/1950', attendu: '1950-03-05' },
    { saisie: ' 1950-03-05 ', attendu: '1950-03-05' },
  ])('« $saisie » → $attendu', ({ saisie, attendu }) => {
    expect(dateSaisieSchema.parse(saisie)).toBe(attendu);
  });

  it.each(['31/02/1950', '1950/03/05', '05-03-1950', 'hier'])('refuse « %s »', (saisie) => {
    expect(dateSaisieSchema.safeParse(saisie).success).toBe(false);
  });
});

describe('criteresRecherchePatientSchema', () => {
  it('normalise les critères fournis', () => {
    expect(
      criteresRecherchePatientSchema.parse({
        nom: ' Lefèvre ',
        prenom: 'josé',
        dateNaissance: '05/03/1950',
        empreinte: 'a'.repeat(64),
        page: '2',
      }),
    ).toEqual({
      nom: 'LEFEVRE',
      prenom: 'JOSE',
      dateNaissance: '1950-03-05',
      empreinte: 'a'.repeat(64),
      page: 2,
    });
  });

  it('ignore les critères vides ou invalides', () => {
    expect(
      criteresRecherchePatientSchema.parse({
        nom: '   ',
        prenom: '--',
        dateNaissance: '31/02/1950',
        empreinte: '185057800604830',
        page: 'x',
      }),
    ).toEqual({ page: 1 });
    expect(criteresRecherchePatientSchema.parse({})).toEqual({ page: 1 });
  });
});
