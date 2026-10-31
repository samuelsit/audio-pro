import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import {
  controlerDevis,
  versDevisAControler,
  type ContexteDevis,
  type DevisDonnees,
} from './controle';
import {
  AIDE_CLASSE_I,
  AIDE_CLASSE_II,
  aide,
  offre,
  piles,
  PILES,
  TARIFS,
} from './fixtures.test-support';

const CONTEXTE: ContexteDevis = {
  dateNaissance: '1950-03-12',
  c2s: false,
  surdicecite: false,
  prescription: {
    prescripteur: { specialite: 'ORL', formationOtologie: null },
    datePrescription: '2026-10-15',
  },
  oreilles: [
    { oreille: 'DROITE', type: 'PRIMO' },
    { oreille: 'GAUCHE', type: 'RENOUVELLEMENT' },
  ],
  historiqueDelivrances: [],
  entreprise: {
    raisonSociale: 'Audition Démo SAS',
    siret: '00000000000000',
    rcs: 'RCS Démo 000 000 000',
    finess: '000000000',
    tvaIntracommunautaire: 'FR00000000000',
  },
};

const OFFRE_100 = offre({
  aides: [aide('DROITE', 95_000), aide('GAUCHE', 95_000)],
  consommables: [piles()],
});
const AUTRE = offre({
  rubrique: 'AUTRE_OFFRE',
  aides: [aide('DROITE', 180_000, AIDE_CLASSE_II), aide('GAUCHE', 180_000, AIDE_CLASSE_II)],
});

const DEVIS: DevisDonnees = {
  dateDevis: '2026-10-30',
  dateFinValidite: '2026-12-30',
  refusOffreC2S: false,
  contratResponsable: true,
  tauxAMO: 60,
  bobineTPresentee: true,
  ficheTechniqueJointe: true,
  datePrecedentDroite: null,
  datePrecedentGauche: '2019-05-02',
  offres: [OFFRE_100, AUTRE],
};

describe('versDevisAControler', () => {
  it('prévoit la délivrance 30 jours après le devis', () => {
    expect(versDevisAControler(DEVIS, CONTEXTE).dateDelivrancePrevue).toBe('2026-11-29');
  });

  it('range offres et dates par oreille, avec l’AMC de cette oreille', () => {
    const { oreilles, consommables } = versDevisAControler(
      {
        ...DEVIS,
        offres: [{ ...OFFRE_100, amcDroite: centimes(100), amcGauche: centimes(200) }],
      },
      CONTEXTE,
    );
    expect(oreilles).toEqual([
      {
        oreille: 'DROITE',
        type: 'PRIMO',
        datePrecedentAppareillage: null,
        offres: [
          {
            rubrique: 'OFFRE_100_SANTE',
            classe: 'CLASSE_I',
            prixTTC: 95_000,
            priseEnChargeAMC: 100,
            nombreOptions: 3,
            ficheComplete: true,
          },
        ],
      },
      {
        oreille: 'GAUCHE',
        type: 'RENOUVELLEMENT',
        datePrecedentAppareillage: '2019-05-02',
        offres: [expect.objectContaining({ priseEnChargeAMC: 200 })],
      },
    ]);
    expect(consommables).toEqual([
      { rubrique: 'OFFRE_100_SANTE', remboursable: true, ficheComplete: true },
    ]);
  });
});

describe('controlerDevis', () => {
  it('devis conforme : rien', () => {
    expect(controlerDevis(DEVIS, CONTEXTE, TARIFS)).toEqual({ erreurs: [], avertissements: [] });
  });

  it.each<{ cas: string; devis: Partial<DevisDonnees>; code: string }>([
    {
      cas: 'dépassement du prix limite, bloquant',
      devis: {
        offres: [offre({ aides: [aide('DROITE', 95_001), aide('GAUCHE', 95_000)] })],
      },
      code: 'PRIX_SUPERIEUR_PRIX_LIMITE',
    },
    {
      cas: 'aide au catalogue incomplet',
      devis: {
        offres: [
          offre({
            aides: [
              aide('DROITE', 95_000, { ...AIDE_CLASSE_I, antiLarsen: null }),
              aide('GAUCHE', 95_000),
            ],
          }),
        ],
      },
      code: 'FICHE_CATALOGUE_INCOMPLETE',
    },
    {
      cas: 'piles au catalogue incomplet',
      devis: {
        offres: [
          offre({
            aides: [aide('DROITE', 95_000), aide('GAUCHE', 95_000)],
            consommables: [{ ...piles(), designation: { ...PILES, marque: null } }],
          }),
        ],
      },
      code: 'FICHE_CATALOGUE_INCOMPLETE',
    },
    {
      cas: 'consommable sans code LPP en offre 100 % santé',
      devis: {
        offres: [
          offre({
            aides: [aide('DROITE', 95_000), aide('GAUCHE', 95_000)],
            consommables: [piles(1, null)],
          }),
        ],
      },
      code: 'LIGNE_NON_REMBOURSABLE_OFFRE_100_SANTE',
    },
    {
      cas: 'moins de 3 options',
      devis: {
        offres: [
          offre({
            aides: [
              aide('DROITE', 95_000, { ...AIDE_CLASSE_I, options: ['REDUCTEUR_ACOUPHENE'] }),
              aide('GAUCHE', 95_000),
            ],
          }),
        ],
      },
      code: 'OPTIONS_100_SANTE_INSUFFISANTES',
    },
    {
      cas: 'renouvellement sans date',
      devis: { datePrecedentGauche: null },
      code: 'DATE_PRECEDENT_APPAREILLAGE_MANQUANTE',
    },
  ])('$cas', ({ devis, code }) => {
    const { erreurs } = controlerDevis({ ...DEVIS, ...devis }, CONTEXTE, TARIFS);
    expect(erreurs.map((e) => e.code)).toEqual([code]);
  });

  it('droite seule : la gauche n’est pas contrôlée', () => {
    const { erreurs } = controlerDevis(
      { ...DEVIS, datePrecedentGauche: null, offres: [offre({ aides: [aide('DROITE', 95_000)] })] },
      { ...CONTEXTE, oreilles: [{ oreille: 'DROITE', type: 'PRIMO' }] },
      TARIFS,
    );
    expect(erreurs).toEqual([]);
  });
});
