import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { FakeESignature } from './fake-e-signature';

describe('FakeESignature', () => {
  it('rend une preuve liée au document et au tracé', async () => {
    const signature = new FakeESignature();
    const trace = new Uint8Array([1, 2, 3]);
    const preuve = await signature.signer({
      empreinteDocument: 'abc',
      trace,
      horodatage: '2026-11-01T10:00:00.000Z',
    });
    expect(preuve).toMatchObject({
      fournisseur: 'simulation',
      empreinteDocument: 'abc',
      empreinteTrace: createHash('sha256').update(trace).digest('hex'),
      horodatage: '2026-11-01T10:00:00.000Z',
    });
    expect(preuve.reference).not.toBe('');
    expect(signature.signatures).toHaveLength(1);
  });
});
