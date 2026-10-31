import { z } from 'zod';

/** Rôles d'un compte client, assignables depuis l'administration du client. */
export const ROLES = ['ADMIN_CLIENT', 'RESPONSABLE_CENTRE', 'AUDIO', 'ASSISTANT'] as const;

export const roleSchema = z.enum(ROLES, { error: 'Rôle inconnu.' });
export type Role = z.infer<typeof roleSchema>;

/** Console éditeur : hors de toute organisation, jamais assignable depuis un client (ADR-017). */
export const ROLE_SUPERADMIN = 'SUPERADMIN';
export type RoleCompte = Role | typeof ROLE_SUPERADMIN;

export const LIBELLES_ROLES: Readonly<Record<Role, string>> = {
  ADMIN_CLIENT: 'Administrateur',
  RESPONSABLE_CENTRE: 'Responsable de centre',
  AUDIO: 'Audioprothésiste',
  ASSISTANT: 'Assistant(e)',
};

/** Libellés de tous les comptes, console comprise (journal d'audit). */
export const LIBELLES_ROLES_COMPTE: Readonly<Record<RoleCompte, string>> = {
  ...LIBELLES_ROLES,
  [ROLE_SUPERADMIN]: 'Éditeur',
};

/** L'ADMIN_CLIENT accède à tous les centres du client ; les autres rôles doivent être rattachés à au moins un centre. */
export function rattachementObligatoire(role: Role): boolean {
  return role !== 'ADMIN_CLIENT';
}

/** 2FA TOTP : obligatoire pour ADMIN_CLIENT et SUPERADMIN, facultative pour les autres rôles. */
export function deuxFacteursObligatoire(role: RoleCompte): boolean {
  return role === 'ADMIN_CLIENT' || role === ROLE_SUPERADMIN;
}

/** Peut choisir « Tous mes centres » dans le sélecteur de centre courant. */
export function peutChoisirTousLesCentres(role: Role): boolean {
  return role === 'ADMIN_CLIENT' || role === 'RESPONSABLE_CENTRE';
}

/** Actions de gestion du centre : réservées à l'ADMIN_CLIENT et, sur ses centres, au responsable. */
export function gereLeCentre(role: Role): boolean {
  return peutChoisirTousLesCentres(role);
}

/** Actes du parcours d'appareillage : audioprothésiste, ou rôle de gestion du centre. */
export function peutActerAppareillage(role: Role): boolean {
  return gereLeCentre(role) || role === 'AUDIO';
}
