import { describe, expect, it } from 'vitest';

import { filtreStockSchema } from './filtre';
import {
  annulationVenteSaisieSchema,
  changementStatutSaisieSchema,
  dateReceptionValide,
  modificationAppareilSaisieSchema,
  mouvementAccessoireSaisieSchema,
  NUMEROS_MAX_PAR_RECEPTION,
  receptionSaisieSchema,
  transfertAccessoireSaisieSchema,
  transfertSaisieSchema,
} from './saisie';

const ID_A = '0190a000-0000-7000-8000-000000000001';
const ID_B = '0190a000-0000-7000-8000-000000000002';

const reception = {
  centreId: ID_A,
  modeleId: ID_B,
  numerosSerie: ['ab123', 'cd456'],
  referenceBonLivraison: ' BL-1 ',
  referenceFactureFabricant: '',
  dateReception: '2026-10-31',
  prixAchatCentimes: '',
  enConsignation: false,
};

function messages(resultat: { error?: { issues: { message: string }[] } }): string[] {
  return resultat.error?.issues.map((i) => i.message) ?? [];
}

describe('receptionSaisieSchema', () => {
  it('normalise les numéros et vide les champs facultatifs', () => {
    expect(receptionSaisieSchema.parse(reception)).toEqual({
      ...reception,
      numerosSerie: ['AB123', 'CD456'],
      referenceBonLivraison: 'BL-1',
      referenceFactureFabricant: null,
      prixAchatCentimes: null,
    });
  });

  it('lit le prix d’achat en euros', () => {
    const lu = receptionSaisieSchema.parse({ ...reception, prixAchatCentimes: '650,50' });
    expect(lu.prixAchatCentimes).toBe(65050);
  });

  it.each([
    { cas: 'liste vide', champ: { numerosSerie: [] }, attendu: 'Saisir au moins' },
    { cas: 'liste absente', champ: { numerosSerie: undefined }, attendu: 'Saisir au moins' },
    { cas: 'numéro invalide', champ: { numerosSerie: ['AB'] }, attendu: 'invalide : « AB »' },
    {
      cas: 'doublon après normalisation',
      champ: { numerosSerie: ['ab123', 'AB 123'] },
      attendu: 'Numéro saisi deux fois : AB123.',
    },
    {
      cas: 'liste trop longue',
      champ: {
        numerosSerie: Array.from({ length: NUMEROS_MAX_PAR_RECEPTION + 1 }, (_, i) => `SN${i}000`),
      },
      attendu: `${NUMEROS_MAX_PAR_RECEPTION} numéros au maximum`,
    },
    { cas: 'BL vide', champ: { referenceBonLivraison: ' ' }, attendu: 'bon de livraison' },
    { cas: 'centre absent', champ: { centreId: 'x' }, attendu: 'Choisir un centre.' },
    { cas: 'modèle absent', champ: { modeleId: '' }, attendu: 'Choisir un modèle.' },
    { cas: 'prix illisible', champ: { prixAchatCentimes: 'abc' }, attendu: 'Prix invalide' },
    { cas: 'date invalide', champ: { dateReception: '2026-02-30' }, attendu: 'n’existe pas' },
    {
      cas: 'facture trop longue',
      champ: { referenceFactureFabricant: 'F'.repeat(101) },
      attendu: '100 caractères',
    },
  ])('refuse : $cas', ({ champ, attendu }) => {
    const resultat = receptionSaisieSchema.safeParse({ ...reception, ...champ });
    expect(messages(resultat).join(' ')).toContain(attendu);
  });
});

describe('dateReceptionValide', () => {
  it.each([
    { date: '2026-10-30', attendu: true },
    { date: '2026-10-31', attendu: true },
    { date: '2026-11-01', attendu: false },
  ])('$date : $attendu', ({ date, attendu }) => {
    expect(dateReceptionValide(date, '2026-10-31')).toBe(attendu);
  });
});

