import { describe, expect, it } from 'vitest';

import {
  ETATS_PRET,
  etatPret,
  LIBELLES_ETATS_PRET,
  parcPretSaisieSchema,
  pretSaisieSchema,
  retourPretSaisieSchema,
} from './pret';

const UUID = '018f0000-0000-7000-8000-000000000001';
const PREVU = '2026-11-10';

describe('etatPret', () => {
  it.each([
    { jour: '2026-11-01', attendu: 'EN_COURS' },
    { jour: '2026-11-06', attendu: 'EN_COURS' },
    { jour: '2026-11-07', attendu: 'A_ECHEANCE' },
    { jour: '2026-11-10', attendu: 'A_ECHEANCE' },
    { jour: '2026-11-11', attendu: 'EN_RETARD' },
  ])('le $jour : $attendu', ({ jour, attendu }) => {
    expect(etatPret({ dateRetourPrevue: PREVU, dateRetour: null }, jour)).toBe(attendu);
  });

  it('un prêt rendu n’est jamais en retard', () => {
    expect(etatPret({ dateRetourPrevue: PREVU, dateRetour: '2026-12-01' }, '2027-01-01')).toBe(
      'RENDU',
    );
  });
});

describe('saisies', () => {
  it('une date vide laisse la durée paramétrée', () => {
    const saisie = { appareilId: UUID, patientId: UUID, dateRetourPrevue: '', ticketId: '' };
    expect(pretSaisieSchema.parse(saisie)).toMatchObject({
      dateRetourPrevue: null,
      ticketId: null,
    });
  });

  it('refuse un prêt sans patient', () => {
    const saisie = { appareilId: UUID, patientId: '', dateRetourPrevue: '', ticketId: '' };
    expect(pretSaisieSchema.safeParse(saisie).success).toBe(false);
  });

  it('borne l’état au retour', () => {
    expect(retourPretSaisieSchema.parse({ etatRetour: ' ' })).toEqual({ etatRetour: null });
    expect(retourPretSaisieSchema.safeParse({ etatRetour: 'x'.repeat(501) }).success).toBe(false);
  });

  it('lit le drapeau du parc', () => {
    expect(parcPretSaisieSchema.parse({ parcPret: true })).toEqual({ parcPret: true });
  });
});

describe('libellés', () => {
  it('chaque état a un texte', () => {
    for (const etat of ETATS_PRET) {
      expect(LIBELLES_ETATS_PRET[etat]).not.toBe('');
    }
  });
});
