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
    expect(pecSaisieSchema.parse(accordee)).toMatchObject({
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
      numeroAdherent: null,
      numeroAccord: null,
      montantAccordeCentimes: null,
      datePec: null,
      validiteFin: null,
      complementaireId: null,
      devisId: null,
      offre: null,
      demande: null,
      montantDemandeCentimes: null,
    });
  });

  it.each([
    ['sans date', ''],
    ['une date saisie est ignorée', '2026-10-20'],
  ])('à demander : %s', (_, datePec) => {
    const saisie = { statut: 'A_DEMANDER', organisme: 'Mutuelle', datePec };
    expect(pecSaisieSchema.parse(saisie)).toMatchObject({ statut: 'A_DEMANDER', datePec: null });
  });

  const demande = (...montants: readonly string[]) =>
    montants.map((montant) => ({
      libelle: 'Aide droite',
      codeLpp: '',
      prixTtcCentimes: '150000',
      amoCentimes: '24000',
      montant,
    }));

  it('additionne les montants demandés par ligne', () => {
    const lue = pecSaisieSchema.parse({ ...accordee, demande: demande('500,00', '210,00') });
    expect(lue).toMatchObject({ montantDemandeCentimes: 71_000 });
    expect(lue.demande?.[0]).toEqual({
      libelle: 'Aide droite',
      codeLpp: null,
      prixTtcCentimes: 150_000,
      amoCentimes: 24_000,
      montantDemandeCentimes: 50_000,
    });
  });

  it('une ligne vide compte pour zéro', () => {
    const lue = pecSaisieSchema.parse({ ...accordee, demande: demande('710,00', '') });
    expect(lue.montantDemandeCentimes).toBe(71_000);
  });

  it('accepte un accord partiel inférieur à la demande', () => {
    const lue = pecSaisieSchema.parse({
      ...accordee,
      statut: 'PARTIELLE',
      montantAccorde: '400,00',
      demande: demande('710,00'),
    });
    expect(lue).toMatchObject({ statut: 'PARTIELLE', montantAccordeCentimes: 40_000 });
  });

  it.each([
    [
      'montant demandé illisible',
      { demande: demande('abc') },
      'demande',
      'Montant demandé invalide (exemple : 710,00).',
    ],
    [
      'partiel sans demande',
      { statut: 'PARTIELLE' },
      'demande',
      'Renseigner la demande : un accord partiel se compare à elle.',
    ],
    [
      'partiel égal à la demande',
      { statut: 'PARTIELLE', demande: demande('710,00') },
      'montantAccorde',
      'Un accord partiel est inférieur au montant demandé.',
    ],
    [
      'accord inférieur à la demande',
      { demande: demande('800,00') },
      'statut',
      'Montant inférieur à la demande : choisir « Accordée en partie ».',
    ],
    [
      'validité avant la date',
      { validiteFin: '2026-10-19' },
      'validiteFin',
      'La validité finit avant la date de la prise en charge.',
    ],
  ])('refuse : %s', (_, surcharge, champ, attendu) => {
    expect(message({ ...accordee, ...surcharge }, champ)).toBe(attendu);
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
