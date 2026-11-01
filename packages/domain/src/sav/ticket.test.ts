import { describe, expect, it } from 'vitest';

import {
  LIBELLES_ACTIONS_SAV,
  LIBELLES_STATUTS_TICKET,
  ACTIONS_SAV,
  MESSAGES_REFUS_FACTURATION,
  REFUS_FACTURATION_TICKET,
  refusFacturationTicket,
  STATUTS_TICKET,
  STATUTS_TICKET_OUVERTS,
  ticketPeutPasser,
  type StatutTicket,
} from './ticket';

const AUTORISEES: readonly (readonly [StatutTicket, StatutTicket])[] = [
  ['OUVERT', 'EN_COURS'],
  ['OUVERT', 'ANNULE'],
  ['EN_COURS', 'CHEZ_FABRICANT'],
  ['EN_COURS', 'A_RESTITUER'],
  ['EN_COURS', 'ANNULE'],
  ['CHEZ_FABRICANT', 'A_RESTITUER'],
  ['CHEZ_FABRICANT', 'EN_COURS'],
  ['A_RESTITUER', 'CLOTURE'],
];

describe('ticketPeutPasser', () => {
  const couples = STATUTS_TICKET.flatMap((de) => STATUTS_TICKET.map((vers) => ({ de, vers })));

  it.each(couples)('$de → $vers', ({ de, vers }) => {
    const attendu = AUTORISEES.some(([a, b]) => a === de && b === vers);
    expect(ticketPeutPasser(de, vers)).toBe(attendu);
  });

  it('clôturé et annulé ferment le ticket', () => {
    expect(STATUTS_TICKET_OUVERTS).toEqual(['OUVERT', 'EN_COURS', 'CHEZ_FABRICANT', 'A_RESTITUER']);
  });
});

describe('refusFacturationTicket', () => {
  const base = { couverture: 'AUCUNE', coutCentimes: 4500, patientId: 'p' } as const;

  it.each([
    { cas: 'hors garantie', ticket: base, attendu: null },
    {
      cas: 'sous garantie',
      ticket: { ...base, couverture: 'GARANTIE' },
      attendu: 'SOUS_GARANTIE',
    },
    {
      cas: 'assurance',
      ticket: { ...base, couverture: 'ASSURANCE' },
      attendu: 'SOUS_ASSURANCE',
    },
    { cas: 'sans patient', ticket: { ...base, patientId: null }, attendu: 'SANS_PATIENT' },
    { cas: 'sans coût', ticket: { ...base, coutCentimes: null }, attendu: 'SANS_COUT' },
    { cas: 'coût nul', ticket: { ...base, coutCentimes: 0 }, attendu: 'SANS_COUT' },
  ] as const)('$cas : $attendu', ({ ticket, attendu }) => {
    expect(refusFacturationTicket(ticket)).toBe(attendu);
  });
});

describe('libellés', () => {
  it('chaque valeur a un texte', () => {
    for (const statut of STATUTS_TICKET) {
      expect(LIBELLES_STATUTS_TICKET[statut]).not.toBe('');
    }
    for (const action of ACTIONS_SAV) {
      expect(LIBELLES_ACTIONS_SAV[action]).not.toBe('');
    }
    for (const refus of REFUS_FACTURATION_TICKET) {
      expect(MESSAGES_REFUS_FACTURATION[refus]).not.toBe('');
    }
  });
});
