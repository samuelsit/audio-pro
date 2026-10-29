import { describe, expect, it } from 'vitest';

import {
  LIBELLES_ACTIONS_AUDIT,
  LIBELLES_TYPES_ENTITE,
  ACTIONS_AUDIT,
  TYPES_ENTITE,
} from './actions';
import {
  assainirPourAudit,
  contientNir,
  differencesAuditees,
  resumerChampsModifies,
  VALEUR_MASQUEE,
} from './masquage';

// NIR fictifs (forme seulement) : aucune donnée réelle.
describe('contientNir', () => {
  it.each([
    { texte: '1850578006084', attendu: true, cas: '13 caractères' },
    { texte: '185057800608436', attendu: true, cas: 'avec la clé' },
    { texte: '1 85 05 78 006 084 36', attendu: true, cas: 'avec espaces' },
    { texte: '2 85 05 2A 006 084', attendu: true, cas: 'Corse 2A' },
    { texte: '28505 2b006084', attendu: true, cas: 'Corse 2b minuscule' },
    { texte: 'NIR : 7850578006084 fin', attendu: true, cas: 'au milieu d’un texte' },
    { texte: '18505780060843', attendu: true, cas: '14 chiffres (saisie incomplète)' },
    { texte: '5850578006084', attendu: false, cas: 'premier chiffre impossible' },
    { texte: '185057800608', attendu: false, cas: '12 chiffres' },
    { texte: '1850578006084361', attendu: false, cas: '16 chiffres' },
    { texte: '0400000004', attendu: false, cas: 'téléphone' },
    { texte: '19999999907', attendu: false, cas: 'RPPS' },
    { texte: '019a2f3c-1234-7123-8123-123456789012', attendu: false, cas: 'UUID' },
    { texte: '', attendu: false, cas: 'vide' },
  ])('$cas', ({ texte, attendu }) => {
    expect(contientNir(texte)).toBe(attendu);
  });
});

describe('assainirPourAudit', () => {
  it.each([
    { cas: 'undefined', valeur: undefined, attendu: null },
    { cas: 'null', valeur: null, attendu: null },
    { cas: 'texte', valeur: 'Centre A', attendu: 'Centre A' },
    { cas: 'nombre', valeur: 12, attendu: 12 },
    { cas: 'booléen', valeur: false, attendu: false },
    { cas: 'NIR', valeur: '1850578006084', attendu: VALEUR_MASQUEE },
    { cas: 'liste', valeur: ['a', '1850578006084'], attendu: ['a', VALEUR_MASQUEE] },
    {
      cas: 'objet imbriqué',
      valeur: { motif: 'x', sous: { nir: '1 85 05 78 006 084', vide: undefined } },
      attendu: { motif: 'x', sous: { nir: VALEUR_MASQUEE, vide: null } },
    },
    { cas: 'type non JSON', valeur: 10n, attendu: VALEUR_MASQUEE },
  ])('$cas', ({ valeur, attendu }) => {
    expect(assainirPourAudit(valeur)).toEqual(attendu);
  });
});

