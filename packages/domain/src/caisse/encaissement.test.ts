import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import type { Hacheur } from '../ports/hacheur';
import {
  acomptesADeduire,
  calculerRendu,
  calculerSolde,
  chargeMouvement,
  empreinteTexte,
  encaisseNet,
  encaissementSaisieSchema,
  remboursementSaisieSchema,
  resteRemboursable,
  type Mouvement,
} from './encaissement';

const HACHEUR: Hacheur = { sha256: (texte) => `h(${texte})` };

const SAISIE = { reference: '', partenaire: '', echeances: '', remis: '' };

function erreurs(resultat: { success: boolean; error?: { issues: { path: unknown[] }[] } }) {
  return resultat.error?.issues.map((issue) => issue.path[0]);
}

describe('saisie d’un encaissement', () => {
  it.each([
    ['CB', { mode: 'CB', montant: '150,00' }, 15_000, null, 0],
    ['espèces à l’appoint', { mode: 'ESPECES', montant: '20' }, 2_000, 2_000, 0],
    ['espèces avec rendu', { mode: 'ESPECES', montant: '42,50', remis: '50' }, 4_250, 5_000, 750],
    ['chèque : remis ignoré', { mode: 'CHEQUE', montant: '10', remis: '50' }, 1_000, null, 0],
  ])('%s', (_, saisie, montant, remis, rendu) => {
    expect(encaissementSaisieSchema.parse({ ...SAISIE, ...saisie })).toMatchObject({
      montantCentimes: montant,
      remisCentimes: remis,
      renduCentimes: rendu,
    });
  });

  it('financement : partenaire et échéances', () => {
    expect(
      encaissementSaisieSchema.parse({
        ...SAISIE,
        mode: 'FINANCEMENT',
        montant: '900',
        partenaire: 'Partenaire démo',
        echeances: '4',
      }),
    ).toMatchObject({ partenaire: 'Partenaire démo', echeances: 4, remisCentimes: null });
  });

  it.each([
    ['montant illisible', { mode: 'CB', montant: 'abc' }, 'montant'],
    ['montant nul', { mode: 'CB', montant: '0' }, 'montant'],
    ['remis illisible', { mode: 'ESPECES', montant: '10', remis: 'x' }, 'remis'],
    ['remis insuffisant', { mode: 'ESPECES', montant: '10', remis: '5' }, 'remis'],
    ['sans partenaire', { mode: 'FINANCEMENT', montant: '10', echeances: '3' }, 'partenaire'],
    [
      'échéances invalides',
      { mode: 'FINANCEMENT', montant: '10', partenaire: 'P', echeances: 'x' },
      'echeances',
    ],
    [
      'trop d’échéances',
      { mode: 'FINANCEMENT', montant: '10', partenaire: 'P', echeances: '61' },
      'echeances',
    ],
    [
      'zéro échéance',
      { mode: 'FINANCEMENT', montant: '10', partenaire: 'P', echeances: '0' },
      'echeances',
    ],
  ])('refuse : %s', (_, saisie, champ) => {
    expect(erreurs(encaissementSaisieSchema.safeParse({ ...SAISIE, ...saisie }))).toContain(champ);
  });

  it('calcule le rendu', () => {
    expect(calculerRendu(centimes(1_000), centimes(2_000))).toBe(1_000);
  });
});

describe('saisie d’un remboursement', () => {
  const saisie = {
    nature: 'REMBOURSEMENT',
    mode: 'CB',
    montant: '10',
    motif: 'Erreur de montant',
    reference: '',
  };

  it('garde le motif', () => {
    expect(remboursementSaisieSchema.parse(saisie)).toMatchObject({
      montantCentimes: 1_000,
      motif: 'Erreur de montant',
    });
  });

  it('exige un montant et un motif', () => {
    expect(erreurs(remboursementSaisieSchema.safeParse({ ...saisie, montant: '0' }))).toEqual([
      'montant',
    ]);
    expect(erreurs(remboursementSaisieSchema.safeParse({ ...saisie, motif: '' }))).toEqual([
      'motif',
    ]);
  });
});

const entree = (montantCentimes: number): Mouvement => ({
  nature: 'ENCAISSEMENT',
  montantCentimes,
});
const sortie = (montantCentimes: number): Mouvement => ({
  nature: 'REMBOURSEMENT',
  montantCentimes,
});
const annulation = (montantCentimes: number): Mouvement => ({
  nature: 'ANNULATION',
  montantCentimes,
});

