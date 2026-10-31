import { describe, expect, it } from 'vitest';

import { centimes } from '../money';
import { controleDevis, type DevisAControler } from './controle-devis';
import { CODES_CONTROLE, LIBELLES_CONTROLES } from './controles';
import type { TarifsAudio } from './tarifs';

const TARIFS: TarifsAudio = {
  VINGT_ET_PLUS: { baseRemboursement: centimes(40_000), prixLimiteClasseI: centimes(95_000) },
  MOINS_DE_20: { baseRemboursement: centimes(140_000), prixLimiteClasseI: centimes(140_000) },
};

const CLASSE_I = {
  rubrique: 'OFFRE_100_SANTE',
  classe: 'CLASSE_I',
  prixTTC: centimes(95_000),
  priseEnChargeAMC: centimes(71_000),
  nombreOptions: 3,
  ficheComplete: true,
} as const;
const CLASSE_II = {
  rubrique: 'AUTRE_OFFRE',
  classe: 'CLASSE_II',
  prixTTC: centimes(180_000),
  priseEnChargeAMC: centimes(50_000),
  nombreOptions: 0,
  ficheComplete: true,
} as const;

const ENTREPRISE = {
  raisonSociale: 'Audition Démo SAS',
  siret: '00000000000000',
  rcs: 'RCS Démo 000 000 000',
  finess: '000000000',
  tvaIntracommunautaire: 'FR00000000000',
};

const DROITE = { oreille: 'DROITE', type: 'PRIMO', datePrecedentAppareillage: null } as const;
const GAUCHE = { oreille: 'GAUCHE', type: 'PRIMO', datePrecedentAppareillage: null } as const;

const DEVIS: DevisAControler = {
  dateNaissance: '1950-03-12',
  dateDevis: '2026-10-30',
  dateFinValidite: '2026-12-30',
  dateDelivrancePrevue: '2026-12-05',
  c2s: false,
  refusOffreC2S: false,
  surdicecite: false,
  contratResponsable: true,
  tauxAMO: 60,
  prescription: {
    prescripteur: { specialite: 'ORL', formationOtologie: null },
    datePrescription: '2026-10-15',
  },
  bobineTPresentee: true,
  ficheTechniqueJointe: true,
  oreilles: [
    { ...DROITE, offres: [CLASSE_I, CLASSE_II] },
    { ...GAUCHE, offres: [CLASSE_I, CLASSE_II] },
  ],
  consommables: [{ rubrique: 'OFFRE_100_SANTE', remboursable: true, ficheComplete: true }],
  entreprise: ENTREPRISE,
  historiqueDelivrances: [],
};

const droite = DROITE;

describe('controleDevis : devis conforme', () => {
  it('ne relève rien', () => {
    expect(controleDevis(DEVIS, TARIFS)).toEqual({ erreurs: [], avertissements: [] });
  });
});

