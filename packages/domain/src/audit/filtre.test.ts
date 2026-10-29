import { describe, expect, it } from 'vitest';

import { filtreJournalSchema } from './filtre';

const UUID = '019a2f3c-1234-7123-8123-123456789012';

describe('filtreJournalSchema', () => {
  it.each([
    { cas: 'aucun filtre', saisie: {}, attendu: { page: 1 } },
    {
      cas: 'champs vides ignorés',
      saisie: { utilisateurId: '', patientId: '  ', du: '', au: '', page: '' },
      attendu: { page: 1 },
    },
    {
      cas: 'tous les filtres',
      saisie: {
        utilisateurId: UUID,
        patientId: ` ${UUID} `,
        du: '2026-10-01',
        au: '2026-10-31',
        page: '3',
      },
      attendu: {
        utilisateurId: UUID,
        patientId: UUID,
        du: '2026-10-01',
        au: '2026-10-31',
        page: 3,
      },
    },
    {
      cas: 'même jour',
      saisie: { du: '2026-10-29', au: '2026-10-29' },
      attendu: { du: '2026-10-29', au: '2026-10-29', page: 1 },
    },
    { cas: 'page invalide → 1', saisie: { page: 'abc' }, attendu: { page: 1 } },
    { cas: 'page négative → 1', saisie: { page: '-2' }, attendu: { page: 1 } },
  ])('$cas', ({ saisie, attendu }) => {
    expect(filtreJournalSchema.parse(saisie)).toEqual(attendu);
  });

  it.each([
    {
      cas: 'utilisateur invalide',
      saisie: { utilisateurId: 'x' },
      champ: 'utilisateurId',
      message: 'Utilisateur inconnu.',
    },
    {
      cas: 'patient invalide',
      saisie: { patientId: '123' },
      champ: 'patientId',
      message: 'Identifiant patient invalide.',
    },
    {
      cas: 'date mal formée',
      saisie: { du: '29/10/2026' },
      champ: 'du',
      message: 'Date invalide (format AAAA-MM-JJ).',
    },
    {
      cas: 'période inversée',
      saisie: { du: '2026-10-31', au: '2026-10-01' },
      champ: 'au',
      message: 'La date de fin doit être postérieure ou égale à la date de début.',
    },
  ])('refuse : $cas', ({ saisie, champ, message }) => {
    const resultat = filtreJournalSchema.safeParse(saisie);
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0]?.path).toEqual([champ]);
    expect(resultat.error?.issues[0]?.message).toBe(message);
  });
});
