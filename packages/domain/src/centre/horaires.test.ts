import { describe, expect, it } from 'vitest';

import { HORAIRES_VIDES, horairesOuvertureSchema, JOURS_SEMAINE, LIBELLES_JOURS } from './horaires';

describe('horairesOuvertureSchema', () => {
  it.each(JOURS_SEMAINE)('%s a un libellé', (jour) => {
    expect(LIBELLES_JOURS[jour]).not.toBe('');
  });

  it('accepte une semaine sans plage et deux plages qui se suivent', () => {
    const lundi = [
      { debut: '09:00', fin: '12:30' },
      { debut: '12:30', fin: '18:00' },
    ];
    expect(horairesOuvertureSchema.parse({ ...HORAIRES_VIDES, lundi }).lundi).toEqual(lundi);
    expect(horairesOuvertureSchema.parse(HORAIRES_VIDES)).toEqual(HORAIRES_VIDES);
  });

  it.each([
    {
      cas: 'heure hors format',
      lundi: [{ debut: '9h', fin: '12:00' }],
      message: 'Heure invalide (HH:MM).',
    },
    {
      cas: 'heure impossible',
      lundi: [{ debut: '24:00', fin: '25:00' }],
      message: 'Heure invalide (HH:MM).',
    },
    {
      cas: 'fin avant le début',
      lundi: [{ debut: '12:00', fin: '09:00' }],
      message: 'La fin doit suivre le début.',
    },
    {
      cas: 'début égal à la fin',
      lundi: [{ debut: '12:00', fin: '12:00' }],
      message: 'La fin doit suivre le début.',
    },
    {
      cas: 'chevauchement',
      lundi: [
        { debut: '09:00', fin: '13:00' },
        { debut: '12:00', fin: '18:00' },
      ],
      message: 'Les plages doivent se suivre sans se chevaucher.',
    },
    {
      cas: 'trois plages',
      lundi: [
        { debut: '08:00', fin: '09:00' },
        { debut: '10:00', fin: '11:00' },
        { debut: '12:00', fin: '13:00' },
      ],
      message: 'Au plus 2 plages par jour.',
    },
  ])('refuse : $cas', ({ lundi, message }) => {
    const resultat = horairesOuvertureSchema.safeParse({ ...HORAIRES_VIDES, lundi });
    expect(resultat.error?.issues[0]?.message).toBe(message);
  });
});
