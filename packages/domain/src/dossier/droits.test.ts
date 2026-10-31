import { describe, expect, it } from 'vitest';

import { peutAbandonnerDossier, peutForcerPrescription } from './droits';

describe('droits sur le dossier', () => {
  it.each([
    { role: 'ADMIN', forcer: true, abandonner: true },
    { role: 'AUDIO', forcer: false, abandonner: true },
    { role: 'ASSISTANT', forcer: false, abandonner: false },
  ] as const)('$role', ({ role, forcer, abandonner }) => {
    expect(peutForcerPrescription(role)).toBe(forcer);
    expect(peutAbandonnerDossier(role)).toBe(abandonner);
  });
});
