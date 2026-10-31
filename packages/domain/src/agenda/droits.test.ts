import { describe, expect, it } from 'vitest';

import { peutGererAgenda, peutGererTypesRdv } from './droits';

describe('droits de l’agenda', () => {
  it.each([
    { role: 'ADMIN_CLIENT', agenda: true, types: true },
    { role: 'RESPONSABLE_CENTRE', agenda: true, types: false },
    { role: 'AUDIO', agenda: false, types: false },
    { role: 'ASSISTANT', agenda: false, types: false },
  ] as const)('$role', ({ role, agenda, types }) => {
    expect(peutGererAgenda(role)).toBe(agenda);
    expect(peutGererTypesRdv(role)).toBe(types);
  });
});