describe('encaisseNet et resteRemboursable', () => {
  it('déduit remboursements et annulations', () => {
    expect(encaisseNet([entree(1_000), entree(500), sortie(200), annulation(100)])).toBe(1_200);
  });

  it('borne ce qu’on peut encore rendre', () => {
    expect(resteRemboursable(1_000, [{ montantCentimes: 300 }])).toBe(700);
  });
});

describe('calculerSolde', () => {
  const montants = {
    totalTtcCentimes: 100_000,
    totalAmoCentimes: 25_000,
    totalResteCentimes: 60_000,
    tiersPayantAmo: true,
  } as const;
  const facture = { ...montants, nature: 'FACTURE' } as const;
  const avoir = { ...montants, nature: 'AVOIR' } as const;
  const sansTiersPayant = { ...facture, tiersPayantAmo: false } as const;
  const avoirPartiel = {
    nature: 'AVOIR',
    totalTtcCentimes: 50_000,
    totalAmoCentimes: 12_500,
    totalResteCentimes: 30_000,
    tiersPayantAmo: true,
  } as const;

  it.each([
    ['rien de payé', [facture], [], { du: 60_000, tropPercu: 0 }],
    ['partiel', [facture], [entree(20_000)], { du: 40_000, tropPercu: 0 }],
    ['plusieurs paiements', [facture], [entree(20_000), entree(40_000)], { du: 0, tropPercu: 0 }],
    ['remboursement', [facture], [entree(60_000), sortie(10_000)], { du: 10_000, tropPercu: 0 }],
    ['payé au-delà de sa part', [facture], [entree(70_000)], { du: 0, tropPercu: 10_000 }],
    ['avoir total : trop-perçu', [facture, avoir], [entree(60_000)], { du: 0, tropPercu: 60_000 }],
    [
      'avoir partiel après paiement : trop-perçu',
      [facture, avoirPartiel],
      [entree(60_000)],
      { du: 0, tropPercu: 30_000 },
    ],
    [
      'paiements conservés sur la nouvelle facture',
      [facture, avoir, facture],
      [entree(25_000)],
      { du: 35_000, tropPercu: 0 },
    ],
    ['sans tiers payant, le patient règle l’AMO', [sansTiersPayant], [], { du: 85_000 }],
    [
      'sans tiers payant, tout est réglé',
      [sansTiersPayant],
      [entree(85_000)],
      { du: 0, tropPercu: 0 },
    ],
  ])('%s', (_, pieces, mouvements, attendu) => {
    expect(calculerSolde(pieces, mouvements)).toMatchObject(attendu);
  });

  it.each([
    ['créance transférée au patient', 40_000, { partPatient: 100_000, du: 100_000 }],
    ['transfert contre-passé', 0, { partPatient: 60_000, du: 60_000 }],
  ])('%s', (_, transferts, attendu) => {
    expect(calculerSolde([facture], [], transferts)).toMatchObject(attendu);
  });
});

describe('acomptesADeduire', () => {
  it.each([
    [1_000, 5_000, 1_000],
    [7_000, 5_000, 5_000],
    [-100, 5_000, 0],
  ])('%i disponible, %i de reste : %i', (acomptes, reste, attendu) => {
    expect(acomptesADeduire(acomptes, reste)).toBe(attendu);
  });
});

describe('chargeMouvement', () => {
  const mouvement = {
    id: 'e1',
    nature: 'REMBOURSEMENT',
    origineId: 'e0',
    factureId: 'f1',
    devisId: null,
    patientId: 'p1',
    mode: 'CHEQUE',
    montantCentimes: 1_000,
    remisCentimes: null,
    renduCentimes: 0,
    partenaire: null,
    echeances: null,
    reference: '1234567',
    motif: 'Motif libre',
  } as const;

  it('ne garde des textes libres que leur empreinte', () => {
    expect(chargeMouvement(mouvement, HACHEUR)).toMatchObject({
      referenceEmpreinte: 'h(1234567)',
      motifEmpreinte: 'h(Motif libre)',
      partenaireEmpreinte: null,
    });
    expect(JSON.stringify(chargeMouvement(mouvement, HACHEUR))).not.toContain('"Motif libre"');
  });

  it('ignore les colonnes qui ne sont pas probantes', () => {
    const ligneEnBase = { ...mouvement, createdAt: 'x', organisationId: 'o', rang: 3 };
    expect(chargeMouvement(ligneEnBase, HACHEUR)).toEqual(chargeMouvement(mouvement, HACHEUR));
  });

  it('laisse nul un texte absent', () => {
    expect(empreinteTexte(null, HACHEUR)).toBeNull();
  });
});
