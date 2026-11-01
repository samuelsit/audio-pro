import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import {
  avoirAvecFseEnCours,
  construireFseDraft,
  fseAEnvoyer,
  type EntreeFse,
  type LigneFactureFse,
} from './fse';

const AIDE: LigneFactureFse = {
  codeLpp: '7310442',
  codePrestation: 'P1D',
  oreille: 'DROITE',
  numeroSerie: 'SN-1',
  quantite: 1,
  prixTTC: centimes(95_000),
  baseRemboursement: centimes(40_000),
  amo: centimes(24_000),
  amc: centimes(10_000),
  resteACharge: centimes(61_000),
};

const ENTRETIEN: LigneFactureFse = {
  ...AIDE,
  codeLpp: null,
  codePrestation: null,
  oreille: null,
  numeroSerie: null,
  baseRemboursement: centimes(0),
  amo: centimes(0),
  amc: centimes(0),
};

const ENTREE: EntreeFse = {
  tiersPayantAmo: true,
  factureId: 'f1',
  numeroFacture: 'FA-000001',
  dateFacture: '2026-11-01',
  beneficiaire: {
    nir: '100000000000000',
    rangNaissance: 1,
    qualite: 'ASSURE',
    nom: 'FICTIF',
    prenoms: 'Jean',
    dateNaissance: '1960-05-12',
    regime: '01',
    caisse: '751',
    centreGestionnaire: '0000',
  },
  praticien: {
    nom: 'Audio',
    prenom: 'Alex',
    rpps: '10000000000',
    adeli: null,
    numeroFacturationAm: '990000000',
  },
  prescripteur: { nom: 'ORL', prenom: 'Sam', rpps: null, datePrescription: '2026-08-01' },
  lignes: [AIDE, ENTRETIEN],
};

describe('construireFseDraft', () => {
  it('ne garde que les lignes remboursables, avec codes, montants et série', () => {
    const draft = construireFseDraft(ENTREE);
    expect(draft?.lignes).toEqual([{ ...AIDE, montantFacture: 95_000 }].map((l) => ({ ...l })));
    expect(draft?.totaux).toEqual({ montantFacture: 95_000, amo: 24_000, amc: 10_000 });
    expect(draft?.prescripteur).toEqual(ENTREE.prescripteur);
  });

  it.each([
    { cas: 'sans code LPP', ligne: { ...AIDE, codeLpp: null } },
    { cas: 'sans code prestation', ligne: { ...AIDE, codePrestation: null } },
    { cas: 'sans base', ligne: { ...AIDE, baseRemboursement: centimes(0) } },
  ])('écarte une ligne $cas : rien à transmettre', ({ ligne }) => {
    expect(construireFseDraft({ ...ENTREE, lignes: [ligne] })).toBeNull();
  });
});

describe('cycle de la FSE', () => {
  it.each([
    { statut: null, envoi: true, alerte: false },
    { statut: 'REJETEE', envoi: true, alerte: false },
    { statut: 'EN_ATTENTE', envoi: false, alerte: false },
    { statut: 'TRANSMISE', envoi: false, alerte: true },
    { statut: 'ACCEPTEE', envoi: false, alerte: true },
  ] as const)('$statut', ({ statut, envoi, alerte }) => {
    expect(fseAEnvoyer(statut)).toBe(envoi);
    expect(avoirAvecFseEnCours(statut)).toBe(alerte);
  });
});
