import { describe, expect, it } from 'vitest';

import { ROLES } from '../acces/roles';
import {
  peutDiagnostiquerSav,
  peutGererParcPret,
  peutParametrerSav,
  peutSuivreSav,
} from './droits';

describe('droits du SAV', () => {
  it.each(ROLES)('%s', (role) => {
    expect(peutSuivreSav(role)).toBe(true);
    expect(peutParametrerSav(role)).toBe(role === 'ADMIN_CLIENT');
    expect(peutDiagnostiquerSav(role)).toBe(role !== 'ASSISTANT');
    expect(peutGererParcPret(role)).toBe(role === 'ADMIN_CLIENT' || role === 'RESPONSABLE_CENTRE');
  });
});
