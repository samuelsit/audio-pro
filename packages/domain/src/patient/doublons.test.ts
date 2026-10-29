import { describe, expect, it } from 'vitest';

import { motifsDoublon, type IdentiteComparable } from './doublons';

const base: IdentiteComparable = {
  nomNaissance: 'Lefèvre',
  nomUsage: null,
  dateNaissance: '1950-03-05',
  nirEmpreinte: 'e1',
};

describe('motifsDoublon', () => {
  it.each([
    {
      cas: 'même NIR et même identité',
      existant: { ...base },
      attendu: ['MEME_NIR', 'MEME_IDENTITE'],
    },
    {
      cas: 'même NIR, autre personne (ayant droit)',
      existant: { ...base, nomNaissance: 'Autre', dateNaissance: '2015-06-01' },
      attendu: ['MEME_NIR'],
    },
    {
      cas: 'même nom sans accent ni casse, même date, sans NIR',
      existant: { ...base, nomNaissance: 'LEFEVRE', nirEmpreinte: null },
      attendu: ['MEME_IDENTITE'],
    },
    {
      cas: 'nom d’usage de l’existant = nom de naissance du candidat',
      existant: { ...base, nomNaissance: 'Martin', nomUsage: 'lefevre', nirEmpreinte: 'e2' },
      attendu: ['MEME_IDENTITE'],
    },
    {
      cas: 'même nom, autre date',
      existant: { ...base, dateNaissance: '1950-03-06', nirEmpreinte: 'e2' },
      attendu: [],
    },
    {
      cas: 'même date, autre nom',
      existant: { ...base, nomNaissance: 'Martin', nirEmpreinte: 'e2' },
      attendu: [],
    },
    {
      cas: 'nom d’usage vide ignoré',
      existant: { ...base, nomNaissance: 'Martin', nomUsage: '  ', nirEmpreinte: 'e2' },
      attendu: [],
    },
  ])('$cas', ({ existant, attendu }) => {
    expect(motifsDoublon(base, existant)).toEqual(attendu);
  });

  it('deux fiches sans NIR ne sont pas des doublons par le NIR', () => {
    expect(
      motifsDoublon(
        { ...base, nirEmpreinte: null },
        { ...base, nomNaissance: 'Martin', nirEmpreinte: null },
      ),
    ).toEqual([]);
  });

  it('le nom d’usage du candidat compte aussi', () => {
    expect(
      motifsDoublon(
        { ...base, nomNaissance: 'Martin', nomUsage: 'Lefèvre', nirEmpreinte: null },
        { ...base, nirEmpreinte: null },
      ),
    ).toEqual(['MEME_IDENTITE']);
  });
});
