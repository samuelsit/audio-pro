import { describe, expect, it } from 'vitest';

import { STATUTS_APPAREIL, type StatutAppareil } from '../stock/etats';
import {
  CODES_REFUS_APPAREIL_ESSAI,
  MESSAGES_REFUS_APPAREIL_ESSAI,
  refusAppareilEssai,
  type CodeRefusAppareilEssai,
} from './appareil';

const CIBLE = { centreId: 'centre-a', patientId: 'patient-a', modeleAttendu: 'modele-a' };

const appareil = (statut: StatutAppareil, reste: object = {}) => ({
  statut,
  centreId: 'centre-a',
  patientId: null,
  modeleId: 'modele-a',
  ...reste,
});

describe('refusAppareilEssai', () => {
  const ATTENDUS: Readonly<Record<StatutAppareil, CodeRefusAppareilEssai | null>> = {
    EN_STOCK: null,
    RESERVE: 'RESERVE_AUTRE_PATIENT',
    EN_ESSAI: 'DEJA_EN_ESSAI',
    VENDU: 'INDISPONIBLE',
    RETOUR_FABRICANT: 'INDISPONIBLE',
    SAV: 'INDISPONIBLE',
    PRET: 'INDISPONIBLE',
  };

  it.each(STATUTS_APPAREIL)('statut %s, sans patient rattaché', (statut) => {
    expect(refusAppareilEssai(appareil(statut), CIBLE)).toBe(ATTENDUS[statut]);
  });

  it.each([
    {
      cas: 'réservé au patient du dossier',
      candidat: appareil('RESERVE', { patientId: 'patient-a' }),
      attendu: null,
    },
    {
      cas: 'réservé à un autre patient',
      candidat: appareil('RESERVE', { patientId: 'patient-b' }),
      attendu: 'RESERVE_AUTRE_PATIENT',
    },
    {
      cas: 'autre centre : le statut n’est pas révélé',
      candidat: appareil('EN_ESSAI', { centreId: 'centre-b' }),
      attendu: 'AUTRE_CENTRE',
    },
    {
      cas: 'autre modèle que celui du devis',
      candidat: appareil('EN_STOCK', { modeleId: 'modele-b' }),
      attendu: 'MODELE_DIFFERENT',
    },
  ])('$cas', ({ candidat, attendu }) => {
    expect(refusAppareilEssai(candidat, CIBLE)).toBe(attendu);
  });

  it('accepte un autre modèle lors d’un changement', () => {
    const candidat = appareil('EN_STOCK', { modeleId: 'modele-b' });
    expect(refusAppareilEssai(candidat, { ...CIBLE, modeleAttendu: null })).toBeNull();
  });

  it('chaque refus a un message', () => {
    for (const code of CODES_REFUS_APPAREIL_ESSAI) {
      expect(MESSAGES_REFUS_APPAREIL_ESSAI[code]).not.toBe('');
    }
  });
});
