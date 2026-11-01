import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import { peutEmettreAvoir, peutGererSerie, peutValiderFacture } from './droits';

describe('droits de facturation', () => {
  it.each(ROLES)('%s', (role) => {
    expect(peutValiderFacture(role)).toBe(role !== 'ASSISTANT');
    expect(peutEmettreAvoir(role)).toBe(role === 'ADMIN_CLIENT' || role === 'RESPONSABLE_CENTRE');
    expect(peutGererSerie(role)).toBe(role === 'ADMIN_CLIENT');
  });
});
