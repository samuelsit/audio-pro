import { describe, expect, it } from 'vitest';

import {
  LIBELLES_STATUTS_APPAREIL,
  MESSAGES_REFUS_TRANSITION,
  CODES_REFUS_TRANSITION,
  patientAChoisir,
  peutTransferer,
  STATUTS_APPAREIL,
  transitionsPossibles,
  verifierAnnulationVente,
  verifierTransition,
  verifierTransitionManuelle,
  type CodeRefusTransition,
  type EffetPatient,
  type StatutAppareil,
} from './etats';

type Attendu = EffetPatient | CodeRefusTransition;

const INTERDIT = 'TRANSITION_INTERDITE';
const HORS_PARC = { parcPret: false } as const;

/**
 * Matrice complète, écrite à la main : colonnes dans l'ordre de STATUTS_APPAREIL. Cas : un patient est
 * fourni si la transition en demande un, et aucun patient n'est rattaché, sauf aux statuts qui en portent un.
 */
const MATRICE: Readonly<Record<StatutAppareil, Readonly<Record<StatutAppareil, Attendu>>>> = {
  EN_STOCK: {
    EN_STOCK: INTERDIT,
    RESERVE: 'RATTACHER',
    EN_ESSAI: 'RATTACHER',
    VENDU: INTERDIT,
    RETOUR_FABRICANT: 'CONSERVER',
    SAV: 'CONSERVER',
    PRET: 'RATTACHER',
    REMPLACE: INTERDIT,
  },
  RESERVE: {
    EN_STOCK: 'DETACHER',
    RESERVE: INTERDIT,
    EN_ESSAI: 'CONSERVER',
    VENDU: 'CONSERVER',
    RETOUR_FABRICANT: INTERDIT,
    SAV: INTERDIT,
    PRET: INTERDIT,
    REMPLACE: INTERDIT,
  },
  EN_ESSAI: {
    EN_STOCK: 'DETACHER',
    RESERVE: 'CONSERVER',
    EN_ESSAI: INTERDIT,
    VENDU: INTERDIT,
    RETOUR_FABRICANT: INTERDIT,
    SAV: 'DETACHER',
    PRET: INTERDIT,
    REMPLACE: INTERDIT,
  },
  VENDU: {
    EN_STOCK: 'ANNULATION_REQUISE',
    RESERVE: 'CONSERVER',
    EN_ESSAI: INTERDIT,
    VENDU: INTERDIT,
    RETOUR_FABRICANT: INTERDIT,
    SAV: 'CONSERVER',
    PRET: INTERDIT,
    REMPLACE: INTERDIT,
  },
  RETOUR_FABRICANT: {
    EN_STOCK: 'DETACHER',
    RESERVE: INTERDIT,
    EN_ESSAI: INTERDIT,
    VENDU: 'APPAREIL_NON_VENDU',
    RETOUR_FABRICANT: INTERDIT,
    SAV: 'CONSERVER',
    PRET: INTERDIT,
    REMPLACE: 'DETACHER',
  },
  SAV: {
    EN_STOCK: 'DETACHER',
    RESERVE: INTERDIT,
    EN_ESSAI: INTERDIT,
    VENDU: 'APPAREIL_NON_VENDU',
    RETOUR_FABRICANT: 'CONSERVER',
    SAV: INTERDIT,
    PRET: INTERDIT,
    REMPLACE: 'DETACHER',
  },
  PRET: {
    EN_STOCK: 'DETACHER',
    RESERVE: INTERDIT,
    EN_ESSAI: INTERDIT,
    VENDU: INTERDIT,
    RETOUR_FABRICANT: INTERDIT,
    SAV: 'DETACHER',
    PRET: INTERDIT,
    REMPLACE: INTERDIT,
  },
  REMPLACE: {
    EN_STOCK: INTERDIT,
    RESERVE: INTERDIT,
    EN_ESSAI: INTERDIT,
    VENDU: INTERDIT,
    RETOUR_FABRICANT: INTERDIT,
    SAV: INTERDIT,
    PRET: INTERDIT,
    REMPLACE: INTERDIT,
  },
};

const PORTEURS: readonly StatutAppareil[] = ['RESERVE', 'EN_ESSAI', 'VENDU', 'PRET'];

const cas = STATUTS_APPAREIL.flatMap((de) =>
  STATUTS_APPAREIL.map((vers) => ({ de, vers, attendu: MATRICE[de][vers] })),
);

