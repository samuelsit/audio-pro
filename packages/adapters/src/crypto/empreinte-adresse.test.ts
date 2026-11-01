import { describe, expect, it } from 'vitest';

import { EmpreinteAdresse } from './empreinte-adresse';

const empreinte = new EmpreinteAdresse(Buffer.alloc(32, 7));

describe('EmpreinteAdresse', () => {
  it('est stable', () => {
    expect(empreinte.calculer('SMS', '+33600000000')).toBe(
      empreinte.calculer('SMS', '+33600000000'),
    );
  });

  it('dépend du canal', () => {
    expect(empreinte.calculer('SMS', 'x')).not.toBe(empreinte.calculer('EMAIL', 'x'));
  });

  it('dépend de la clé', () => {
    const autre = new EmpreinteAdresse(Buffer.alloc(32, 8));
    expect(autre.calculer('SMS', 'x')).not.toBe(empreinte.calculer('SMS', 'x'));
  });
});
