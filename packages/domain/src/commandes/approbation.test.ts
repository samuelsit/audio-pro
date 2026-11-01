import { describe, expect, it } from 'vitest';

import {
  deciderApprobation,
  montantCommande,
  type CommandeAEvaluer,
  type RegleApprobation,
} from './approbation';

const FOURNISSEUR = 'fournisseur-1';
const CENTRE = 'centre-1';

function regle(modification: Partial<RegleApprobation>): RegleApprobation {
  return {
    id: 'r',
    priorite: 10,
    montantMaxCentimes: null,
    typeProduit: null,
    fournisseurId: null,
    centreId: null,
    decision: 'ENVOI_DIRECT',
    ...modification,
  };
}

const commande: CommandeAEvaluer = {
  montantCentimes: 100_000,
  typesProduit: ['PILE'],
  fournisseurId: FOURNISSEUR,
  centreId: CENTRE,
};

describe('deciderApprobation', () => {
  it.each<[string, readonly RegleApprobation[], Partial<CommandeAEvaluer>, string, string | null]>([
    ['sans règle, un humain approuve', [], {}, 'APPROBATION', null],
    ['règle sans critère', [regle({})], {}, 'ENVOI_DIRECT', 'r'],
    ['montant sous le plafond', [regle({ montantMaxCentimes: 200_000 })], {}, 'ENVOI_DIRECT', 'r'],
    ['montant égal au plafond', [regle({ montantMaxCentimes: 100_000 })], {}, 'ENVOI_DIRECT', 'r'],
    ['montant au-dessus', [regle({ montantMaxCentimes: 99_999 })], {}, 'APPROBATION', null],
    ['bon type', [regle({ typeProduit: 'PILE' })], {}, 'ENVOI_DIRECT', 'r'],
    ['autre type', [regle({ typeProduit: 'APPAREIL' })], {}, 'APPROBATION', null],
    [
      'commande mixte : toutes les lignes doivent être du type',
      [regle({ typeProduit: 'PILE' })],
      { typesProduit: ['PILE', 'APPAREIL'] },
      'APPROBATION',
      null,
    ],
    ['bon fournisseur', [regle({ fournisseurId: FOURNISSEUR })], {}, 'ENVOI_DIRECT', 'r'],
    ['autre fournisseur', [regle({ fournisseurId: 'autre' })], {}, 'APPROBATION', null],
    ['bon centre', [regle({ centreId: CENTRE })], {}, 'ENVOI_DIRECT', 'r'],
    ['autre centre', [regle({ centreId: 'autre' })], {}, 'APPROBATION', null],
    [
      'tous les critères doivent correspondre',
      [regle({ typeProduit: 'PILE', centreId: 'autre' })],
      {},
      'APPROBATION',
      null,
    ],
    [
      'montant inconnu : jamais d’envoi direct',
      [regle({})],
      { montantCentimes: null },
      'APPROBATION',
      null,
    ],
    [
      'la priorité la plus basse l’emporte',
      [
        regle({ id: 'tardive', priorite: 20 }),
        regle({ id: 'prioritaire', priorite: 1, decision: 'APPROBATION' }),
      ],
      {},
      'APPROBATION',
      'prioritaire',
    ],
    [
      'une règle qui ne correspond pas laisse passer la suivante',
      [
        regle({ id: 'autre', priorite: 1, centreId: 'autre', decision: 'APPROBATION' }),
        regle({ id: 'suivante', priorite: 2 }),
      ],
      {},
      'ENVOI_DIRECT',
      'suivante',
    ],
    [
      'à priorité égale, ordre stable par identifiant',
      [
        regle({ id: 'b', priorite: 1, decision: 'APPROBATION' }),
        regle({ id: 'a', priorite: 1, decision: 'ENVOI_DIRECT' }),
      ],
      {},
      'ENVOI_DIRECT',
      'a',
    ],
  ])('%s', (_, regles, modification, decision, regleId) => {
    expect(deciderApprobation(regles, { ...commande, ...modification })).toEqual({
      decision,
      regleId,
    });
  });
});

describe('montantCommande', () => {
  it.each([
    [
      'additionne',
      [
        { quantite: 2, prixAchatCentimes: 100 },
        { quantite: 1, prixAchatCentimes: 50 },
      ],
      250,
    ],
    ['un prix inconnu rend le montant inconnu', [{ quantite: 2, prixAchatCentimes: null }], null],
    ['commande vide', [], 0],
  ])('%s', (_, lignes, attendu) => {
    expect(montantCommande(lignes)).toBe(attendu);
  });
});
