import { describe, expect, it } from 'vitest';

import { dateCalendaireSchema } from './date';

describe('dateCalendaireSchema', () => {
  it.each(['2026-10-29', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])(
    'accepte %s',
    (date) => {
      expect(dateCalendaireSchema.parse(date)).toBe(date);
    },
  );

  it.each([
    { date: '2026-02-29', message: 'Cette date n’existe pas.' },
    { date: '1900-02-29', message: 'Cette date n’existe pas.' },
    { date: '2026-04-31', message: 'Cette date n’existe pas.' },
    { date: '2026-13-01', message: 'Cette date n’existe pas.' },
    { date: '2026-00-10', message: 'Cette date n’existe pas.' },
    { date: '2026-10-00', message: 'Cette date n’existe pas.' },
    { date: '2026-1-5', message: 'Date invalide (format AAAA-MM-JJ).' },
    { date: 12, message: 'Date invalide.' },
  ])('refuse $date', ({ date, message }) => {
    const resultat = dateCalendaireSchema.safeParse(date);
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.map((i) => i.message)).toEqual([message]);
  });
});
