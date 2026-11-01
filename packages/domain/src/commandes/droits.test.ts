import { describe, expect, it } from 'vitest';

import { ROLES, type Role } from '../acces/roles';
import {
  peutApprouverCommande,
  peutDemanderCommande,
  peutGererAchats,
  peutGererFournisseurs,
} from './droits';

describe('droits sur les commandes', () => {
  it.each<[Role, boolean, boolean, boolean]>([
    ['ADMIN_CLIENT', true, true, true],
    ['RESPONSABLE_CENTRE', false, true, true],
    ['AUDIO', false, false, false],
    ['ASSISTANT', false, false, false],
  ])('%s', (role, fiches, approbation, achats) => {
    expect(peutGererFournisseurs(role)).toBe(fiches);
    expect(peutApprouverCommande(role)).toBe(approbation);
    expect(peutGererAchats(role)).toBe(achats);
  });

  it('tous les rôles d’un client demandent une commande', () => {
    expect(ROLES.every(peutDemanderCommande)).toBe(true);
  });
});
