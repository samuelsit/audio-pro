import { describe, expect, it } from 'vitest';

import type { TarifsAudio } from '../audio-rules/tarifs';
import { centimes } from '../money';
import type { ClientFacture, VendeurFacture } from './mentions';
import type { TauxTvaDate } from './tva';
import {
  controlerFacture,
  controlerVenteDirecte,
  etatFacture,
  type FaitsFacture,
  type ResultatControleFacture,
} from './controle';
import { preparerFacture, type ContenuFacture, type LigneFacture } from './preparation';

const TARIFS: TarifsAudio = {
  VINGT_ET_PLUS: { baseRemboursement: centimes(40_000), prixLimiteClasseI: centimes(95_000) },
  MOINS_DE_20: { baseRemboursement: centimes(140_000), prixLimiteClasseI: centimes(140_000) },
};

const DELIVRANCE = '2026-10-31';

const TAUX_TVA: readonly TauxTvaDate[] = [
  { type: 'AIDE_AUDITIVE', taux: 550, debut: '2021-01-01' },
];

const VENDEUR: VendeurFacture = {
  raisonSociale: 'Audition Fictive SAS',
  nomCentre: 'Centre de test',
  adresse: ['1 rue de la Paix', '75002 Paris'],
  telephone: '0100000000',
  email: 'centre@example.test',
  siret: '00000000000000',
  rcs: 'Paris 000 000 000',
  finess: '750000000',
  tvaIntracommunautaire: 'FR00000000000',
};

const CLIENT: ClientFacture = { prenomNom: 'Jeanne Fictive', adresse: ['2 rue Test'] };

function faits(surcharge: Partial<FaitsFacture> = {}): FaitsFacture {
  return {
    dateNaissance: '1960-05-12',
    c2s: false,
    surdicecite: false,
    oreilles: [{ oreille: 'DROITE', type: 'PRIMO' }],
    couvertureAmo: {
      origine: 'VITALE',
      derniereLectureVitale: '2026-10-20',
      modifieeLe: '2026-10-20T10:00:00.000Z',
      finDroits: '2027-12-31',
    },
    amoConfirmeeLe: null,
    couvertureAmc: false,
    prescription: {
      datePrescription: '2026-08-01',
      oreilles: ['DROITE'],
      prescripteur: { specialite: 'ORL', formationOtologie: null, rpps: '10000000017' },
      erreursForcees: [],
    },
    historiqueDelivrances: [],
    devis: {
      dateEmission: '2026-08-15',
      refusOffreC2S: false,
      contratResponsable: false,
      amoPrevue: centimes(24_000),
      amcPrevue: false,
      tauxTva: [{ nature: 'AIDE_AUDITIVE', taux: 550 }],
    },
    pec: null,
    tiersPayantAmo: true,
    tarifs: TARIFS,
    vendeur: VENDEUR,
    client: CLIENT,
    ...surcharge,
  };
}

function facture(surcharge: { prixTTC?: number; numeroSerie?: string | null } = {}) {
  return preparerFacture({
    dateNaissance: '1960-05-12',
    dateDelivrance: DELIVRANCE,
    c2s: false,
    surdicecite: false,
    tauxAMO: 60,
    aides: [
      {
        oreille: 'DROITE',
        classe: 'CLASSE_I',
        libelle: 'Aurore',
        prixTTC: centimes(surcharge.prixTTC ?? 95_000),
        numeroSerie: surcharge.numeroSerie === undefined ? 'SN-1' : surcharge.numeroSerie,
        appareilId: 'appareil-1',
        candidatsLpp: [
          {
            code: '7310442',
            naturePrestation: 'P1D',
            baseRemboursement: centimes(40_000),
          },
        ],
      },
    ],
    consommables: [],
    montantAccorde: null,
    tarifs: TARIFS,
    tauxTva: TAUX_TVA,
  });
}

const codes = (constats: ResultatControleFacture['erreurs']) => constats.map((c) => c.code);
const controler = (f: Partial<FaitsFacture>, base: ContenuFacture = facture()) =>
  controlerFacture(base, faits(f));

function avecLigne(surcharge: Partial<LigneFacture>): ContenuFacture {
  const base = facture();
  return { ...base, lignes: base.lignes.map((l) => ({ ...l, ...surcharge })) };
}

