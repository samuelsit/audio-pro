import { describe, expect, it } from 'vitest';

import { couvertureAmoAJour, type EntreeCouvertureAmo } from './couverture-amo';

const MODIFIEE = '2026-10-10T09:00:00.000Z';

function entree(surcharge: Partial<EntreeCouvertureAmo> = {}): EntreeCouvertureAmo {
  return {
    origine: 'VITALE',
    derniereLectureVitale: '2026-10-10',
    dateDelivrance: '2026-10-31',
    modifieeLe: MODIFIEE,
    confirmeeLe: null,
    ...surcharge,
  };
}

describe('couvertureAmoAJour', () => {
  it.each([
    { cas: 'lecture récente', e: {}, attendu: true },
    { cas: 'lecture 30 jours avant', e: { derniereLectureVitale: '2026-10-01' }, attendu: true },
    { cas: 'lecture 31 jours avant', e: { derniereLectureVitale: '2026-09-30' }, attendu: false },
    {
      cas: 'lecture après la délivrance',
      e: { derniereLectureVitale: '2026-11-02' },
      attendu: true,
    },
    { cas: 'jamais lue', e: { derniereLectureVitale: null }, attendu: false },
    { cas: 'fiche retouchée après la lecture', e: { origine: 'SAISIE' }, attendu: false },
    {
      cas: 'saisie confirmée',
      e: { origine: 'SAISIE', confirmeeLe: '2026-10-11T09:00:00.000Z' },
      attendu: true,
    },
    {
      cas: 'confirmée à l’instant de la modification',
      e: { origine: 'SAISIE', confirmeeLe: MODIFIEE },
      attendu: true,
    },
    {
      cas: 'modifiée après la confirmation',
      e: { origine: 'SAISIE', confirmeeLe: '2026-10-09T09:00:00.000Z' },
      attendu: false,
    },
    {
      cas: 'lecture ancienne mais confirmée',
      e: { derniereLectureVitale: '2026-01-01', confirmeeLe: '2026-10-11T09:00:00.000Z' },
      attendu: true,
    },
  ] as const)('$cas', ({ e, attendu }) => {
    expect(couvertureAmoAJour(entree(e))).toBe(attendu);
  });
});
