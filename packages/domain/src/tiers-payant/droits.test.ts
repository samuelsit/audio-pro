import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import {
  peutGererComplementaires,
  peutRegulariserTiersPayant,
  peutSuivreTiersPayant,
} from './droits';

describe('droits du tiers payant', () => {
  it.each(ROLES)('%s', (role) => {
    const responsable = role === 'ADMIN_CLIENT' || role === 'RESPONSABLE_CENTRE';
    expect(peutSuivreTiersPayant(role)).toBe(true);
    expect(peutRegulariserTiersPayant(role)).toBe(responsable);
    expect(peutGererComplementaires(role)).toBe(responsable);
  });
});
