import { describe, expect, it } from 'vitest';

import { STATUTS_RDV } from '../agenda/etats';
import {
  peutModifierEnLigne,
  statutApresDeplacementEnLigne,
  statutReservationEnLigne,
} from './modification';

const MAINTENANT = Date.parse('2027-01-11T10:00:00+01:00');
const H = 3_600_000;

describe('peutModifierEnLigne', () => {
  it.each([
    { cas: 'largement avant', statut: 'CONFIRME', dans: 48, delai: 24, attendu: true },
    { cas: 'pile au délai', statut: 'PLANIFIE', dans: 24, delai: 24, attendu: true },
    { cas: 'juste après le délai', statut: 'CONFIRME', dans: 23.99, delai: 24, attendu: false },
    { cas: 'délai nul, à venir', statut: 'CONFIRME', dans: 1, delai: 0, attendu: true },
    { cas: 'délai nul, passé', statut: 'CONFIRME', dans: -1, delai: 0, attendu: false },
    { cas: 'délai nul, à l’instant', statut: 'CONFIRME', dans: 0, delai: 0, attendu: false },
    { cas: 'patient arrivé', statut: 'ARRIVE', dans: 48, delai: 0, attendu: false },
    { cas: 'déjà annulé', statut: 'ANNULE', dans: 48, delai: 0, attendu: false },
    { cas: 'absent', statut: 'ABSENT', dans: 48, delai: 0, attendu: false },
    { cas: 'vu', statut: 'VU', dans: 48, delai: 0, attendu: false },
  ] as const)('$cas', ({ statut, dans, delai, attendu }) => {
    expect(
      peutModifierEnLigne({
        statut,
        debut: MAINTENANT + dans * H,
        maintenant: MAINTENANT,
        delaiModificationHeures: delai,
      }),
    ).toBe(attendu);
  });
});

describe('statutReservationEnLigne', () => {
  it('confirme d’office en automatique, laisse à valider en manuel', () => {
    expect(statutReservationEnLigne('AUTOMATIQUE')).toBe('CONFIRME');
    expect(statutReservationEnLigne('MANUELLE')).toBe('PLANIFIE');
  });
});

describe('statutApresDeplacementEnLigne', () => {
  it.each(STATUTS_RDV)('%s revient à valider en manuel', (statut) => {
    expect(statutApresDeplacementEnLigne(statut, 'MANUELLE')).toBe('PLANIFIE');
  });

  it.each(STATUTS_RDV)('%s ne change pas en automatique', (statut) => {
    expect(statutApresDeplacementEnLigne(statut, 'AUTOMATIQUE')).toBe(statut);
  });
});
