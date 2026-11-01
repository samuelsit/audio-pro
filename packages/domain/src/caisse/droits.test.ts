import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import { peutEncaisser, peutGererCaisse, peutRembourser } from './droits';

describe('droits de caisse', () => {
  it.each(ROLES)('%s', (role) => {
    const responsable = role === 'ADMIN_CLIENT' || role === 'RESPONSABLE_CENTRE';
    expect(peutEncaisser(role)).toBe(true);
    expect(peutRembourser(role)).toBe(responsable);
    expect(peutGererCaisse(role)).toBe(responsable);
  });
});
