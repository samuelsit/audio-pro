import { describe, expect, it } from 'vitest';

import { reperer, type CompteCentre, type FicheCentre, type FicheFournisseur } from './reperage';

const fournisseurs: readonly FicheFournisseur[] = [
  { id: 'f1', siret: '11111111100011', emailFacturation: 'factures@f1.exemple.test' },
  { id: 'f2', siret: null, emailFacturation: 'factures@f2.exemple.test' },
  { id: 'f3', siret: null, emailFacturation: null },
];
const centres: readonly FicheCentre[] = [
  { id: 'c1', siret: '22222222200011' },
  { id: 'c2', siret: '22222222200029' },
  { id: 'c3', siret: null },
];
const comptes: readonly CompteCentre[] = [
  { fournisseurId: 'f1', centreId: 'c1', numeroClient: 'CL-1' },
  { fournisseurId: 'f1', centreId: 'c2', numeroClient: 'CL-2' },
  { fournisseurId: 'f2', centreId: 'c2', numeroClient: 'CL-1' },
];

describe('reperer', () => {
  it.each([
    [
      'fournisseur par SIRET, centre par SIRET',
      { sirets: ['11111111100011', '22222222200011'], numerosClient: [] },
      null,
      { fournisseurId: 'f1', centreId: 'c1', expediteurInconnu: false },
    ],
    [
      'fournisseur par expéditeur, sans tenir compte de la casse',
      { sirets: [], numerosClient: [] },
      ' Factures@F2.exemple.test',
      { fournisseurId: 'f2', centreId: null, expediteurInconnu: false },
    ],
    [
      'le numéro de client dépend du fournisseur',
      { sirets: [], numerosClient: ['CL-1'] },
      'factures@f2.exemple.test',
      { fournisseurId: 'f2', centreId: 'c2', expediteurInconnu: false },
    ],
    [
      'sans fournisseur, un numéro ambigu ne désigne personne',
      { sirets: [], numerosClient: ['CL-1'] },
      null,
      { fournisseurId: null, centreId: null, expediteurInconnu: false },
    ],
    [
      'deux centres cités : aucun choix au hasard',
      { sirets: ['22222222200011', '22222222200029'], numerosClient: [] },
      null,
      { fournisseurId: null, centreId: null, expediteurInconnu: false },
    ],
    [
      'expéditeur inconnu, signalé',
      { sirets: ['11111111100011'], numerosClient: [] },
      'autre@exemple.test',
      { fournisseurId: 'f1', centreId: null, expediteurInconnu: true },
    ],
  ])('%s', (_, extraite, expediteur, attendu) => {
    expect(reperer(extraite, expediteur, fournisseurs, centres, comptes)).toEqual(attendu);
  });
});