describe('controleDevis : erreurs bloquantes', () => {
  it.each<{ cas: string; modif: Partial<DevisAControler>; erreurs: object[] }>([
    {
      cas: 'aucune oreille',
      modif: { oreilles: [] },
      erreurs: [{ code: 'AUCUNE_OREILLE_APPAREILLEE', oreille: null }],
    },
    {
      cas: 'pas d’offre classe I à droite',
      modif: { oreilles: [{ ...droite, offres: [CLASSE_II] }] },
      erreurs: [{ code: 'OFFRE_CLASSE_I_MANQUANTE', oreille: 'DROITE' }],
    },
    {
      cas: 'classe I proposée seulement en autre offre',
      modif: { oreilles: [{ ...droite, offres: [{ ...CLASSE_I, rubrique: 'AUTRE_OFFRE' }] }] },
      erreurs: [{ code: 'OFFRE_CLASSE_I_MANQUANTE', oreille: 'DROITE' }],
    },
    {
      cas: 'classe II en offre 100 % santé',
      modif: { oreilles: [{ ...droite, offres: [{ ...CLASSE_II, rubrique: 'OFFRE_100_SANTE' }] }] },
      erreurs: [{ code: 'OFFRE_CLASSE_I_MANQUANTE', oreille: 'DROITE' }],
    },
    {
      cas: 'moins de 3 options en offre 100 % santé',
      modif: { oreilles: [{ ...droite, offres: [{ ...CLASSE_I, nombreOptions: 2 }] }] },
      erreurs: [{ code: 'OPTIONS_100_SANTE_INSUFFISANTES', oreille: 'DROITE' }],
    },
    {
      cas: 'fiche du catalogue incomplète, sur une aide',
      modif: { oreilles: [{ ...droite, offres: [{ ...CLASSE_I, ficheComplete: false }] }] },
      erreurs: [{ code: 'FICHE_CATALOGUE_INCOMPLETE', oreille: 'DROITE' }],
    },
    {
      cas: 'fiche du catalogue incomplète, sur un consommable',
      modif: {
        consommables: [{ rubrique: 'AUTRE_OFFRE', remboursable: true, ficheComplete: false }],
      },
      erreurs: [{ code: 'FICHE_CATALOGUE_INCOMPLETE', oreille: null }],
    },
    {
      cas: 'renouvellement sans date du précédent appareillage',
      modif: { oreilles: [{ ...droite, type: 'RENOUVELLEMENT', offres: [CLASSE_I] }] },
      erreurs: [{ code: 'DATE_PRECEDENT_APPAREILLAGE_MANQUANTE', oreille: 'DROITE' }],
    },
    {
      cas: 'consommable non remboursable en offre 100 % santé',
      modif: {
        consommables: [{ rubrique: 'OFFRE_100_SANTE', remboursable: false, ficheComplete: true }],
      },
      erreurs: [{ code: 'LIGNE_NON_REMBOURSABLE_OFFRE_100_SANTE', oreille: null }],
    },
    {
      cas: 'raison sociale absente',
      modif: { entreprise: { ...ENTREPRISE, raisonSociale: null } },
      erreurs: [{ code: 'IDENTIFICATION_ENTREPRISE_INCOMPLETE', oreille: null }],
    },
    {
      cas: 'SIRET absent',
      modif: { entreprise: { ...ENTREPRISE, siret: null } },
      erreurs: [{ code: 'IDENTIFICATION_ENTREPRISE_INCOMPLETE', oreille: null }],
    },
    {
      cas: 'pas d’offre du tout',
      modif: { oreilles: [{ ...droite, offres: [] }] },
      erreurs: [{ code: 'OFFRE_CLASSE_I_MANQUANTE', oreille: 'DROITE' }],
    },
    {
      cas: 'classe I un centime au-dessus du prix limite',
      modif: {
        oreilles: [{ ...droite, offres: [{ ...CLASSE_I, prixTTC: centimes(95_001) }] }],
      },
      erreurs: [{ code: 'PRIX_SUPERIEUR_PRIX_LIMITE', oreille: 'DROITE' }],
    },
    {
      cas: 'C2S au-dessus du plafond sans refus',
      modif: {
        c2s: true,
        oreilles: [{ ...droite, offres: [{ ...CLASSE_I, prixTTC: centimes(80_001) }] }],
      },
      erreurs: [{ code: 'PRIX_SUPERIEUR_PLAFOND_C2S', oreille: 'DROITE' }],
    },
    {
      cas: 'prescription absente',
      modif: { prescription: null },
      erreurs: [{ code: 'PRESCRIPTION_ABSENTE', oreille: null }],
    },
    {
      cas: 'prescription postérieure au devis, signalée une seule fois',
      modif: {
        prescription: {
          prescripteur: { specialite: 'ORL', formationOtologie: null },
          datePrescription: '2026-10-31',
        },
      },
      erreurs: [{ code: 'PRESCRIPTION_POSTERIEURE_AU_DEVIS', oreille: null }],
    },
    {
      cas: 'validité inférieure à 2 mois',
      modif: { dateFinValidite: '2026-12-29' },
      erreurs: [{ code: 'VALIDITE_DEVIS_INSUFFISANTE', oreille: null }],
    },
    {
      cas: 'bobine T non présentée',
      modif: { bobineTPresentee: false },
      erreurs: [{ code: 'BOBINE_T_NON_PRESENTEE', oreille: null }],
    },
    {
      cas: 'fiche technique non jointe',
      modif: { ficheTechniqueJointe: false },
      erreurs: [{ code: 'FICHE_TECHNIQUE_MANQUANTE', oreille: null }],
    },
  ])('$cas', ({ modif, erreurs }) => {
    expect(controleDevis({ ...DEVIS, ...modif }, TARIFS).erreurs).toEqual(erreurs);
  });
});