describe('schémas des mouvements', () => {
  const changement = { statut: 'SAV', statutAttendu: 'EN_STOCK', motif: 'Panne' };

  it('un changement de statut lit le patient facultatif', () => {
    expect(
      changementStatutSaisieSchema.parse({ ...changement, patientId: '', motif: ' Panne ' }),
    ).toEqual({ ...changement, patientId: null, motif: 'Panne' });
    expect(
      changementStatutSaisieSchema.parse({ ...changement, patientId: ID_A, motif: 'Essai' })
        .patientId,
    ).toBe(ID_A);
  });

  it.each([
    { cas: 'statut inconnu', saisie: { statut: 'PERDU' }, attendu: 'Choisir un statut.' },
    {
      cas: 'statut attendu absent',
      saisie: { statutAttendu: undefined },
      attendu: 'Statut actuel inconnu.',
    },
    { cas: 'patient invalide', saisie: { patientId: 'x' }, attendu: 'Patient inconnu.' },
    { cas: 'motif vide', saisie: { motif: '  ' }, attendu: 'motif est obligatoire' },
    { cas: 'motif trop long', saisie: { motif: 'x'.repeat(501) }, attendu: '500 caractères' },
  ])('changement de statut refusé : $cas', ({ saisie, attendu }) => {
    expect(
      messages(changementStatutSaisieSchema.safeParse({ ...changement, ...saisie })).join(' '),
    ).toContain(attendu);
  });

  it('un transfert exige une destination et un motif', () => {
    const transfert = { centreDestinationId: ID_A, centreOrigineId: ID_B, motif: 'Besoin' };
    expect(transfertSaisieSchema.parse(transfert)).toEqual(transfert);
    expect(messages(transfertSaisieSchema.safeParse({ motif: '' }))).toEqual([
      'Choisir le centre de destination.',
      'Centre actuel inconnu.',
      'Le motif est obligatoire.',
    ]);
  });

  it('une annulation exige un motif', () => {
    expect(annulationVenteSaisieSchema.safeParse({ motif: '' }).success).toBe(false);
    expect(annulationVenteSaisieSchema.parse({ motif: 'Rétractation' }).motif).toBe('Rétractation');
  });
});

describe('modificationAppareilSaisieSchema', () => {
  const base = {
    referenceBonLivraison: 'BL-1',
    referenceFactureFabricant: 'F-9',
    prixAchatCentimes: '',
    enConsignation: true,
  };

  it('sans correction, ni numéro ni modèle', () => {
    expect(modificationAppareilSaisieSchema.parse(base)).toEqual({
      ...base,
      prixAchatCentimes: null,
    });
  });

  it('une correction normalise le numéro', () => {
    const lu = modificationAppareilSaisieSchema.parse({
      ...base,
      numeroSerie: 'ab 123',
      modeleId: ID_A,
    });
    expect(lu.numeroSerie).toBe('AB123');
    expect(lu.modeleId).toBe(ID_A);
  });
});

describe('schémas des accessoires', () => {
  const mouvement = { centreId: ID_A, accessoireId: ID_B, quantite: '3', motif: 'Livraison' };

  it('lit une quantité saisie en texte', () => {
    expect(mouvementAccessoireSaisieSchema.parse(mouvement).quantite).toBe(3);
  });

  it.each([
    { quantite: '0', attendu: 'au moins de 1' },
    { quantite: '-2', attendu: 'au moins de 1' },
    { quantite: '1,5', attendu: 'Quantité invalide' },
    { quantite: '1.5', attendu: 'nombre entier' },
    { quantite: '100001', attendu: 'au maximum' },
  ])('refuse la quantité $quantite', ({ quantite, attendu }) => {
    const resultat = mouvementAccessoireSaisieSchema.safeParse({ ...mouvement, quantite });
    expect(messages(resultat).join(' ')).toContain(attendu);
  });

  it('un transfert va vers un autre centre', () => {
    expect(
      transfertAccessoireSaisieSchema.parse({ ...mouvement, centreDestinationId: ID_B })
        .centreDestinationId,
    ).toBe(ID_B);
    expect(
      messages(
        transfertAccessoireSaisieSchema.safeParse({ ...mouvement, centreDestinationId: ID_A }),
      ),
    ).toEqual(['Choisir un autre centre.']);
  });
});

describe('filtreStockSchema', () => {
  it('ignore les paramètres vides et ramène une page invalide à 1', () => {
    expect(
      filtreStockSchema.parse({ statut: '', modeleId: '', fabricantId: ' ', page: 'x' }),
    ).toEqual({ statut: undefined, modeleId: undefined, fabricantId: undefined, page: 1 });
  });

  it('garde les filtres valides', () => {
    expect(
      filtreStockSchema.parse({ statut: 'SAV', modeleId: ID_A, fabricantId: ID_B, page: '2' }),
    ).toEqual({ statut: 'SAV', modeleId: ID_A, fabricantId: ID_B, page: 2 });
  });

  it.each([{ statut: 'PERDU' }, { modeleId: 'x' }, { fabricantId: 'x' }])('refuse %o', (filtre) => {
    expect(filtreStockSchema.safeParse(filtre).success).toBe(false);
  });
});
