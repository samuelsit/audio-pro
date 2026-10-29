import { z } from 'zod';

export const ROLES = ['ADMIN', 'AUDIO', 'ASSISTANT'] as const;

export const roleSchema = z.enum(ROLES, { error: 'Rôle inconnu.' });
export type Role = z.infer<typeof roleSchema>;

export const LIBELLES_ROLES: Readonly<Record<Role, string>> = {
  ADMIN: 'Administrateur',
  AUDIO: 'Audioprothésiste',
  ASSISTANT: 'Assistant(e)',
};

/** L'ADMIN accède à tous les centres du réseau ; les autres rôles doivent être rattachés à au moins un centre. */
export function rattachementObligatoire(role: Role): boolean {
  return role !== 'ADMIN';
}

/** 2FA TOTP : obligatoire pour l'ADMIN, facultative (mais prévue) pour les autres rôles. */
export function deuxFacteursObligatoire(role: Role): boolean {
  return role === 'ADMIN';
}
