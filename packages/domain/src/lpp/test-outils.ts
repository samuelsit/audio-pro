import type { LigneDbf } from './lignes';

// Lignes dBase brutes pour les tests, calquées sur la base 908.

export function ficheBrute(champs: Readonly<Record<string, string>> = {}): LigneDbf {
  return {
    CODE_TIPS: '7336200',
    NOM_COURT: 'AIDE AUDITIVE, CLASSE I, DROITE, > 20 ANS,SIVANTOS',
    RMO1: '',
    RMO2: '',
    RMO3: '',
    RMO4: '',
    RMO5: '',
    DATE_FIN: '',
    AGE_MAX: '0',
    TYPE_PREST: 'A',
    INDICATION: 'N',
    ARBO1: '2',
    ARBO2: '3',
    ARBO3: '7',
    ARBO4: '0',
    ARBO5: '0',
    ARBO6: '0',
    ARBO7: '0',
    ARBO8: '0',
    ARBO9: '0',
    ARBO10: '0',
    PLACE: '54.000000',
    PROTHESE: '',
    OLD_CODE: '',
    ...champs,
  };
}

export function histoBrut(champs: Readonly<Record<string, string>> = {}): LigneDbf {
  return {
    CODE_TIPS: '7336200',
    DEBUTVALID: '20230707',
    FINHISTO: '',
    NAT_PREST: 'P1D',
    ENTENTE: 'N',
    ARRETE: '20230703',
    JO: '20230706',
    PUDEVIS: '0',
    TARIF: '400.00',
    MAJO_DOM1: '1.300',
    MAJO_DOM2: '1.150',
    MAJO_DOM3: '9.999',
    MAJO_DOM4: '1.200',
    QTE_MAX: '0',
    MT_MAX: '0.00',
    PUREGLEMEN: '950.00',
    PECP01: '00',
    PECP02: '00',
    PECP03: '00',
    MAJO_DOM5: '1.000',
    MAJO_DOM6: '1.360',
    ...champs,
  };
}
