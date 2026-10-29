import { describe, expect, it } from 'vitest';

import { FakeClock } from './fake-clock';
import { formaterInstantParis, SystemClock } from './system-clock';

describe('formaterInstantParis', () => {
  it.each([
    { utc: '2026-01-15T09:30:00.000Z', attendu: '2026-01-15T10:30:00.000+01:00' },
    { utc: '2026-07-15T09:30:00.123Z', attendu: '2026-07-15T11:30:00.123+02:00' },
    { utc: '2026-03-29T00:59:59.000Z', attendu: '2026-03-29T01:59:59.000+01:00' },
    { utc: '2026-03-29T01:00:00.000Z', attendu: '2026-03-29T03:00:00.000+02:00' },
    { utc: '2026-12-31T23:00:00.000Z', attendu: '2027-01-01T00:00:00.000+01:00' },
  ])('$utc → $attendu', ({ utc, attendu }) => {
    const resultat = formaterInstantParis(new Date(utc));
    expect(resultat).toBe(attendu);
    expect(new Date(resultat).toISOString()).toBe(utc);
  });
});

describe('SystemClock', () => {
  it('renvoie un instant ISO 8601 avec décalage', () => {
    expect(new SystemClock().now()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+0[12]:00$/,
    );
  });
});

describe('FakeClock', () => {
  it('renvoie l’instant réglé', () => {
    const horloge = new FakeClock('2026-10-29T14:00:00.000+01:00');
    expect(horloge.now()).toBe('2026-10-29T14:00:00.000+01:00');
    horloge.regler('2026-10-30T08:00:00.000+01:00');
    expect(horloge.now()).toBe('2026-10-30T08:00:00.000+01:00');
  });
});
