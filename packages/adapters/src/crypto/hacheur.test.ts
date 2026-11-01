import { describe, expect, it } from 'vitest';

import { HacheurSha256 } from './hacheur';

describe('HacheurSha256', () => {
  it('rend le SHA-256 en hexadécimal', () => {
    expect(new HacheurSha256().sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