describe('controleDevis : avertissements', () => {
  it.each<{ cas: string; modif: Partial<DevisAControler>; avertissements: object[] }>([
    {
      cas: 'consommable non remboursable en autre offre : rien',
      modif: {
        consommables: [{ rubrique: 'AUTRE_OFFRE', remboursable: false, ficheComplete: true }],
      },
      avertissements: [],
    },
    {
      cas: 'renouvellement daté : rien',
      modif: {
        oreilles: [
          {
            ...droite,
            type: 'RENOUVELLEMENT',
            datePrecedentAppareillage: '2020-01-10',
            offres: [CLASSE_I],
          },
        ],
      },
      avertissements: [],
    },
    ...(['rcs', 'finess', 'tvaIntracommunautaire'] as const).map((champ) => ({
      cas: `${champ} absent`,
      modif: { entreprise: { ...ENTREPRISE, [champ]: null } },
      avertissements: [{ code: 'IDENTIFIANTS_ENTREPRISE_A_COMPLETER', oreille: null }],
    })),
    {
      cas: 'renouvellement avant 4 ans',
      modif: {
        historiqueDelivrances: [{ oreille: 'GAUCHE', dateDelivrance: '2024-01-10' }],
      },
      avertissements: [{ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'GAUCHE' }],
    },
    {
      cas: '20 ans atteints pendant la validité du devis',
      modif: {
        dateNaissance: '2006-12-20',
        oreilles: [{ ...droite, offres: [{ ...CLASSE_I, prixTTC: centimes(90_000) }] }],
      },
      avertissements: [{ code: 'TRANCHE_AGE_CHANGE_AVANT_DELIVRANCE', oreille: null }],
    },
    {
      cas: 'prescripteur non conforme, par oreille (À VÉRIFIER)',
      modif: {
        prescription: {
          prescripteur: { specialite: 'MEDECIN_GENERALISTE', formationOtologie: false },
          datePrescription: '2026-10-15',
        },
      },
      avertissements: [
        { code: 'PRESCRIPTEUR_NON_CONFORME', oreille: 'DROITE' },
        { code: 'PRESCRIPTEUR_NON_CONFORME', oreille: 'GAUCHE' },
      ],
    },
    {
      cas: 'contrat responsable dépassé (À VÉRIFIER)',
      modif: {
        oreilles: [
          {
            ...droite,
            offres: [
              CLASSE_I,
              {
                ...CLASSE_II,
                prixTTC: centimes(250_000),
                priseEnChargeAMC: centimes(146_001),
              },
            ],
          },
        ],
      },
      avertissements: [{ code: 'PLAFOND_CONTRAT_RESPONSABLE_DEPASSE', oreille: 'DROITE' }],
    },
    {
      cas: 'même montant, contrat non responsable : rien',
      modif: {
        contratResponsable: false,
        oreilles: [
          {
            ...droite,
            offres: [
              CLASSE_I,
              {
                ...CLASSE_II,
                prixTTC: centimes(250_000),
                priseEnChargeAMC: centimes(146_001),
              },
            ],
          },
        ],
      },
      avertissements: [],
    },
    {
      cas: 'plafond contrat responsable atteint exactement : rien',
      modif: {
        oreilles: [
          {
            ...droite,
            offres: [
              CLASSE_I,
              {
                ...CLASSE_II,
                prixTTC: centimes(250_000),
                priseEnChargeAMC: centimes(146_000),
              },
            ],
          },
        ],
      },
      avertissements: [],
    },
    {
      cas: 'C2S, refus de l’offre : dépassement à mentionner',
      modif: {
        c2s: true,
        refusOffreC2S: true,
        oreilles: [
          {
            ...droite,
            offres: [
              { ...CLASSE_I, prixTTC: centimes(80_000), priseEnChargeAMC: centimes(56_000) },
              { ...CLASSE_II, prixTTC: centimes(120_000), priseEnChargeAMC: centimes(56_000) },
            ],
          },
        ],
      },
      avertissements: [{ code: 'DEPASSEMENT_C2S_A_MENTIONNER', oreille: 'DROITE' }],
    },
  ])('$cas', ({ modif, avertissements }) => {
    const resultat = controleDevis({ ...DEVIS, ...modif }, TARIFS);
    expect(resultat.erreurs).toEqual([]);
    expect(resultat.avertissements).toEqual(avertissements);
  });
});

