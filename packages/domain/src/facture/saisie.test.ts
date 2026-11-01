import { describe, expect, it } from 'vitest';

import {
  filtreAFacturerSchema,
  filtreFacturesSchema,
  ligneBrouillonSaisieSchema,
  pecSaisieSchema,
  venteDirecteSaisieSchema,
} from './saisie';

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

describe('filtreAFacturerSchema', () => {
  it('revient aux dossiers prêts sur un état inconnu', () => {
    expect(filtreAFacturerSchema.parse({ page: 'x', etat: 'autre' })).toEqual({
      page: 1,
      etat: 'PRET',
    });
    expect(filtreAFacturerSchema.parse({ etat: 'BLOQUE' }).etat).toBe('BLOQUE');
  });
});

describe('filtreFacturesSchema', () => {
  it('ignore un filtre inconnu', () => {
    expect(filtreFacturesSchema.parse({ nature: 'x', statut: 'y' })).toEqual({ page: 1 });
    expect(filtreFacturesSchema.parse({ nature: 'AVOIR', statut: 'VALIDEE' })).toMatchObject({
      nature: 'AVOIR',
      statut: 'VALIDEE',
    });
  });
});

describe('ligneBrouillonSaisieSchema', () => {
  const ligne = {
    nature: 'PILE',
    accessoireId: 'a1',
    libelle: 'Piles 312',
    quantite: '2',
    prixUnitaire: '1,50',
  };
  const erreur = (surcharge: object) =>
    ligneBrouillonSaisieSchema.safeParse({ ...ligne, ...surcharge }).error?.issues[0]?.message;

  it('convertit prix et quantité', () => {
    expect(ligneBrouillonSaisieSchema.parse(ligne)).toMatchObject({
      quantite: 2,
      prixUnitaire: 150,
    });
  });

  it.each([
    { cas: 'article manquant', surcharge: { accessoireId: '' }, message: 'Choisir un article.' },
    {
      cas: 'entretien avec article',
      surcharge: { nature: 'ENTRETIEN' },
      message: 'Un entretien ne porte pas d’article.',
    },
    {
      cas: 'prix illisible',
      surcharge: { prixUnitaire: 'abc' },
      message: 'Prix invalide (exemple : 12,50).',
    },
    { cas: 'quantité nulle', surcharge: { quantite: '0' }, message: 'Quantité invalide.' },
  ])('refuse : $cas', ({ surcharge, message }) => {
    expect(erreur(surcharge)).toBe(message);
  });
});

describe('venteDirecteSaisieSchema', () => {
  it('rend la prescription facultative', () => {
    expect(
      venteDirecteSaisieSchema.parse({ patientId: 'p', centreId: 'c', prescriptionId: '' }),
    ).toEqual({ patientId: 'p', centreId: 'c', prescriptionId: null });
  });
});