describe('dossier conforme', () => {
  it('ne relève rien et il est prêt', () => {
    const resultat = controler({});
    expect(resultat).toEqual({ erreurs: [], avertissements: [] });
    expect(etatFacture(resultat)).toBe('PRET');
  });
});

describe('erreurs bloquantes', () => {
  const amo = faits().couvertureAmo;
  const lectureAncienne = { ...amo, derniereLectureVitale: '2026-09-30' } as typeof amo;
  const retouchee = { ...amo, origine: 'SAISIE' } as typeof amo;

  it.each([
    { cas: 'pas de couverture AMO', f: { couvertureAmo: null }, code: 'COUVERTURE_AMO_ABSENTE' },
    {
      cas: 'lecture de plus de 30 jours',
      f: { couvertureAmo: lectureAncienne },
      code: 'COUVERTURE_AMO_A_CONFIRMER',
    },
    {
      cas: 'fiche retouchée après une lecture récente',
      f: { couvertureAmo: retouchee },
      code: 'COUVERTURE_AMO_A_CONFIRMER',
    },
    {
      cas: 'confirmation antérieure à la modification',
      f: { couvertureAmo: retouchee, amoConfirmeeLe: '2026-10-19T10:00:00.000Z' },
      code: 'COUVERTURE_AMO_A_CONFIRMER',
    },
    {
      cas: 'droits expirés à la délivrance',
      f: { couvertureAmo: { ...amo, finDroits: '2026-10-30' } as typeof amo },
      code: 'DROITS_AMO_NON_OUVERTS',
    },
    { cas: 'pas de prescription', f: { prescription: null }, code: 'PRESCRIPTION_ABSENTE' },
    {
      cas: 'prescription postérieure au devis',
      f: {
        devis: { ...faits().devis, dateEmission: '2026-07-01' } as FaitsFacture['devis'],
      },
      code: 'PRESCRIPTION_POSTERIEURE_AU_DEVIS',
    },
    {
      cas: 'oreille non prescrite',
      f: {
        oreilles: [
          { oreille: 'DROITE', type: 'PRIMO' },
          { oreille: 'GAUCHE', type: 'PRIMO' },
        ],
      } as Partial<FaitsFacture>,
      code: 'OREILLE_NON_PRESCRITE',
    },
    {
      cas: 'renouvellement avant 4 ans à la délivrance',
      f: {
        historiqueDelivrances: [{ oreille: 'DROITE', dateDelivrance: '2023-01-01' }],
      } as Partial<FaitsFacture>,
      code: 'RENOUVELLEMENT_AVANT_DELAI',
    },
    { cas: 'devis non signé', f: { devis: null }, code: 'DEVIS_NON_SIGNE' },
    { cas: 'couverture AMC sans PEC', f: { couvertureAmc: true }, code: 'PEC_MANQUANTE' },
    {
      cas: 'AMC annoncée au devis sans PEC',
      f: {
        devis: { ...faits().devis, amcPrevue: true } as FaitsFacture['devis'],
      },
      code: 'PEC_MANQUANTE',
    },
    {
      cas: 'PEC à demander',
      f: {
        pec: { statut: 'A_DEMANDER', justificatif: false, validiteFin: null },
      } as Partial<FaitsFacture>,
      code: 'PEC_EN_ATTENTE',
    },
    {
      cas: 'PEC expirée',
      f: {
        pec: { statut: 'EXPIREE', justificatif: false, validiteFin: null },
      } as Partial<FaitsFacture>,
      code: 'PEC_EXPIREE',
    },
    {
      cas: 'accord dont la validité finit avant la délivrance',
      f: {
        pec: { statut: 'ACCORDEE', justificatif: true, validiteFin: '2000-01-01' },
      } as Partial<FaitsFacture>,
      code: 'PEC_EXPIREE',
    },
    {
      cas: 'tiers payant refusé en C2S',
      f: { c2s: true, tiersPayantAmo: false },
      code: 'TIERS_PAYANT_OBLIGATOIRE',
    },
    {
      cas: 'PEC demandée sans réponse',
      f: {
        pec: { statut: 'DEMANDEE', justificatif: false, validiteFin: null },
      } as Partial<FaitsFacture>,
      code: 'PEC_EN_ATTENTE',
    },
  ])('$cas', ({ f, code }) => {
    const resultat = controler(f);
    expect(codes(resultat.erreurs)).toContain(code);
    expect(etatFacture(resultat)).toBe('BLOQUE');
  });

  it('exige le numéro de série de chaque aide', () => {
    const resultat = controler({}, facture({ numeroSerie: null }));
    expect(resultat.erreurs).toEqual([{ code: 'NUMERO_SERIE_MANQUANT', oreille: 'DROITE' }]);
  });

  it.each([
    { cas: 'somme fausse', ligne: { amo: centimes(25_000) } },
    { cas: 'part négative', ligne: { amc: centimes(-1), resteACharge: centimes(71_001) } },
    { cas: 'amo négative', ligne: { amo: centimes(-1), resteACharge: centimes(95_001) } },
    { cas: 'reste négatif', ligne: { amc: centimes(71_001), resteACharge: centimes(-1) } },
  ])('refuse une ventilation incohérente : $cas', ({ ligne }) => {
    expect(codes(controler({}, avecLigne(ligne)).erreurs)).toContain('VENTILATION_INCOHERENTE');
  });

  it('refuse des totaux incohérents', () => {
    const base = facture();
    const incoherente = { ...base, totaux: { ...base.totaux, amc: centimes(1) } };
    expect(controler({}, incoherente).erreurs).toEqual([
      { code: 'VENTILATION_INCOHERENTE', oreille: null },
    ]);
  });

  it('refuse un prix au-dessus du prix limite à la délivrance', () => {
    const resultat = controler({}, facture({ prixTTC: 95_001 }));
    expect(resultat.erreurs).toEqual([{ code: 'PRIX_SUPERIEUR_PRIX_LIMITE', oreille: 'DROITE' }]);
  });

  it('accepte le prix exactement au plafond', () => {
    expect(controler({}, facture({ prixTTC: 95_000 })).erreurs).toEqual([]);
  });

  it('refuse un prix au-dessus du plafond C2S', () => {
    const resultat = controler({ c2s: true }, facture({ prixTTC: 95_000 }));
    expect(resultat.erreurs).toEqual([{ code: 'PRIX_SUPERIEUR_PLAFOND_C2S', oreille: 'DROITE' }]);
  });

  it('applique le plafond général après un refus de l’offre C2S', () => {
    const devis = { ...faits().devis, refusOffreC2S: true } as FaitsFacture['devis'];
    expect(controler({ c2s: true, devis }, facture({ prixTTC: 95_000 })).erreurs).toEqual([]);
    expect(controler({ c2s: true, devis }, facture({ prixTTC: 95_001 })).erreurs).toEqual([
      { code: 'PRIX_SUPERIEUR_PRIX_LIMITE', oreille: 'DROITE' },
    ]);
  });
});

