import { describe, expect, it } from 'vitest';

import { SignatureLienDocument } from './lien-document';
import { SignatureLienRdv } from './lien-rdv';

const CLE = Buffer.alloc(32, 7);
const CIBLE = { organisationId: 'org', lienId: 'lien' };

describe('SignatureLienDocument', () => {
  const signature = new SignatureLienDocument(CLE);

  it('relit un jeton intact', () => {
    expect(signature.lire(signature.signer(CIBLE))).toEqual(CIBLE);
  });

  it.each([
    ['vide', ''],
    ['incomplet', 'org.lien'],
    ['trop long', 'org.lien.sig.x'],
    ['falsifié', 'org.autre.sig'],
  ])('refuse un jeton %s', (_, jeton) => {
    expect(signature.lire(jeton)).toBeNull();
  });

  it('refuse un jeton signé avec une autre clé', () => {
    const autre = new SignatureLienDocument(Buffer.alloc(32, 8));
    expect(signature.lire(autre.signer(CIBLE))).toBeNull();
  });

  it('ne vaut pas pour un lien de rendez-vous, même à clé égale', () => {
    const rdv = new SignatureLienRdv(CLE);
    const jeton = rdv.signer({ organisationId: 'org', reservationId: 'lien' });
    expect(signature.lire(jeton)).toBeNull();
  });
});
