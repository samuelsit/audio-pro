import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import { peutAnnulerVente, peutCorrigerIdentite, peutVoirPrixAchat } from './droits';

describe('droits sur le stock', () => {
  it.each(ROLES)('%s : réservés à l’ADMIN', (role) => {
    const admin = role === 'ADMIN';
    expect(peutAnnulerVente(role)).toBe(admin);
    expect(peutVoirPrixAchat(role)).toBe(admin);
    expect(peutCorrigerIdentite(role)).toBe(admin);
  });
});
