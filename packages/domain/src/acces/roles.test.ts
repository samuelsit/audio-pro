import { describe, expect, it } from 'vitest';

import {
  deuxFacteursObligatoire,
  LIBELLES_ROLES,
  rattachementObligatoire,
  roleSchema,
  ROLES,
} from './roles';

describe('roleSchema', () => {
  it.each(ROLES)('accepte %s', (role) => {
    expect(roleSchema.parse(role)).toBe(role);
    expect(LIBELLES_ROLES[role]).not.toBe('');
  });

  it.each(['admin', 'SECRETAIRE', ''])('refuse « %s »', (role) => {
    expect(roleSchema.safeParse(role).error?.issues[0]?.message).toBe('Rôle inconnu.');
  });
});

describe('règles par rôle', () => {
  it.each([
    { role: 'ADMIN', rattachement: false, deuxFacteurs: true },
    { role: 'AUDIO', rattachement: true, deuxFacteurs: false },
    { role: 'ASSISTANT', rattachement: true, deuxFacteurs: false },
  ] as const)('$role', ({ role, rattachement, deuxFacteurs }) => {
    expect(rattachementObligatoire(role)).toBe(rattachement);
    expect(deuxFacteursObligatoire(role)).toBe(deuxFacteurs);
  });
});