function resume(resultat: ReturnType<typeof verifierTransition>): Attendu {
  return resultat.autorisee ? resultat.effetPatient : resultat.code;
}

describe('verifierTransition', () => {
  it('couvre les 64 couples de statuts', () => {
    expect(cas).toHaveLength(64);
  });

  it.each(cas)('$de → $vers : $attendu', ({ de, vers, attendu }) => {
    const etat = { ...HORS_PARC, statut: de, patientRattache: PORTEURS.includes(de) };
    expect(resume(verifierTransition(etat, vers, true))).toBe(attendu);
  });

  it.each([
    { vers: 'RESERVE', attendu: 'PATIENT_REQUIS' },
    { vers: 'EN_ESSAI', attendu: 'PATIENT_REQUIS' },
    { vers: 'PRET', attendu: 'PATIENT_REQUIS' },
    { vers: 'SAV', attendu: 'CONSERVER' },
    { vers: 'RETOUR_FABRICANT', attendu: 'CONSERVER' },
  ] as const)('depuis EN_STOCK sans patient fourni, vers $vers : $attendu', ({ vers, attendu }) => {
    const etat = { ...HORS_PARC, statut: 'EN_STOCK', patientRattache: false } as const;
    expect(resume(verifierTransition(etat, vers, false))).toBe(attendu);
  });

  it('RESERVE → EN_ESSAI garde le patient de la réservation, sans en redemander', () => {
    const etat = { ...HORS_PARC, statut: 'RESERVE', patientRattache: true } as const;
    expect(resume(verifierTransition(etat, 'EN_ESSAI', false))).toBe('CONSERVER');
  });

  it.each([
    { de: 'SAV', vers: 'EN_STOCK', attendu: 'APPAREIL_DU_PATIENT' },
    { de: 'RETOUR_FABRICANT', vers: 'EN_STOCK', attendu: 'APPAREIL_DU_PATIENT' },
    { de: 'SAV', vers: 'VENDU', attendu: 'CONSERVER' },
    { de: 'RETOUR_FABRICANT', vers: 'VENDU', attendu: 'CONSERVER' },
    { de: 'SAV', vers: 'RETOUR_FABRICANT', attendu: 'CONSERVER' },
    { de: 'RETOUR_FABRICANT', vers: 'SAV', attendu: 'CONSERVER' },
  ] as const)('$de → $vers d’un appareil vendu : $attendu', ({ de, vers, attendu }) => {
    const etat = { ...HORS_PARC, statut: de, patientRattache: true };
    expect(resume(verifierTransition(etat, vers, false))).toBe(attendu);
  });

  it('le SAV d’un appareil vendu passe par un retour au patient, pas par le stock', () => {
    const vendu = { ...HORS_PARC, statut: 'VENDU', patientRattache: true } as const;
    expect(resume(verifierTransition(vendu, 'SAV', false))).toBe('CONSERVER');
    const enSav = { ...HORS_PARC, statut: 'SAV', patientRattache: true } as const;
    expect(transitionsPossibles(enSav)).toEqual(['VENDU']);
  });

  it.each(['SAV', 'RETOUR_FABRICANT'] as const)('%s → REMPLACE détache le patient', (statut) => {
    const etat = { ...HORS_PARC, statut, patientRattache: true };
    expect(resume(verifierTransition(etat, 'REMPLACE', false))).toBe('DETACHER');
  });

  it.each(['RESERVE', 'EN_ESSAI'] as const)('un appareil du parc refuse %s', (vers) => {
    const etat = { statut: 'EN_STOCK', patientRattache: false, parcPret: true } as const;
    expect(resume(verifierTransition(etat, vers, true))).toBe('APPAREIL_DE_PRET');
  });

  it('un appareil du parc se prête', () => {
    const etat = { statut: 'EN_STOCK', patientRattache: false, parcPret: true } as const;
    expect(resume(verifierTransition(etat, 'PRET', true))).toBe('RATTACHER');
  });
});

