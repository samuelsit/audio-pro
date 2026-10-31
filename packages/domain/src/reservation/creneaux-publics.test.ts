import { describe, expect, it } from 'vitest';

import { instantsDisponibles } from './creneaux-publics';

const t = (heure: string) => Date.parse(`2027-01-11T${heure}:00+01:00`);
const creneau = (heure: string, praticienId: string | null) => ({
  debut: t(heure),
  fin: t(heure) + 1_800_000,
  praticienId,
  cabineId: 'k1',
});

describe('instantsDisponibles', () => {
  it('regroupe les praticiens libres au même instant, dans l’ordre du temps', () => {
    expect(
      instantsDisponibles([creneau('09:00', 'p1'), creneau('09:00', 'p2'), creneau('09:15', 'p2')]),
    ).toEqual([
      {
        debut: t('09:00'),
        fin: t('09:30'),
        date: '2027-01-11',
        heure: '09:00',
        praticienIds: ['p1', 'p2'],
      },
      {
        debut: t('09:15'),
        fin: t('09:45'),
        date: '2027-01-11',
        heure: '09:15',
        praticienIds: ['p2'],
      },
    ]);
  });

  it('laisse la liste vide pour un type sans praticien', () => {
    expect(instantsDisponibles([creneau('09:00', null)])[0]?.praticienIds).toEqual([]);
  });

  it('ne propose rien sans créneau', () => {
    expect(instantsDisponibles([])).toEqual([]);
  });
});
