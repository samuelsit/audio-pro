import { describe, expect, it } from 'vitest';

import {
  commandeAnnulable,
  commandeCloturable,
  commandeModifiable,
  prixCommandeModifiable,
  resteARecevoir,
  statutSelonQuantites,
  STATUTS_COMMANDE,
  transitionCommandeAutorisee,
  type QuantitesLigne,
  type StatutCommande,
} from './etats';

function ligne(modification: Partial<QuantitesLigne>): QuantitesLigne {
  return {
    quantite: 2,
    quantiteRecue: 0,
    quantiteFacturee: 0,
    quantiteAbandonnee: 0,
    enConsignation: false,
    ...modification,
  };
}

describe('transitions', () => {
  it.each<[StatutCommande, StatutCommande, boolean]>([
    ['BROUILLON', 'A_APPROUVER', true],
    ['BROUILLON', 'APPROUVEE', true],
    ['BROUILLON', 'ENVOYEE', false],
    ['A_APPROUVER', 'BROUILLON', true],
    ['APPROUVEE', 'ENVOYEE', true],
    ['ENVOYEE', 'RECUE', true],
    ['ENVOYEE', 'FACTUREE', false],
    ['PARTIELLEMENT_RECUE', 'ANNULEE', false],
    ['RECUE', 'CLOSE', true],
    ['FACTUREE', 'CLOSE', true],
    ['CLOSE', 'FACTUREE', false],
    ['ANNULEE', 'BROUILLON', false],
  ])('%s → %s : %s', (de, vers, attendu) => {
    expect(transitionCommandeAutorisee(de, vers)).toBe(attendu);
  });

  it('seul le brouillon se modifie, le prix jusqu’à l’approbation', () => {
    expect(STATUTS_COMMANDE.filter(commandeModifiable)).toEqual(['BROUILLON']);
    expect(STATUTS_COMMANDE.filter(prixCommandeModifiable)).toEqual(['BROUILLON', 'A_APPROUVER']);
  });
});

describe('resteARecevoir', () => {
  it.each([
    ['rien de reçu', ligne({}), 2],
    ['partiel', ligne({ quantiteRecue: 1 }), 1],
    ['reliquat abandonné', ligne({ quantiteRecue: 1, quantiteAbandonnee: 1 }), 0],
    ['surplus', ligne({ quantiteRecue: 3 }), 0],
  ])('%s', (_, l, attendu) => {
    expect(resteARecevoir(l)).toBe(attendu);
  });
});

describe('statutSelonQuantites', () => {
  it.each<[string, StatutCommande, readonly QuantitesLigne[], StatutCommande]>([
    ['rien reçu', 'ENVOYEE', [ligne({})], 'ENVOYEE'],
    ['réception partielle', 'ENVOYEE', [ligne({ quantiteRecue: 1 })], 'PARTIELLEMENT_RECUE'],
    [
      'une ligne sur deux reçue',
      'ENVOYEE',
      [ligne({ quantiteRecue: 2 }), ligne({})],
      'PARTIELLEMENT_RECUE',
    ],
    ['complète', 'PARTIELLEMENT_RECUE', [ligne({ quantiteRecue: 2 })], 'RECUE'],
    [
      'reliquat abandonné',
      'PARTIELLEMENT_RECUE',
      [ligne({ quantiteRecue: 1, quantiteAbandonnee: 1 })],
      'RECUE',
    ],
    [
      'un surplus ne compense pas un manque',
      'ENVOYEE',
      [ligne({ quantiteRecue: 4 }), ligne({ quantiteRecue: 1 })],
      'PARTIELLEMENT_RECUE',
    ],
    [
      'facture avant livraison : reste sans statut facturé',
      'ENVOYEE',
      [ligne({ quantiteFacturee: 2 })],
      'ENVOYEE',
    ],
    [
      'facture avant la fin de la livraison',
      'PARTIELLEMENT_RECUE',
      [ligne({ quantiteRecue: 1, quantiteFacturee: 2 })],
      'PARTIELLEMENT_RECUE',
    ],
    [
      'reçue puis facturée',
      'RECUE',
      [ligne({ quantiteRecue: 2, quantiteFacturee: 2 })],
      'FACTUREE',
    ],
    ['facture partielle', 'RECUE', [ligne({ quantiteRecue: 2, quantiteFacturee: 1 })], 'RECUE'],
    [
      'une ligne en consignation n’attend pas de facture',
      'RECUE',
      [
        ligne({ quantiteRecue: 2, quantiteFacturee: 2 }),
        ligne({ quantiteRecue: 2, enConsignation: true }),
      ],
      'FACTUREE',
    ],
    [
      'toute en consignation : reçue',
      'RECUE',
      [ligne({ quantiteRecue: 2, enConsignation: true })],
      'RECUE',
    ],
    [
      'une ligne abandonnée sans rien reçu n’attend pas de facture',
      'RECUE',
      [ligne({ quantiteRecue: 2, quantiteFacturee: 2 }), ligne({ quantiteAbandonnee: 2 })],
      'FACTUREE',
    ],
    ['ne touche pas à un brouillon', 'BROUILLON', [ligne({ quantiteRecue: 2 })], 'BROUILLON'],
    ['ne touche pas à une commande close', 'CLOSE', [ligne({})], 'CLOSE'],
  ])('%s', (_, statut, lignes, attendu) => {
    expect(statutSelonQuantites(statut, lignes)).toBe(attendu);
  });
});

describe('commandeCloturable', () => {
  const recue = ligne({ quantiteRecue: 2 });
  it.each<[string, StatutCommande, readonly QuantitesLigne[], number, boolean]>([
    ['facturée, sans écart', 'FACTUREE', [recue], 0, true],
    ['écart ouvert', 'FACTUREE', [recue], 1, false],
    ['reçue, à facturer', 'RECUE', [recue], 0, false],
    ['reçue, en consignation', 'RECUE', [ligne({ enConsignation: true })], 0, true],
    ['envoyée', 'ENVOYEE', [recue], 0, false],
  ])('%s', (_, statut, lignes, ecarts, attendu) => {
    expect(commandeCloturable(statut, lignes, ecarts)).toBe(attendu);
  });
});

describe('commandeAnnulable', () => {
  it.each<[string, StatutCommande, readonly QuantitesLigne[], boolean]>([
    ['brouillon', 'BROUILLON', [ligne({})], true],
    ['envoyée, rien reçu', 'ENVOYEE', [ligne({})], true],
    ['envoyée, déjà reçue', 'ENVOYEE', [ligne({ quantiteRecue: 1 })], false],
    ['partiellement reçue', 'PARTIELLEMENT_RECUE', [ligne({ quantiteRecue: 1 })], false],
    ['close', 'CLOSE', [ligne({})], false],
  ])('%s', (_, statut, lignes, attendu) => {
    expect(commandeAnnulable(statut, lignes)).toBe(attendu);
  });
});
