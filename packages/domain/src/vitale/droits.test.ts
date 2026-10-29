import { describe, expect, it } from 'vitest';

import {
  droitsAmoEnAlerte,
  etatDroitsAmo,
  LIBELLES_ETAT_DROITS_AMO,
  type EtatDroitsAmo,
} from './droits';

const JOUR = '2026-10-29';

describe('etatDroitsAmo', () => {
  it.each<{
    cas: string;
    debut: string | null;
    fin: string | null;
    etat: EtatDroitsAmo;
    alerte: boolean;
  }>([
    {
      cas: 'période en cours',
      debut: '2026-01-01',
      fin: '2026-12-31',
      etat: 'OUVERTS',
      alerte: false,
    },
    { cas: 'dernier jour des droits', debut: null, fin: JOUR, etat: 'OUVERTS', alerte: false },
    {
      cas: 'premier jour des droits',
      debut: JOUR,
      fin: '2027-01-01',
      etat: 'OUVERTS',
      alerte: false,
    },
    {
      cas: 'fin dépassée d’un jour',
      debut: null,
      fin: '2026-10-28',
      etat: 'EXPIRES',
      alerte: true,
    },
    {
      cas: 'fin dépassée de longue date',
      debut: '2024-01-01',
      fin: '2025-12-31',
      etat: 'EXPIRES',
      alerte: true,
    },
    {
      cas: 'droits qui ouvrent demain',
      debut: '2026-10-30',
      fin: null,
      etat: 'NON_OUVERTS',
      alerte: true,
    },
    { cas: 'sans fin de droits', debut: null, fin: null, etat: 'INCONNUS', alerte: false },
    {
      cas: 'ouverts sans fin de droits',
      debut: '2026-01-01',
      fin: null,
      etat: 'INCONNUS',
      alerte: false,
    },
  ])('$cas → $etat', ({ debut, fin, etat, alerte }) => {
    expect(etatDroitsAmo({ debut, fin }, JOUR)).toBe(etat);
    expect(droitsAmoEnAlerte({ debut, fin }, JOUR)).toBe(alerte);
    expect(LIBELLES_ETAT_DROITS_AMO[etat]).not.toBe('');
  });
});
