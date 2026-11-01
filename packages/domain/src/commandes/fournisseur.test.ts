import { describe, expect, it } from 'vitest';

import {
  centraleAchatSaisieSchema,
  comptesCentresSaisieSchema,
  contactFournisseurSaisieSchema,
  fournisseurSaisieSchema,
} from './fournisseur';

const ID = '019a8000-0000-7000-8000-000000000001';
const base = { type: 'FABRICANT', nom: 'Fabricant Démo', fabricantId: ID, actif: true };

describe('fournisseurSaisieSchema', () => {
  it('nettoie les champs facultatifs', () => {
    const resultat = fournisseurSaisieSchema.parse({
      ...base,
      emailCommande: ' commandes@exemple.test ',
      siret: '123 456 789 00011',
      delaiRelanceJours: '5',
      conditions: '',
    });
    expect(resultat).toMatchObject({
      emailCommande: 'commandes@exemple.test',
      siret: '12345678900011',
      delaiRelanceJours: 5,
      conditions: null,
      centraleAchatId: null,
    });
  });

  it.each([
    ['fabricant sans fiche de catalogue', { fabricantId: '' }, 'fabricantId'],
    ['fournisseur lié à un fabricant', { type: 'FOURNISSEUR' }, 'fabricantId'],
    ['e-mail invalide', { emailCommande: 'pas-une-adresse' }, 'emailCommande'],
    ['SIRET trop court', { siret: '123' }, 'siret'],
    ['délai nul', { delaiRelanceJours: '0' }, 'delaiRelanceJours'],
    ['délai trop long', { delaiRelanceJours: '91' }, 'delaiRelanceJours'],
    ['délai décimal', { delaiRelanceJours: '1,5' }, 'delaiRelanceJours'],
    ['nom vide', { nom: ' ' }, 'nom'],
  ])('refuse : %s', (_, modification, champ) => {
    const resultat = fournisseurSaisieSchema.safeParse({ ...base, ...modification });
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0]?.path[0]).toBe(champ);
  });

  it('accepte un fournisseur sans fabricant', () => {
    const resultat = fournisseurSaisieSchema.parse({
      ...base,
      type: 'FOURNISSEUR',
      fabricantId: '',
    });
    expect(resultat.fabricantId).toBeNull();
  });
});

describe('autres saisies', () => {
  it('contact', () => {
    expect(contactFournisseurSaisieSchema.parse({ nom: 'Contact Démo' })).toEqual({
      nom: 'Contact Démo',
      fonction: null,
      email: null,
      telephone: null,
    });
    expect(contactFournisseurSaisieSchema.safeParse({ nom: '' }).success).toBe(false);
  });

  it('un numéro de client vide devient null', () => {
    expect(comptesCentresSaisieSchema.parse([{ centreId: ID, numeroClient: ' ' }])).toEqual([
      { centreId: ID, numeroClient: null },
    ]);
  });

  it('centrale', () => {
    expect(centraleAchatSaisieSchema.parse({ nom: 'Centrale Démo', actif: true })).toMatchObject({
      nom: 'Centrale Démo',
      adresse: null,
    });
  });
});
