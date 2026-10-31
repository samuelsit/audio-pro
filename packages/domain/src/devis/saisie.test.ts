import { describe, expect, it } from 'vitest';

import { debutEssaiSaisieSchema, devisSaisieSchema, signatureDevisSaisieSchema } from './saisie';

const MODELE_ID = '019a7000-0000-7000-8000-000000000001';
const ACCESSOIRE_ID = '019a7000-0000-7000-8000-000000000002';

const AIDE = { modeleId: MODELE_ID, prixAvantRemise: '950,00', prix: '950,00' };

const OFFRE = {
  rubrique: 'OFFRE_100_SANTE',
  aideDroite: AIDE,
  aideGauche: null,
  consommables: [],
  amcDroite: '',
  amcGauche: null,
  amcConsommables: null,
};

const SAISIE = {
  lieuEmission: ' Lille ',
  refusOffreC2S: false,
  contratResponsable: true,
  bobineTPresentee: true,
  ficheTechniqueJointe: true,
  depotGarantie: '',
  datePrecedentDroite: '',
  datePrecedentGauche: null,
  offres: [OFFRE],
  statutAttendu: 'PRESCRIPTION_OK',
};

describe('devisSaisieSchema', () => {
  it('normalise la saisie et prend 2 mois et 60 % par défaut', () => {
    expect(devisSaisieSchema.parse(SAISIE)).toMatchObject({
      lieuEmission: 'Lille',
      validiteMois: 2,
      tauxAmo: 60,
      depotGarantie: null,
      datePrecedentDroite: null,
      offres: [{ amcDroite: null, aideDroite: { prix: 95_000, prixAvantRemise: 95_000 } }],
    });
  });

  it('convertit les nombres saisis en texte', () => {
    const r = devisSaisieSchema.parse({
      ...SAISIE,
      validiteMois: '3',
      tauxAmo: '85',
      depotGarantie: '100,00',
      datePrecedentGauche: '2019-05-02',
    });
    expect(r).toMatchObject({
      validiteMois: 3,
      tauxAmo: 85,
      depotGarantie: 10_000,
      datePrecedentGauche: '2019-05-02',
    });
  });

  it('offre 100 % santé : pas de colonne de remise, le prix avant remise s’aligne', () => {
    const r = devisSaisieSchema.parse({
      ...SAISIE,
      offres: [
        {
          ...OFFRE,
          aideDroite: { ...AIDE, prixAvantRemise: '1 000,00' },
          aideGauche: { ...AIDE, prixAvantRemise: '1 100,00' },
          consommables: [
            {
              accessoireId: ACCESSOIRE_ID,
              quantite: '4',
              prixAvantRemise: '2,00',
              prix: '1,50',
            },
          ],
        },
      ],
    });
    expect(r.offres[0]).toMatchObject({
      aideDroite: { prixAvantRemise: 95_000 },
      aideGauche: { prixAvantRemise: 95_000 },
      consommables: [{ quantite: 4, prixAvantRemise: 150 }],
    });
  });

  it('autre offre : la remise est conservée', () => {
    const r = devisSaisieSchema.parse({
      ...SAISIE,
      offres: [
        OFFRE,
        {
          ...OFFRE,
          rubrique: 'AUTRE_OFFRE',
          aideDroite: { ...AIDE, prixAvantRemise: '1 900,00', prix: '1 800,00' },
        },
      ],
    });
    expect(r.offres[1]).toMatchObject({
      aideDroite: { prixAvantRemise: 190_000, prix: 180_000 },
    });
  });

  it.each([
    { cas: 'lieu absent', modif: { lieuEmission: ' ' } },
    { cas: 'validité nulle', modif: { validiteMois: 0 } },
    { cas: 'validité excessive', modif: { validiteMois: 25 } },
    { cas: 'validité illisible', modif: { validiteMois: 'deux' } },
    { cas: 'taux supérieur à 100', modif: { tauxAmo: 101 } },
    { cas: 'dépôt illisible', modif: { depotGarantie: 'cent' } },
    { cas: 'date inexistante', modif: { datePrecedentDroite: '2019-02-30' } },
    { cas: 'statut inconnu', modif: { statutAttendu: 'FACTICE' } },
    { cas: 'aucune offre', modif: { offres: [] } },
    { cas: 'offre en double', modif: { offres: [OFFRE, OFFRE] } },
    {
      cas: 'prix remisé supérieur',
      modif: { offres: [{ ...OFFRE, aideDroite: { ...AIDE, prix: '960,00' } }] },
    },
    {
      cas: 'modèle mal identifié',
      modif: { offres: [{ ...OFFRE, aideDroite: { ...AIDE, modeleId: 'x' } }] },
    },
    {
      cas: 'quantité nulle',
      modif: {
        offres: [
          {
            ...OFFRE,
            consommables: [
              { accessoireId: ACCESSOIRE_ID, quantite: 0, prixAvantRemise: '1', prix: '1' },
            ],
          },
        ],
      },
    },
  ])('refuse : $cas', ({ modif }) => {
    expect(devisSaisieSchema.safeParse({ ...SAISIE, ...modif }).success).toBe(false);
  });
});

describe('actions sur un devis', () => {
  it('l’essai exige une offre', () => {
    expect(
      debutEssaiSaisieSchema.safeParse({ statutAttendu: 'EMIS', offreEssai: 'AUTRE_OFFRE' })
        .success,
    ).toBe(true);
    expect(debutEssaiSaisieSchema.safeParse({ statutAttendu: 'EMIS' }).success).toBe(false);
  });

  it('normalise les numéros de série de l’essai, une oreille pouvant rester vide', () => {
    expect(
      debutEssaiSaisieSchema.parse({
        statutAttendu: 'EMIS',
        offreEssai: 'OFFRE_100_SANTE',
        numeroSerieDroite: ' ab 123 ',
        numeroSerieGauche: '',
      }),
    ).toMatchObject({ numeroSerieDroite: 'AB123', numeroSerieGauche: null });
    expect(
      debutEssaiSaisieSchema.safeParse({
        statutAttendu: 'EMIS',
        offreEssai: 'OFFRE_100_SANTE',
        numeroSerieDroite: 'a',
      }).success,
    ).toBe(false);
  });

  it.each([
    { signe: true, valide: true },
    { signe: false, valide: false },
  ])('signature avec case à $signe', ({ signe, valide }) => {
    const resultat = signatureDevisSaisieSchema.safeParse({
      statutAttendu: 'EMIS',
      offreRetenue: 'OFFRE_100_SANTE',
      dateSignature: '2026-12-01',
      signe,
    });
    expect(resultat.success).toBe(valide);
  });
});