describe('verifierTransitionManuelle', () => {
  it.each([
    { statut: 'EN_STOCK', patientRattache: false, vers: 'EN_ESSAI' },
    { statut: 'RESERVE', patientRattache: true, vers: 'EN_ESSAI' },
    { statut: 'EN_ESSAI', patientRattache: true, vers: 'RESERVE' },
    { statut: 'RESERVE', patientRattache: true, vers: 'VENDU' },
    { statut: 'VENDU', patientRattache: true, vers: 'RESERVE' },
  ] as const)('$statut → $vers passe par le dossier', ({ vers, ...etat }) => {
    const complet = { ...HORS_PARC, ...etat };
    expect(resume(verifierTransitionManuelle(complet, vers, true))).toBe('PILOTE_PAR_DOSSIER');
  });

  it.each([
    { statut: 'EN_STOCK', patientRattache: false, vers: 'SAV' },
    { statut: 'EN_STOCK', patientRattache: false, vers: 'RETOUR_FABRICANT' },
    { statut: 'EN_STOCK', patientRattache: false, vers: 'PRET' },
    { statut: 'VENDU', patientRattache: true, vers: 'SAV' },
    { statut: 'SAV', patientRattache: true, vers: 'RETOUR_FABRICANT' },
    { statut: 'RETOUR_FABRICANT', patientRattache: true, vers: 'SAV' },
    { statut: 'SAV', patientRattache: true, vers: 'REMPLACE' },
    { statut: 'PRET', patientRattache: true, vers: 'SAV' },
  ] as const)('$statut → $vers passe par le SAV', ({ vers, ...etat }) => {
    const complet = { ...HORS_PARC, ...etat };
    expect(resume(verifierTransitionManuelle(complet, vers, true))).toBe('PILOTE_PAR_SAV');
  });

  it('laisse passer les autres changements et garde leur refus propre', () => {
    const enStock = { ...HORS_PARC, statut: 'EN_STOCK', patientRattache: false } as const;
    expect(resume(verifierTransitionManuelle(enStock, 'RESERVE', true))).toBe('RATTACHER');
    expect(resume(verifierTransitionManuelle(enStock, 'RESERVE', false))).toBe('PATIENT_REQUIS');
    expect(resume(verifierTransitionManuelle(enStock, 'VENDU', true))).toBe(INTERDIT);
  });
});

describe('transitionsPossibles', () => {
  it.each([
    { statut: 'EN_STOCK', patientRattache: false, attendu: ['RESERVE'] },
    { statut: 'RESERVE', patientRattache: true, attendu: ['EN_STOCK'] },
    { statut: 'EN_ESSAI', patientRattache: true, attendu: ['EN_STOCK'] },
    { statut: 'VENDU', patientRattache: true, attendu: [] },
    { statut: 'PRET', patientRattache: true, attendu: ['EN_STOCK'] },
    { statut: 'SAV', patientRattache: false, attendu: ['EN_STOCK'] },
    { statut: 'RETOUR_FABRICANT', patientRattache: false, attendu: ['EN_STOCK'] },
    { statut: 'RETOUR_FABRICANT', patientRattache: true, attendu: ['VENDU'] },
    { statut: 'REMPLACE', patientRattache: false, attendu: [] },
  ] as const)('$statut (patient : $patientRattache)', ({ statut, patientRattache, attendu }) => {
    expect(transitionsPossibles({ ...HORS_PARC, statut, patientRattache })).toEqual(attendu);
  });
});

describe('patientAChoisir', () => {
  it.each([
    { statut: 'EN_STOCK', vers: 'RESERVE', attendu: true },
    { statut: 'EN_STOCK', vers: 'PRET', attendu: true },
    { statut: 'EN_STOCK', vers: 'SAV', attendu: false },
    { statut: 'RESERVE', vers: 'EN_ESSAI', attendu: false },
    { statut: 'EN_STOCK', vers: 'VENDU', attendu: false },
  ] as const)('$statut → $vers : $attendu', ({ statut, vers, attendu }) => {
    const etat = { ...HORS_PARC, statut, patientRattache: statut === 'RESERVE' };
    expect(patientAChoisir(etat, vers)).toBe(attendu);
  });
});

describe('verifierAnnulationVente et peutTransferer', () => {
  it.each(STATUTS_APPAREIL)('annulation depuis %s', (statut) => {
    expect(verifierAnnulationVente(statut)).toBe(statut === 'VENDU');
  });

  it.each(STATUTS_APPAREIL)('transfert depuis %s', (statut) => {
    expect(peutTransferer(statut)).toBe(statut === 'EN_STOCK');
  });
});

describe('libellés', () => {
  it('chaque statut et chaque refus a un texte', () => {
    for (const statut of STATUTS_APPAREIL) {
      expect(LIBELLES_STATUTS_APPAREIL[statut]).not.toBe('');
    }
    for (const code of CODES_REFUS_TRANSITION) {
      expect(MESSAGES_REFUS_TRANSITION[code]).not.toBe('');
    }
  });
});
