import { describe, expect, it } from 'vitest';

import { peutConfirmerAchat } from './droits';

describe('droits sur l’essai', () => {
  it.each([
    { role: 'ADMIN_CLIENT', attendu: true },
    { role: 'RESPONSABLE_CENTRE', attendu: true },
    { role: 'AUDIO', attendu: true },
    { role: 'ASSISTANT', attendu: false },
  ] as const)('$role', ({ role, attendu }) => {
    expect(peutConfirmerAchat(role)).toBe(attendu);
  });
});
