import { describe, expect, it } from 'vitest';

import { dateDelivranceSaisieSchema, filtreAFacturerSchema, pecSaisieSchema } from './saisie';

const accordee = {
  statut: 'ACCORDEE',
  organisme: ' Mutuelle Exemple ',
  plateforme: 'Plateforme fictive',
  numeroAccord: 'ACC-1',
  montantAccorde: '710,00',
  datePec: '2026-10-20',
};

const message = (saisie: unknown, champ: string) =>
  pecSaisieSchema.safeParse(saisie).error?.issues.find((i) => i.path[0] === champ)?.message;

describe('pecSaisieSchema', () => {
  it('accepte une prise en charge accordée', () => {
    expect(pecSaisieSchema.parse(accordee)).toEqual({
      statut: 'ACCORDEE',
      organisme: 'Mutuelle Exemple',
      plateforme: 'Plateforme fictive',
      numeroAccord: 'ACC-1',
      montantAccordeCentimes: 71_000,
      datePec: '2026-10-20',
    });
  });

  it.each([
    { champ: 'organisme', valeur: '', attendu: 'L’organisme est obligatoire.' },
    { champ: 'datePec', valeur: '', attendu: 'La date est obligatoire.' },
    { champ: 'numeroAccord', valeur: '', attendu: 'Le numéro d’accord est obligatoire.' },
    { champ: 'montantAccorde', valeur: '', attendu: 'Le montant accordé est obligatoire.' },
    {
      champ: 'montantAccorde',
      valeur: 'beaucoup',
      attendu: 'Montant invalide (exemple : 710,00).',
    },
  ])('refuse $champ « $valeur »', ({ champ, valeur, attendu }) => {
    expect(message({ ...accordee, [champ]: valeur }, champ)).toBe(attendu);
  });

  it('ne garde pas de montant sur une demande', () => {
    const demandee = pecSaisieSchema.parse({ ...accordee, statut: 'DEMANDEE', numeroAccord: '' });
    expect(demandee).toMatchObject({ montantAccordeCentimes: null, numeroAccord: null });
  });

  it('exige organisme et date sur un refus', () => {
    const saisie = { statut: 'REFUSEE', organisme: '', datePec: '' };
    expect(message(saisie, 'organisme')).toBeDefined();
    expect(message(saisie, 'datePec')).toBeDefined();
  });

  it('vide tout sans tiers payant', () => {
    expect(pecSaisieSchema.parse({ ...accordee, statut: 'SANS_TIERS_PAYANT' })).toEqual({
      statut: 'SANS_TIERS_PAYANT',
      organisme: null,
      plateforme: null,
      numeroAccord: null,
      montantAccordeCentimes: null,
      datePec: null,
    });
  });

  it('refuse un statut inconnu', () => {
    expect(message({ statut: 'ENVOYEE' }, 'statut')).toBe('Choisir le statut.');
  });
});

describe('dateDelivranceSaisieSchema', () => {
  it('valide une date calendaire', () => {
    expect(dateDelivranceSaisieSchema.safeParse({ dateDelivrance: '2026-02-30' }).success).toBe(
      false,
    );
  });
});

describe('filtreAFacturerSchema', () => {
  it('revient aux dossiers prêts sur un état inconnu', () => {
    expect(filtreAFacturerSchema.parse({ page: 'x', etat: 'autre' })).toEqual({
      page: 1,
      etat: 'PRET',
    });
    expect(filtreAFacturerSchema.parse({ etat: 'BLOQUE' }).etat).toBe('BLOQUE');
  });
});
