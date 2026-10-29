import { describe, expect, it } from 'vitest';

import {
  CODES_ERREUR_VITALE,
  ErreurLectureVitale,
  LIBELLES_ERREUR_VITALE,
  vitaleReadResultSchema,
} from './vitale-reader';

// NIR fictif (clé valide) ; voir patient/nir.test.ts.
const beneficiaire = {
  nom: 'LEFEVRE',
  prenom: 'JEANNE',
  dateNaissance: '1950-03-05',
  rang: 1,
  nir: '269014999912339',
  qualite: 'ASSURE',
  regime: '01',
  caisse: '999',
  centreGestionnaire: '9999',
  droitsAmo: { debut: '2026-01-01', fin: '2026-12-31' },
  c2s: false,
  ald: true,
  amc: null,
};

const resultat = {
  beneficiaires: [beneficiaire],
  source: 'CARTE',
  dateLecture: '2026-10-29T10:00:00.000+01:00',
};

describe('vitaleReadResultSchema', () => {
  it('accepte une lecture valide', () => {
    expect(vitaleReadResultSchema.parse(resultat)).toEqual(resultat);
  });

  it('accepte une AMC et des droits sans bornes', () => {
    const amc = {
      organismeNom: 'Mutuelle Démo',
      organismeIdentifiant: null,
      numeroAdherent: 'A1',
      typeContrat: null,
      debutValidite: null,
      finValidite: '2026-12-31',
    };
    const lu = vitaleReadResultSchema.parse({
      ...resultat,
      source: 'APCV',
      beneficiaires: [{ ...beneficiaire, amc, droitsAmo: { debut: null, fin: null } }],
    });
    expect(lu.beneficiaires[0]?.amc).toEqual(amc);
  });

  it.each([
    { cas: 'aucun bénéficiaire', lecture: { ...resultat, beneficiaires: [] } },
    { cas: 'source inconnue', lecture: { ...resultat, source: 'PAPIER' } },
    {
      cas: 'date de lecture sans décalage',
      lecture: { ...resultat, dateLecture: '2026-10-29T10:00:00' },
    },
    {
      cas: 'NIR à la clé fausse',
      lecture: { ...resultat, beneficiaires: [{ ...beneficiaire, nir: '269014999912340' }] },
    },
    { cas: 'rang 0', lecture: { ...resultat, beneficiaires: [{ ...beneficiaire, rang: 0 }] } },
    { cas: 'nom vide', lecture: { ...resultat, beneficiaires: [{ ...beneficiaire, nom: ' ' }] } },
    {
      cas: 'caisse non numérique',
      lecture: { ...resultat, beneficiaires: [{ ...beneficiaire, caisse: 'CPAM' }] },
    },
    {
      cas: 'fin des droits avant leur début',
      lecture: {
        ...resultat,
        beneficiaires: [{ ...beneficiaire, droitsAmo: { debut: '2026-12-31', fin: '2026-01-01' } }],
      },
    },
  ])('refuse : $cas', ({ lecture }) => {
    expect(vitaleReadResultSchema.safeParse(lecture).success).toBe(false);
  });
});

describe('ErreurLectureVitale', () => {
  it.each(CODES_ERREUR_VITALE)('%s porte son code et son message', (code) => {
    const erreur = new ErreurLectureVitale(code);
    expect(erreur.code).toBe(code);
    expect(erreur.message).toBe(LIBELLES_ERREUR_VITALE[code]);
    expect(erreur.name).toBe('ErreurLectureVitale');
    expect(erreur).toBeInstanceOf(Error);
  });
});
