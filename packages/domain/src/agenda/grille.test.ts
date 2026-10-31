import { describe, expect, it } from 'vitest';

import { bornesGrille, disposerEnVoies, instantDeDepose, positionDansLaGrille } from './grille';

describe('instantDeDepose', () => {
  const secondeOccurrence = Date.parse('2027-10-31T01:30:00Z');

  it('garde la seconde occurrence d’automne si l’heure locale ne bouge pas', () => {
    expect(instantDeDepose('2027-10-31', '02:30', secondeOccurrence)).toBe(secondeOccurrence);
  });

  it('résout l’heure saisie dès qu’elle bouge', () => {
    expect(instantDeDepose('2027-10-31', '03:00', secondeOccurrence)).toBe(
      Date.parse('2027-10-31T02:00:00Z'),
    );
  });

  it('change de jour à la même heure', () => {
    expect(instantDeDepose('2027-10-30', '02:30', secondeOccurrence)).toBe(
      Date.parse('2027-10-30T00:30:00Z'),
    );
  });

  it('refuse une heure inexistante', () => {
    expect(instantDeDepose('2027-03-28', '02:30', secondeOccurrence)).toBeNull();
  });
});

const t = (heure: string) => Date.parse(`2027-01-11T${heure}:00+01:00`);

describe('positionDansLaGrille', () => {
  it('lit l’heure locale et la durée réelle', () => {
    expect(positionDansLaGrille({ debut: t('09:30'), fin: t('10:15') })).toEqual({
      debutMinutes: 570,
      dureeMinutes: 45,
    });
  });

  it('les deux occurrences de 2 h 30 se superposent à l’automne', () => {
    const premiere = Date.parse('2027-10-31T00:30:00Z');
    const seconde = Date.parse('2027-10-31T01:30:00Z');
    const duree = 1_800_000;
    expect(positionDansLaGrille({ debut: premiere, fin: premiere + duree })).toEqual(
      positionDansLaGrille({ debut: seconde, fin: seconde + duree }),
    );
  });
});

describe('bornesGrille', () => {
  it.each([
    { cas: 'vide', intervalles: [], attendu: { debut: 480, fin: 1140 } },
    {
      cas: 'dans les bornes',
      intervalles: [{ debut: t('09:00'), fin: t('10:00') }],
      attendu: { debut: 480, fin: 1140 },
    },
    {
      cas: 'élargit à l’heure pleine',
      intervalles: [{ debut: t('07:30'), fin: t('19:10') }],
      attendu: { debut: 420, fin: 1200 },
    },
    {
      cas: 'plafonne à minuit',
      intervalles: [{ debut: t('23:30'), fin: t('23:55') }],
      attendu: { debut: 480, fin: 1440 },
    },
  ])('$cas', ({ intervalles, attendu }) => {
    expect(bornesGrille(intervalles)).toEqual(attendu);
  });
});

describe('disposerEnVoies', () => {
  const rdv = (id: string, debut: string, fin: string) => ({ id, debut: t(debut), fin: t(fin) });

  it('sans chevauchement, une voie chacun', () => {
    const voies = disposerEnVoies([rdv('a', '09:00', '09:30'), rdv('b', '09:30', '10:00')]);
    expect(voies.get('a')).toEqual({ rang: 0, voies: 1 });
    expect(voies.get('b')).toEqual({ rang: 0, voies: 1 });
  });

  it('met côte à côte ce qui se chevauche et réutilise une voie libérée', () => {
    const voies = disposerEnVoies([
      rdv('a', '09:00', '10:00'),
      rdv('b', '09:15', '09:45'),
      rdv('c', '09:50', '10:30'),
      rdv('d', '11:00', '11:30'),
    ]);
    expect(voies.get('a')).toEqual({ rang: 0, voies: 2 });
    expect(voies.get('b')).toEqual({ rang: 1, voies: 2 });
    expect(voies.get('c')).toEqual({ rang: 1, voies: 2 });
    expect(voies.get('d')).toEqual({ rang: 0, voies: 1 });
  });

  it('accepte une liste vide', () => {
    expect(disposerEnVoies([]).size).toBe(0);
  });
});
