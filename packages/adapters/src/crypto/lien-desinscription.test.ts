import { describe, expect, it } from 'vitest';

import { SignatureLienDesinscription } from './lien-desinscription';

const signature = new SignatureLienDesinscription(Buffer.alloc(32, 7));
const CIBLE = { organisationId: 'org', messageId: 'msg' };

describe('SignatureLienDesinscription', () => {
  it('relit un jeton intact', () => {
    expect(signature.lire(signature.signer(CIBLE))).toEqual(CIBLE);
  });

  it.each([
    ['message changé', (j: string) => j.replace('msg', 'autre')],
    ['signature tronquée', (j: string) => j.slice(0, -2)],
    ['sans signature', () => 'org.msg'],
    ['segment en trop', (j: string) => `${j}.x`],
    ['vide', () => ''],
  ])('refuse : %s', (_, modifier) => {
    expect(signature.lire(modifier(signature.signer(CIBLE)))).toBeNull();
  });

  it('refuse le jeton d’une autre clé', () => {
    const autre = new SignatureLienDesinscription(Buffer.alloc(32, 8));
    expect(signature.lire(autre.signer(CIBLE))).toBeNull();
  });
});