describe('differencesAuditees', () => {
  it.each([
    {
      cas: 'création : valeurs visibles, sans « avant »',
      type: 'CENTRE' as const,
      avant: null,
      apres: { nom: 'Centre A', actif: true },
      attendu: [
        { champ: 'nom', masque: false, apres: 'Centre A' },
        { champ: 'actif', masque: false, apres: true },
      ],
    },
    {
      cas: 'suppression : sans « après »',
      type: 'CENTRE' as const,
      avant: { nom: 'Centre A' },
      apres: null,
      attendu: [{ champ: 'nom', masque: false, avant: 'Centre A' }],
    },
    {
      cas: 'modification : seuls les champs changés',
      type: 'UTILISATEUR' as const,
      avant: { prenom: 'Alex', nom: 'Test', actif: true },
      apres: { prenom: 'Alex', nom: 'Essai', actif: true },
      attendu: [{ champ: 'nom', masque: false, avant: 'Test', apres: 'Essai' }],
    },
    {
      cas: 'listes comparées sans tenir compte de l’ordre',
      type: 'UTILISATEUR' as const,
      avant: { centreIds: ['a', 'b'] },
      apres: { centreIds: ['b', 'a'] },
      attendu: [],
    },
    {
      cas: 'champ hors liste blanche : valeur omise',
      type: 'UTILISATEUR' as const,
      avant: { motDePasse: 'ancien' },
      apres: { motDePasse: 'nouveau' },
      attendu: [{ champ: 'motDePasse', masque: true }],
    },
    {
      cas: 'patient : rien en clair, sauf le centre de rattachement',
      type: 'PATIENT' as const,
      avant: null,
      apres: { nom: 'Fictif', nir: '1850578006084', centreId: 'c1' },
      attendu: [
        { champ: 'nom', masque: true },
        { champ: 'nir', masque: true },
        { champ: 'centreId', masque: false, apres: 'c1' },
      ],
    },
    {
      cas: 'NIR dans un champ visible : masqué quand même',
      type: 'CENTRE' as const,
      avant: { adresseLigne2: null },
      apres: { adresseLigne2: '1850578006084' },
      attendu: [{ champ: 'adresseLigne2', masque: false, avant: null, apres: VALEUR_MASQUEE }],
    },
    {
      cas: 'champ ajouté (absent avant) et champ retiré',
      type: 'CENTRE' as const,
      avant: { ville: 'Lyon' },
      apres: { nom: 'Centre A' },
      attendu: [
        { champ: 'nom', masque: false, avant: null, apres: 'Centre A' },
        { champ: 'ville', masque: false, avant: 'Lyon', apres: null },
      ],
    },
  ])('$cas', ({ type, avant, apres, attendu }) => {
    expect(differencesAuditees(type, avant, apres)).toEqual(attendu);
  });
});

describe('libellés', () => {
  it('chaque action et chaque type d’entité a un libellé', () => {
    for (const action of ACTIONS_AUDIT) {
      expect(LIBELLES_ACTIONS_AUDIT[action]).not.toBe('');
    }
    for (const type of TYPES_ENTITE) {
      expect(LIBELLES_TYPES_ENTITE[type]).not.toBe('');
    }
  });
});

describe('resumerChampsModifies', () => {
  it.each([
    { cas: 'aucun champ', champs: [], attendu: '' },
    {
      cas: 'création',
      champs: [
        { champ: 'nom', masque: false, apres: 'Centre A' },
        { champ: 'actif', masque: false, apres: true },
        { champ: 'centreIds', masque: false, apres: ['a', 'b'] },
      ],
      attendu: 'nom : Centre A ; actif : oui ; centreIds : a, b',
    },
    {
      cas: 'modification et masquage',
      champs: [
        { champ: 'adresseLigne2', masque: false, avant: null, apres: '2e étage' },
        { champ: 'actif', masque: false, avant: true, apres: false },
        { champ: 'centreIds', masque: false, avant: [], apres: ['a'] },
        { champ: 'motDePasse', masque: true },
      ],
      attendu:
        'adresseLigne2 : (vide) → 2e étage ; actif : oui → non ; centreIds : (vide) → a ; motDePasse : modifié',
    },
    {
      cas: 'suppression, nombre et objet',
      champs: [
        { champ: 'nom', masque: false, avant: '' },
        { champ: 'quantite', masque: false, avant: 1, apres: 2 },
        { champ: 'meta', masque: false, avant: { a: 1 }, apres: null },
      ],
      attendu: 'nom : (vide) → (supprimé) ; quantite : 1 → 2 ; meta : {"a":1} → (vide)',
    },
  ])('$cas', ({ champs, attendu }) => {
    expect(resumerChampsModifies(champs)).toBe(attendu);
  });
});
