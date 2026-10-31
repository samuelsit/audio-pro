import { describe, expect, it } from 'vitest';

import {
  deuxFacteursObligatoire,
  gereLeCentre,
  LIBELLES_ROLES,
  LIBELLES_ROLES_COMPTE,
  peutActerAppareillage,
  peutChoisirTousLesCentres,
  rattachementObligatoire,
  ROLE_SUPERADMIN,
  roleSchema,
  ROLES,
} from './roles';

describe('roleSchema', () => {
  it.each(ROLES)('accepte %s', (role) => {
    expect(roleSchema.parse(role)).toBe(role);
    expect(LIBELLES_ROLES[role]).not.toBe('');
  });

  it.each(['admin', 'ADMIN', ROLE_SUPERADMIN, 'SECRETAIRE', ''])('refuse « %s »', (role) => {
    expect(roleSchema.safeParse(role).error?.issues[0]?.message).toBe('Rôle inconnu.');
  });
});

describe('règles par rôle', () => {
  it.each([
    { role: 'ADMIN_CLIENT', rattachement: false, deuxFacteurs: true, gestion: true, acte: true },
    {
      role: 'RESPONSABLE_CENTRE',
      rattachement: true,
      deuxFacteurs: false,
      gestion: true,
      acte: true,
    },
    { role: 'AUDIO', rattachement: true, deuxFacteurs: false, gestion: false, acte: true },
    { role: 'ASSISTANT', rattachement: true, deuxFacteurs: false, gestion: false, acte: false },
  ] as const)('$role', ({ role, rattachement, deuxFacteurs, gestion, acte }) => {
    expect(rattachementObligatoire(role)).toBe(rattachement);
    expect(deuxFacteursObligatoire(role)).toBe(deuxFacteurs);
    expect(gereLeCentre(role)).toBe(gestion);
    expect(peutChoisirTousLesCentres(role)).toBe(gestion);
    expect(peutActerAppareillage(role)).toBe(acte);
  });

  it('impose la 2FA au SUPERADMIN', () => {
    expect(deuxFacteursObligatoire(ROLE_SUPERADMIN)).toBe(true);
    expect(LIBELLES_ROLES_COMPTE[ROLE_SUPERADMIN]).toBe('Éditeur');
  });
});
