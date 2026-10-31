import { describe, expect, it } from 'vitest';

import { controlePrescription, premiereDelivrancePossible } from './controle-prescription';
import type { PrescriptionAControler } from './controle-prescription';

const ORL = { specialite: 'ORL', formationOtologie: null, rpps: '10000000001' } as const;
const GENERALISTE = {
  specialite: 'MEDECIN_GENERALISTE',
  formationOtologie: false,
  rpps: '10000000002',
} as const;

const JOUR = '2026-10-31';

const BASE: PrescriptionAControler = {
  dateNaissance: '1950-03-15',
  dateDuJour: JOUR,
  oreilles: [{ oreille: 'DROITE', type: 'RENOUVELLEMENT' }],
  oreillesPrescrites: ['DROITE', 'GAUCHE'],
  prescripteur: ORL,
  datePrescription: '2026-10-20',
  historiqueDelivrances: [],
};

describe('premiereDelivrancePossible', () => {
  it('ajoute les 30 jours d’essai minimum', () => {
    expect(premiereDelivrancePossible('2026-10-31')).toBe('2026-11-30');
  });
});

describe('controlePrescription : renouvellement', () => {
  it.each([
    {
      cas: 'moins de 4 ans sur la même oreille : refusé',
      oreille: 'DROITE',
      delivrance: { oreille: 'DROITE', dateDelivrance: '2024-06-01' },
      refus: [{ oreille: 'DROITE', dateEligibilite: '2028-06-01' }],
    },
    {
      cas: 'moins de 4 ans sur l’autre oreille : accepté',
      oreille: 'GAUCHE',
      delivrance: { oreille: 'DROITE', dateDelivrance: '2024-06-01' },
      refus: [],
    },
    {
      cas: 'plus de 4 ans sur la même oreille : accepté',
      oreille: 'DROITE',
      delivrance: { oreille: 'DROITE', dateDelivrance: '2022-06-01' },
      refus: [],
    },
    {
      cas: 'les 4 ans tombent le jour de la première délivrance possible : accepté',
      oreille: 'DROITE',
      delivrance: { oreille: 'DROITE', dateDelivrance: '2022-11-30' },
      refus: [],
    },
    {
      cas: 'les 4 ans tombent le lendemain de la première délivrance possible : refusé',
      oreille: 'DROITE',
      delivrance: { oreille: 'DROITE', dateDelivrance: '2022-12-01' },
      refus: [{ oreille: 'DROITE', dateEligibilite: '2026-12-01' }],
    },
  ] as const)('$cas', ({ oreille, delivrance, refus }) => {
    const resultat = controlePrescription({
      ...BASE,
      oreilles: [{ oreille, type: 'RENOUVELLEMENT' }],
      historiqueDelivrances: [delivrance],
    });
    expect(resultat.refusRenouvellement).toEqual(refus);
    expect(resultat.erreurs).toEqual(
      refus.map((r) => ({ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: r.oreille })),
    );
  });

  it('les deux oreilles : seule l’oreille concernée est refusée', () => {
    const resultat = controlePrescription({
      ...BASE,
      oreilles: [
        { oreille: 'DROITE', type: 'RENOUVELLEMENT' },
        { oreille: 'GAUCHE', type: 'PRIMO' },
      ],
      historiqueDelivrances: [{ oreille: 'DROITE', dateDelivrance: '2025-01-15' }],
    });
    expect(resultat.erreurs).toEqual([{ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' }]);
  });

  it('le délai vaut aussi pour une oreille déclarée en premier appareillage', () => {
    const resultat = controlePrescription({
      ...BASE,
      oreilles: [{ oreille: 'DROITE', type: 'PRIMO' }],
      historiqueDelivrances: [{ oreille: 'DROITE', dateDelivrance: '2025-01-15' }],
    });
    expect(resultat.erreurs).toEqual([{ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' }]);
  });
});

describe('controlePrescription : cohérence et prescripteur', () => {
  it.each([
    {
      cas: 'oreille du dossier non prescrite',
      entree: { oreillesPrescrites: ['GAUCHE'] },
      erreurs: [{ code: 'OREILLE_NON_PRESCRITE', oreille: 'DROITE' }],
      avertissements: [],
    },
    {
      cas: 'prescription postérieure au jour',
      entree: { datePrescription: '2026-11-01' },
      erreurs: [{ code: 'PRESCRIPTION_POSTERIEURE_AU_DEVIS', oreille: null }],
      avertissements: [],
    },
    {
      cas: 'prescripteur sans RPPS',
      entree: { prescripteur: { ...ORL, rpps: null } },
      erreurs: [],
      avertissements: [{ code: 'RPPS_PRESCRIPTEUR_MANQUANT', oreille: null }],
    },
    {
      cas: 'primo chez un généraliste non formé : avertissement par oreille',
      entree: {
        prescripteur: GENERALISTE,
        oreilles: [
          { oreille: 'DROITE', type: 'PRIMO' },
          { oreille: 'GAUCHE', type: 'RENOUVELLEMENT' },
        ],
      },
      erreurs: [],
      avertissements: [{ code: 'PRESCRIPTEUR_NON_CONFORME', oreille: 'DROITE' }],
    },
    {
      cas: 'âge lu à la première délivrance possible : 7 ans atteints pendant l’essai',
      entree: {
        dateNaissance: '2019-11-15',
        prescripteur: GENERALISTE,
        oreilles: [{ oreille: 'DROITE', type: 'RENOUVELLEMENT' }],
      },
      erreurs: [],
      avertissements: [],
    },
  ] as const)('$cas', ({ entree, erreurs, avertissements }) => {
    const resultat = controlePrescription({ ...BASE, ...entree });
    expect(resultat.erreurs).toEqual(erreurs);
    expect(resultat.avertissements).toEqual(avertissements);
  });

  it('une erreur commune aux deux oreilles n’est signalée qu’une fois', () => {
    const resultat = controlePrescription({
      ...BASE,
      datePrescription: '2026-11-01',
      oreilles: [
        { oreille: 'DROITE', type: 'PRIMO' },
        { oreille: 'GAUCHE', type: 'PRIMO' },
      ],
    });
    expect(resultat.erreurs).toEqual([
      { code: 'PRESCRIPTION_POSTERIEURE_AU_DEVIS', oreille: null },
    ]);
  });
});
