import { describe, expect, it } from 'vitest';

import type { Role } from '../acces/roles';
import {
  peutConsulterCommunication,
  peutGererCampagnes,
  peutGererCourriers,
  peutNoterConsentement,
  peutParametrerCommunication,
} from './droits';

describe('droits de communication', () => {
  it.each<[Role, boolean, boolean, boolean, boolean, boolean]>([
    ['ADMIN_CLIENT', true, true, true, true, true],
    ['RESPONSABLE_CENTRE', true, true, true, false, true],
    ['AUDIO', true, false, false, false, true],
    ['ASSISTANT', true, false, false, false, true],
  ])('%s', (role, consulte, campagnes, courriers, parametre, consentement) => {
    expect(peutConsulterCommunication(role)).toBe(consulte);
    expect(peutGererCampagnes(role)).toBe(campagnes);
    expect(peutGererCourriers(role)).toBe(courriers);
    expect(peutParametrerCommunication(role)).toBe(parametre);
    expect(peutNoterConsentement(role)).toBe(consentement);
  });
});