describe('controleDevis : règles liées', () => {
  it('C2S : refus de l’offre, le prix limite général de la classe I reste bloquant', () => {
    const resultat = controleDevis(
      {
        ...DEVIS,
        c2s: true,
        refusOffreC2S: true,
        oreilles: [{ ...droite, offres: [{ ...CLASSE_I, prixTTC: centimes(95_001) }] }],
      },
      TARIFS,
    );
    expect(resultat.erreurs).toEqual([{ code: 'PRIX_SUPERIEUR_PRIX_LIMITE', oreille: 'DROITE' }]);
    expect(resultat.avertissements).toEqual([
      { code: 'DEPASSEMENT_C2S_A_MENTIONNER', oreille: 'DROITE' },
    ]);
  });

  it('C2S : personne sourde et aveugle, plafond de 1 400 €', () => {
    const offre = { ...CLASSE_I, prixTTC: centimes(140_000), priseEnChargeAMC: centimes(0) };
    const devis = { ...DEVIS, c2s: true, oreilles: [{ ...droite, offres: [offre] }] };
    expect(controleDevis(devis, TARIFS).erreurs).toEqual([
      { code: 'PRIX_SUPERIEUR_PLAFOND_C2S', oreille: 'DROITE' },
    ]);
    expect(controleDevis({ ...devis, surdicecite: true }, TARIFS).erreurs).toEqual([]);
  });

  it('l’âge se lit à la date de délivrance prévue', () => {
    const offre = { ...CLASSE_I, prixTTC: centimes(140_000), priseEnChargeAMC: centimes(0) };
    const devis = {
      ...DEVIS,
      dateNaissance: '2006-12-20',
      oreilles: [{ ...droite, offres: [offre] }],
    };
    expect(controleDevis({ ...devis, dateDelivrancePrevue: '2026-12-19' }, TARIFS).erreurs).toEqual(
      [],
    );
    expect(controleDevis({ ...devis, dateDelivrancePrevue: '2026-12-20' }, TARIFS).erreurs).toEqual(
      [{ code: 'PRIX_SUPERIEUR_PRIX_LIMITE', oreille: 'DROITE' }],
    );
  });

  it('cumule erreurs et avertissements, sans doublon', () => {
    const resultat = controleDevis(
      {
        ...DEVIS,
        bobineTPresentee: false,
        ficheTechniqueJointe: false,
        historiqueDelivrances: [
          { oreille: 'DROITE', dateDelivrance: '2024-01-10' },
          { oreille: 'GAUCHE', dateDelivrance: '2024-01-10' },
        ],
      },
      TARIFS,
    );
    expect(resultat.erreurs.map((e) => e.code)).toEqual([
      'BOBINE_T_NON_PRESENTEE',
      'FICHE_TECHNIQUE_MANQUANTE',
    ]);
    expect(resultat.avertissements).toEqual([
      { code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' },
      { code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'GAUCHE' },
    ]);
  });
});

describe('LIBELLES_CONTROLES', () => {
  it.each(CODES_CONTROLE)('%s a un libellé', (code) => {
    expect(LIBELLES_CONTROLES[code]).not.toBe('');
  });
});
