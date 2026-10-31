import { describe, expect, it } from 'vitest';

import { chargerCleLienRdv, SignatureLienRdv } from './lien-rdv';

const CLE = Buffer.alloc(32, 7);
const CIBLE = { organisationId: 'org-1', reservationId: 'res-1' };

describe('SignatureLienRdv', () => {
  const signature = new SignatureLienRdv(CLE);

  it('relit la cible d’un jeton intact, de façon stable', () => {
    const jeton = signature.signer(CIBLE);
    expect(signature.lire(jeton)).toEqual(CIBLE);
    expect(signature.signer(CIBLE)).toBe(jeton);
  });

  it.each([
    { cas: 'autre réservation', jeton: () => signature.signer(CIBLE).replace('res-1', 'res-2') },
    { cas: 'autre organisation', jeton: () => signature.signer(CIBLE).replace('org-1', 'org-2') },
    { cas: 'signature tronquée', jeton: () => signature.signer(CIBLE).slice(0, -1) },
    { cas: 'signature altérée', jeton: () => `${signature.signer(CIBLE).slice(0, -1)}x` },
    { cas: 'segment en trop', jeton: () => `${signature.signer(CIBLE)}.x` },
    { cas: 'sans signature', jeton: () => 'org-1.res-1' },
    { cas: 'vide', jeton: () => '' },
    { cas: 'autre clé', jeton: () => new SignatureLienRdv(Buffer.alloc(32, 8)).signer(CIBLE) },
  ])('refuse : $cas', ({ jeton }) => {
    expect(signature.lire(jeton())).toBeNull();
  });
});

describe('chargerCleLienRdv', () => {
  it('lit une clé de 32 octets en base64', () => {
    expect(chargerCleLienRdv({ LIEN_RDV_CLE: CLE.toString('base64') })).toEqual(CLE);
  });

  it.each([
    { cas: 'absente', env: {}, message: 'LIEN_RDV_CLE n’est pas défini' },
    { cas: 'invalide', env: { LIEN_RDV_CLE: 'court' }, message: 'LIEN_RDV_CLE invalide' },
  ])('refuse une clé $cas sans la citer', ({ env, message }) => {
    expect(() => chargerCleLienRdv(env)).toThrow(message);
  });
});
