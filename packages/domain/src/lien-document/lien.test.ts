import { describe, expect, it } from 'vitest';

import {
  adresseDuCanal,
  canauxDisponibles,
  envoiDocumentSaisieSchema,
  lienOuvert,
  ouvertureLienSaisieSchema,
} from './lien';

const MAINTENANT = 1_000;

describe('lienOuvert', () => {
  it.each([
    { cas: 'ouvert', expireLe: 2_000, revoqueLe: null, bloqueLe: null, ouvert: true },
    { cas: 'à l’échéance', expireLe: 1_000, revoqueLe: null, bloqueLe: null, ouvert: false },
    { cas: 'expiré', expireLe: 500, revoqueLe: null, bloqueLe: null, ouvert: false },
    { cas: 'révoqué', expireLe: 2_000, revoqueLe: 900, bloqueLe: null, ouvert: false },
    { cas: 'bloqué', expireLe: 2_000, revoqueLe: null, bloqueLe: 900, ouvert: false },
  ])('$cas', ({ ouvert, ...lien }) => {
    expect(lienOuvert(lien, MAINTENANT)).toBe(ouvert);
  });
});

describe('adresseDuCanal', () => {
  const patient = {
    telephone: '+33600000000',
    email: 'alex@exemple.test',
    consentementSms: true,
    consentementEmail: true,
  };

  it.each([
    { cas: 'SMS consenti', canal: 'SMS', surcharge: {}, attendu: '+33600000000' },
    { cas: 'e-mail consenti', canal: 'EMAIL', surcharge: {}, attendu: 'alex@exemple.test' },
    { cas: 'SMS refusé', canal: 'SMS', surcharge: { consentementSms: false }, attendu: null },
    {
      cas: 'e-mail refusé',
      canal: 'EMAIL',
      surcharge: { consentementEmail: false },
      attendu: null,
    },
    { cas: 'sans téléphone', canal: 'SMS', surcharge: { telephone: null }, attendu: null },
    { cas: 'sans e-mail', canal: 'EMAIL', surcharge: { email: null }, attendu: null },
  ] as const)('$cas', ({ canal, surcharge, attendu }) => {
    expect(adresseDuCanal({ ...patient, ...surcharge }, canal)).toBe(attendu);
  });

  it('liste les canaux utilisables', () => {
    expect(canauxDisponibles(patient)).toEqual(['SMS', 'EMAIL']);
    expect(canauxDisponibles({ ...patient, consentementSms: false })).toEqual(['EMAIL']);
  });
});

describe('saisies', () => {
  it('canal', () => {
    expect(envoiDocumentSaisieSchema.safeParse({ canal: 'SMS' }).success).toBe(true);
    expect(envoiDocumentSaisieSchema.safeParse({ canal: 'COURRIER' }).success).toBe(false);
  });

  it('date de naissance', () => {
    expect(ouvertureLienSaisieSchema.safeParse({ dateNaissance: '1950-03-12' }).success).toBe(true);
    expect(ouvertureLienSaisieSchema.safeParse({ dateNaissance: 'x' }).success).toBe(false);
  });
});
