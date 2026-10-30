import { describe, expect, it } from 'vitest';

import {
  criteresRecherchePrescripteurSchema,
  formationOtologieConcernee,
  LIBELLES_SPECIALITES_PRESCRIPTEUR,
  motsDeRecherche,
  prescripteurSaisieSchema,
  SPECIALITES_PRESCRIPTEUR,
} from './prescripteur';

const FICHE = {
  nom: 'Exemple',
  prenom: 'Dominique',
  rpps: '',
  specialite: 'ORL',
  formationOtologie: '',
  cabinet: '',
  contact: '',
};

describe('libellés', () => {
  it('couvrent chaque spécialité', () => {
    for (const specialite of SPECIALITES_PRESCRIPTEUR) {
      expect(LIBELLES_SPECIALITES_PRESCRIPTEUR[specialite]).not.toBe('');
    }
  });
});

describe('formationOtologieConcernee', () => {
  it.each([
    { specialite: 'MEDECIN_GENERALISTE', attendu: true },
    { specialite: 'ORL', attendu: false },
    { specialite: 'AUTRE', attendu: false },
  ] as const)('$specialite', ({ specialite, attendu }) => {
    expect(formationOtologieConcernee(specialite)).toBe(attendu);
  });
});

describe('prescripteurSaisieSchema', () => {
  it('accepte une fiche minimale (création à la volée)', () => {
    expect(prescripteurSaisieSchema.parse(FICHE)).toEqual({
      nom: 'Exemple',
      prenom: 'Dominique',
      rpps: null,
      specialite: 'ORL',
      formationOtologie: null,
      cabinet: null,
      contact: null,
    });
  });

  it('accepte une fiche sans le champ de formation', () => {
    const fiche = { ...FICHE, formationOtologie: undefined };
    expect(prescripteurSaisieSchema.parse(fiche).formationOtologie).toBeNull();
  });

  it('normalise le RPPS', () => {
    expect(prescripteurSaisieSchema.parse({ ...FICHE, rpps: '100 000 000 01' }).rpps).toBe(
      '10000000001',
    );
  });

  it.each([
    { formation: 'oui', attendu: true },
    { formation: 'non', attendu: false },
  ])('généraliste, formation $formation', ({ formation, attendu }) => {
    const r = prescripteurSaisieSchema.parse({
      ...FICHE,
      specialite: 'MEDECIN_GENERALISTE',
      formationOtologie: formation,
    });
    expect(r.formationOtologie).toBe(attendu);
  });

  it('exige la formation pour un généraliste', () => {
    const r = prescripteurSaisieSchema.safeParse({ ...FICHE, specialite: 'MEDECIN_GENERALISTE' });
    expect(r.error?.issues[0]).toMatchObject({
      path: ['formationOtologie'],
      message: 'Préciser la formation en otologie médicale.',
    });
  });

  it('ignore la formation hors médecine générale', () => {
    expect(
      prescripteurSaisieSchema.parse({ ...FICHE, formationOtologie: 'oui' }).formationOtologie,
    ).toBeNull();
  });

  it.each([
    { cas: 'RPPS trop court', champs: { rpps: '123' } },
    { cas: 'contact invalide', champs: { contact: 'pas une adresse' } },
    { cas: 'nom vide', champs: { nom: '' } },
    { cas: 'spécialité inconnue', champs: { specialite: 'CHIRURGIEN' } },
    { cas: 'formation inconnue', champs: { formationOtologie: 'peut-être' } },
  ])('refuse : $cas', ({ champs }) => {
    expect(prescripteurSaisieSchema.safeParse({ ...FICHE, ...champs }).success).toBe(false);
  });

  it('accepte une adresse MSSanté', () => {
    const contact = 'dominique.exemple@medecin.mssante.exemple.test';
    expect(prescripteurSaisieSchema.parse({ ...FICHE, contact }).contact).toBe(contact);
  });
});

describe('criteresRecherchePrescripteurSchema', () => {
  it.each([
    { entree: { q: ' Héloïse-d’Arc ' }, q: 'HELOISE D ARC', page: 1 },
    { entree: {}, q: '', page: 1 },
    { entree: { q: 12, page: '3' }, q: '', page: 3 },
  ])('$entree', ({ entree, q, page }) => {
    expect(criteresRecherchePrescripteurSchema.parse(entree)).toEqual({ q, page });
  });

  it('borne la longueur', () => {
    const { q } = criteresRecherchePrescripteurSchema.parse({ q: 'a'.repeat(300) });
    expect(q).toHaveLength(100);
  });
});

describe('motsDeRecherche', () => {
  it.each([
    { texte: 'HELOISE D ARC', attendu: ['HELOISE', 'D', 'ARC'] },
    { texte: '', attendu: [] },
  ])('« $texte »', ({ texte, attendu }) => {
    expect(motsDeRecherche(texte)).toEqual(attendu);
  });
});