describe('situations qui ne bloquent pas', () => {
  it('une saisie confirmée depuis sa dernière modification suffit', () => {
    const amo = { ...faits().couvertureAmo, origine: 'SAISIE' } as FaitsFacture['couvertureAmo'];
    const resultat = controler({ couvertureAmo: amo, amoConfirmeeLe: '2026-10-21T08:00:00.000Z' });
    expect(resultat.erreurs).toEqual([]);
  });

  it('un renouvellement forcé par un ADMIN_CLIENT passe en avertissement', () => {
    const base = faits().prescription;
    const prescription = {
      ...base,
      erreursForcees: [{ code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' }],
    } as FaitsFacture['prescription'];
    const resultat = controler({
      prescription,
      historiqueDelivrances: [{ oreille: 'DROITE', dateDelivrance: '2023-01-01' }],
    });
    expect(resultat.erreurs).toEqual([]);
    expect(resultat.avertissements).toEqual([
      { code: 'RENOUVELLEMENT_AVANT_DELAI', oreille: 'DROITE' },
    ]);
  });

  it('la C2S n’attend pas de PEC', () => {
    const resultat = controler({ c2s: true, couvertureAmc: true }, facture({ prixTTC: 80_000 }));
    expect(resultat.erreurs).toEqual([]);
  });

  it('sans tiers payant, l’attente de PEC est levée', () => {
    const pec = { statut: 'SANS_TIERS_PAYANT', justificatif: false, validiteFin: null } as const;
    expect(controler({ couvertureAmc: true, pec })).toEqual({ erreurs: [], avertissements: [] });
  });
});

describe('avertissements', () => {
  const amo = faits().couvertureAmo;
  const accordee = { statut: 'ACCORDEE', justificatif: true, validiteFin: null } as const;

  it.each([
    {
      cas: 'fin de droits inconnue',
      f: { couvertureAmo: { ...amo, finDroits: null } as typeof amo },
      base: facture(),
      code: 'DROITS_AMO_FIN_INCONNUE',
    },
    {
      cas: 'RPPS du prescripteur manquant',
      f: {
        prescription: {
          ...faits().prescription,
          prescripteur: { specialite: 'ORL', formationOtologie: null, rpps: null },
        } as FaitsFacture['prescription'],
      },
      base: facture(),
      code: 'RPPS_PRESCRIPTEUR_MANQUANT',
    },
    {
      cas: 'prescripteur non conforme',
      f: {
        prescription: {
          ...faits().prescription,
          prescripteur: { specialite: 'AUTRE', formationOtologie: null, rpps: '10000000017' },
        } as FaitsFacture['prescription'],
      },
      base: facture(),
      code: 'PRESCRIPTEUR_NON_CONFORME',
    },
    {
      cas: 'AMO différente du devis signé',
      f: { devis: { ...faits().devis, amoPrevue: centimes(84_000) } as FaitsFacture['devis'] },
      base: facture(),
      code: 'ECART_AMO_DEVIS',
    },
    {
      cas: 'code LPP générique',
      f: {},
      base: avecLigne({ codeLppGenerique: true }),
      code: 'CODE_LPP_GENERIQUE',
    },
    {
      cas: 'article sans tarif',
      f: {},
      base: avecLigne({ classe: null, baseRemboursement: centimes(0) }),
      code: 'ARTICLE_SANS_CODE_LPP',
    },
    {
      cas: 'PEC refusée',
      f: {
        pec: { statut: 'REFUSEE', justificatif: false, validiteFin: null },
      } as Partial<FaitsFacture>,
      base: facture(),
      code: 'PEC_REFUSEE',
    },
    {
      cas: 'PEC accordée en partie sans justificatif',
      f: {
        pec: { statut: 'PARTIELLE', justificatif: false, validiteFin: null },
      } as Partial<FaitsFacture>,
      base: facture(),
      code: 'PEC_SANS_JUSTIFICATIF',
    },
    {
      cas: 'PEC accordée sans justificatif',
      f: {
        pec: { statut: 'ACCORDEE', justificatif: false, validiteFin: null },
      } as Partial<FaitsFacture>,
      base: facture(),
      code: 'PEC_SANS_JUSTIFICATIF',
    },
    {
      cas: 'PEC écrêtée',
      f: { pec: accordee },
      base: { ...facture(), amcNonAffectee: centimes(1) },
      code: 'PEC_SUPERIEURE_AU_RESTE',
    },
    {
      cas: 'reste à charge sur une classe I, contrat responsable',
      f: {
        pec: accordee,
        devis: { ...faits().devis, contratResponsable: true } as FaitsFacture['devis'],
      },
      base: facture(),
      code: 'RESTE_A_CHARGE_CLASSE_I',
    },
  ])('$cas', ({ f, base, code }) => {
    const resultat = controlerFacture(base, faits(f));
    expect(codes(resultat.avertissements)).toContain(code);
    expect(resultat.erreurs).toEqual([]);
  });

  it.each([
    { cas: 'contrat non responsable', contrat: false, pec: accordee, reste: 71_000, classe: 'I' },
    { cas: 'sans PEC accordée', contrat: true, pec: null, reste: 71_000, classe: 'I' },
    { cas: 'reste nul', contrat: true, pec: accordee, reste: 0, classe: 'I' },
    { cas: 'classe II', contrat: true, pec: accordee, reste: 71_000, classe: 'II' },
  ])('pas d’alerte de reste à charge : $cas', ({ contrat, pec, reste, classe }) => {
    const base = avecLigne({
      resteACharge: centimes(reste),
      amc: centimes(71_000 - reste),
      classe: classe === 'I' ? 'CLASSE_I' : 'CLASSE_II',
    });
    const devis = {
      ...faits().devis,
      contratResponsable: contrat,
    } as FaitsFacture['devis'];
    const resultat = controlerFacture(base, faits({ pec, devis }));
    expect(codes(resultat.avertissements)).not.toContain('RESTE_A_CHARGE_CLASSE_I');
  });

  it('un article remboursé ne lève pas d’alerte', () => {
    const resultat = controler({}, avecLigne({ classe: null }));
    expect(codes(resultat.avertissements)).not.toContain('ARTICLE_SANS_CODE_LPP');
  });

  it('une AMO du devis inconnue n’est pas comparée', () => {
    const devis = { ...faits().devis, amoPrevue: null } as FaitsFacture['devis'];
    expect(controler({ devis })).toEqual({ erreurs: [], avertissements: [] });
  });
});

describe('TVA et mentions', () => {
  it('bloque sans taux à la date de la facture', () => {
    expect(codes(controler({}, avecLigne({ tauxTva: null })).erreurs)).toContain('TAUX_TVA_ABSENT');
  });

  it('signale un taux différent de celui du devis signé', () => {
    const devis = { ...faits().devis, tauxTva: [{ nature: 'AIDE_AUDITIVE', taux: 2000 }] };
    const resultat = controler({ devis: devis as FaitsFacture['devis'] });
    expect(codes(resultat.avertissements)).toEqual(['TVA_DIFFERENTE_DEVIS']);
  });

  it.each([
    { cas: 'raison sociale', vendeur: { ...VENDEUR, raisonSociale: null } },
    { cas: 'SIRET', vendeur: { ...VENDEUR, siret: null } },
  ])('bloque sans $cas', ({ vendeur }) => {
    expect(codes(controler({ vendeur }).erreurs)).toEqual(['IDENTIFICATION_ENTREPRISE_INCOMPLETE']);
  });

  it.each([
    { cas: 'RCS', vendeur: { ...VENDEUR, rcs: null } },
    { cas: 'FINESS', vendeur: { ...VENDEUR, finess: null } },
    { cas: 'TVA', vendeur: { ...VENDEUR, tvaIntracommunautaire: null } },
  ])('signale sans bloquer l’absence de $cas', ({ vendeur }) => {
    const resultat = controler({ vendeur });
    expect(resultat.erreurs).toEqual([]);
    expect(codes(resultat.avertissements)).toEqual(['IDENTIFIANTS_ENTREPRISE_A_COMPLETER']);
  });

  it('signale une adresse de patient manquante', () => {
    const resultat = controler({ client: { ...CLIENT, adresse: [] } });
    expect(codes(resultat.avertissements)).toEqual(['ADRESSE_CLIENT_MANQUANTE']);
  });
});

describe('vente directe', () => {
  const directe = {
    remboursable: false,
    c2s: false,
    tiersPayantAmo: true,
    couvertureAmo: null,
    amoConfirmeeLe: null,
    vendeur: VENDEUR,
    client: CLIENT,
  };

  it('ne demande pas de couverture sans prescription', () => {
    expect(controlerVenteDirecte(facture(), directe)).toEqual({ erreurs: [], avertissements: [] });
  });

  it('exige une couverture dès qu’une prescription ouvre le remboursement', () => {
    const resultat = controlerVenteDirecte(facture(), { ...directe, remboursable: true });
    expect(codes(resultat.erreurs)).toEqual(['COUVERTURE_AMO_ABSENTE']);
  });

  it('impose le tiers payant en C2S', () => {
    const resultat = controlerVenteDirecte(facture(), {
      ...directe,
      c2s: true,
      tiersPayantAmo: false,
    });
    expect(codes(resultat.erreurs)).toEqual(['TIERS_PAYANT_OBLIGATOIRE']);
  });

  it('refuse une vente sans ligne ou sans taux', () => {
    const vide = { ...facture(), lignes: [] };
    expect(codes(controlerVenteDirecte(vide, directe).erreurs)).toEqual(['AUCUNE_LIGNE_FACTURE']);
    const sansTaux = avecLigne({ tauxTva: null });
    expect(codes(controlerVenteDirecte(sansTaux, directe).erreurs)).toEqual(['TAUX_TVA_ABSENT']);
  });
});
