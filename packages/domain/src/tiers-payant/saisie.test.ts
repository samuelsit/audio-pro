import { describe, expect, it } from 'vitest';

import {
  complementaireSaisieSchema,
  ecartReglementSaisieSchema,
  ecartSaisieSchema,
  filtreCreancesSchema,
  filtreReglementsSchema,
  lettrageSaisieSchema,
  reglementSaisieSchema,
  rejetSaisieSchema,
  resolutionRejetSaisieSchema,
} from './saisie';

const CREANCE = '019a0000-0000-7000-8000-000000000001';

const message = (resultat: { error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  resultat.error?.issues[0]?.message;

describe('complementaireSaisieSchema', () => {
  const saisie = {
    nom: ' Mutuelle Démo ',
    identifiant: '99999997',
    plateformeTiersPayant: '',
    telephone: '',
    email: '',
    adresse: '',
    modePec: 'PORTAIL',
    delaiPaiementJours: '30',
    actif: 'on',
  };

  it('nettoie et convertit', () => {
    expect(complementaireSaisieSchema.parse(saisie)).toEqual({
      nom: 'Mutuelle Démo',
      identifiant: '99999997',
      plateformeTiersPayant: null,
      telephone: null,
      email: null,
      adresse: null,
      modePec: 'PORTAIL',
      delaiPaiementJours: 30,
      actif: true,
    });
  });

  it.each([
    ['nom', { nom: '' }, 'Le nom est obligatoire.'],
    ['e-mail', { email: 'pas-un-mail' }, 'Adresse e-mail invalide.'],
    ['délai', { delaiPaiementJours: '-1' }, 'Délai invalide.'],
    ['mode', { modePec: 'FAX' }, 'Choisir le mode de PEC.'],
  ])('refuse : %s', (_, surcharge, attendu) => {
    expect(message(complementaireSaisieSchema.safeParse({ ...saisie, ...surcharge }))).toBe(
      attendu,
    );
  });

  it('une case décochée n’arrive pas', () => {
    expect(complementaireSaisieSchema.parse({ ...saisie, actif: undefined }).actif).toBe(false);
  });
});

describe('reglementSaisieSchema', () => {
  const saisie = {
    complementaireId: '',
    organisme: 'CPAM démo',
    dateReglement: '2026-11-02',
    reference: 'VIR-1',
    partAmo: '100,50',
    partAmc: '',
  };

  it('convertit en centimes, part vide à zéro', () => {
    expect(reglementSaisieSchema.parse(saisie)).toMatchObject({
      partAmoCentimes: 10_050,
      partAmcCentimes: 0,
    });
  });

  it.each([
    ['sans organisme', { organisme: '' }, 'Choisir l’organisme.'],
    ['sans montant', { partAmo: '' }, 'Indiquer un montant.'],
    ['montant négatif', { partAmo: '-1,00' }, 'Montant invalide (exemple : 710,00).'],
    ['sans référence', { reference: ' ' }, 'La référence est obligatoire.'],
  ])('refuse : %s', (_, surcharge, attendu) => {
    expect(message(reglementSaisieSchema.safeParse({ ...saisie, ...surcharge }))).toBe(attendu);
  });

  it('accepte le référentiel à la place du texte', () => {
    const resultat = reglementSaisieSchema.parse({
      ...saisie,
      organisme: '',
      complementaireId: CREANCE,
    });
    expect(resultat).toMatchObject({ organisme: null, complementaireId: CREANCE });
  });
});

describe('lettrageSaisieSchema', () => {
  it.each([
    ['montant nul', '0,00'],
    ['montant illisible', 'abc'],
  ])('refuse : %s', (_, montant) => {
    const resultat = lettrageSaisieSchema.safeParse({
      imputations: [{ creanceId: CREANCE, montant }],
    });
    expect(resultat.success).toBe(false);
  });

  it('convertit', () => {
    expect(
      lettrageSaisieSchema.parse({ imputations: [{ creanceId: CREANCE, montant: '12,34' }] }),
    ).toEqual({ imputations: [{ creanceId: CREANCE, montant: 1_234 }] });
  });
});

describe('écarts, rejets et résolutions', () => {
  it('un écart exige un motif', () => {
    expect(message(ecartSaisieSchema.safeParse({ montant: '1,00', motif: '' }))).toBe(
      'Le motif est obligatoire.',
    );
  });

  it('un écart sur règlement porte sa part', () => {
    expect(
      ecartReglementSaisieSchema.parse({ montant: '1,00', motif: 'Arrondi', type: 'AMC' }),
    ).toEqual({ montant: 100, motif: 'Arrondi', type: 'AMC' });
  });

  it('un rejet exige une date et un motif, le code est libre', () => {
    expect(
      rejetSaisieSchema.parse({ dateRejet: '2026-11-02', code: '', motif: 'Droits fermés' }),
    ).toEqual({ dateRejet: '2026-11-02', code: null, motif: 'Droits fermés' });
  });

  it('une résolution se choisit dans la liste', () => {
    expect(message(resolutionRejetSaisieSchema.safeParse({ resolution: 'X' }))).toBe(
      'Choisir la suite donnée.',
    );
    expect(resolutionRejetSaisieSchema.parse({ resolution: 'REPRESENTEE', motif: '' })).toEqual({
      resolution: 'REPRESENTEE',
      motif: null,
    });
  });
});

describe('filtres d’URL', () => {
  it('ignore ce qui n’existe pas', () => {
    expect(filtreCreancesSchema.parse({ statut: 'X', tranche: 'Y', type: 'Z' })).toEqual({
      page: 1,
    });
  });

  it('garde les filtres connus', () => {
    expect(
      filtreCreancesSchema.parse({ organisme: ' CPAM ', statut: 'OUVERTE', tranche: 'J0_30' }),
    ).toMatchObject({ organisme: 'CPAM', statut: 'OUVERTE', tranche: 'J0_30' });
  });

  it.each([
    ['oui', true],
    ['non', false],
  ])('règlements à lettrer : %s', (valeur, attendu) => {
    expect(filtreReglementsSchema.parse({ aLettrer: valeur }).aLettrer).toBe(attendu);
  });
});
