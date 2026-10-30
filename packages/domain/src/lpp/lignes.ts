import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { decimalEnEntier } from '../money';

/** Ligne brute d'un fichier dBase : nom du champ → valeur en texte, sans espaces de bord. */
export type LigneDbf = Readonly<Record<string, string>>;

/** Code LPP : 7 chiffres. Source : docs/ref/lpp/908/lpp_fiche_tot908.dbf, champ CODE_TIPS (valeurs). */
export const codeLppSchema = z.string().regex(/^\d{7}$/, 'Un code LPP comporte 7 chiffres.');

const texteOuNull = z.string().transform((valeur) => (valeur === '' ? null : valeur));

/** Date dBase (AAAAMMJJ, vide si absente), rendue en ISO. */
const dateDbf = z
  .string()
  .regex(/^(\d{8})?$/, 'Date dBase invalide.')
  .transform((v) => (v === '' ? null : `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}`))
  .pipe(dateCalendaireSchema.nullable());

/** Nombre dBase converti en entier, sans passer par un flottant (`decimales` : 2 pour les centimes). */
function decimalDbf(decimales: number) {
  return z.string().transform((valeur, ctx) => {
    if (valeur === '') {
      return null;
    }
    const entier = decimalEnEntier(valeur, decimales);
    if (entier === null) {
      ctx.addIssue({ code: 'custom', message: `Nombre invalide : « ${valeur} ».` });
      return z.NEVER;
    }
    return entier;
  });
}

const CHAMPS_RMO = ['RMO1', 'RMO2', 'RMO3', 'RMO4', 'RMO5'] as const;
const CHAMPS_ARBO = [
  'ARBO1',
  'ARBO2',
  'ARBO3',
  'ARBO4',
  'ARBO5',
  'ARBO6',
  'ARBO7',
  'ARBO8',
  'ARBO9',
  'ARBO10',
] as const;
const CHAMPS_MAJO = [
  'MAJO_DOM1',
  'MAJO_DOM2',
  'MAJO_DOM3',
  'MAJO_DOM4',
  'MAJO_DOM5',
  'MAJO_DOM6',
] as const;
const CHAMPS_PECP = ['PECP01', 'PECP02', 'PECP03'] as const;

const ficheSchema = z
  .object({
    CODE_TIPS: codeLppSchema,
    NOM_COURT: z.string().min(1, 'Libellé vide.'),
    DATE_FIN: dateDbf,
    AGE_MAX: decimalDbf(0),
    TYPE_PREST: texteOuNull,
    INDICATION: texteOuNull,
    PROTHESE: texteOuNull,
    OLD_CODE: texteOuNull,
    rmo: z.array(z.string()),
    arbo: z.array(decimalDbf(0).pipe(z.number())),
  })
  .transform((l) => ({
    code: l.CODE_TIPS,
    libelle: l.NOM_COURT,
    dateFin: l.DATE_FIN,
    ageMax: l.AGE_MAX,
    typePrestation: l.TYPE_PREST,
    indication: l.INDICATION,
    prothese: l.PROTHESE,
    oldCode: l.OLD_CODE,
    rmo: l.rmo.filter((valeur) => valeur !== ''),
    arbo: l.arbo,
  }));
export type FicheLpp = z.output<typeof ficheSchema>;

const tarifSchema = z
  .object({
    CODE_TIPS: codeLppSchema,
    DEBUTVALID: dateDbf.pipe(dateCalendaireSchema),
    FINHISTO: dateDbf,
    NAT_PREST: z.string().min(1, 'Nature de prestation vide.'),
    ENTENTE: texteOuNull,
    ARRETE: dateDbf,
    JO: dateDbf,
    PUDEVIS: decimalDbf(0),
    TARIF: decimalDbf(2).pipe(z.number()),
    QTE_MAX: decimalDbf(0),
    MT_MAX: decimalDbf(2),
    PUREGLEMEN: decimalDbf(2),
    majorations: z.array(decimalDbf(3).pipe(z.number())),
    pecp: z.array(z.string()),
  })
  .transform((l) => ({
    code: l.CODE_TIPS,
    debutValidite: l.DEBUTVALID,
    finValidite: l.FINHISTO,
    naturePrestation: l.NAT_PREST,
    entente: l.ENTENTE,
    dateArrete: l.ARRETE,
    dateJo: l.JO,
    puDevis: l.PUDEVIS,
    baseRemboursementCentimes: l.TARIF,
    quantiteMax: l.QTE_MAX,
    montantMaxBrutCentimes: l.MT_MAX,
    puReglementeCentimes: l.PUREGLEMEN,
    majorationsDom: l.majorations,
    prisesEnCharge: l.pecp.filter((valeur) => valeur !== ''),
  }));
export type TarifBrutLpp = z.output<typeof tarifSchema>;

const lienSchema = z
  .object({ CODE1: codeLppSchema, CODE2: codeLppSchema })
  .transform((l) => ({ code1: l.CODE1, code2: l.CODE2 }));
export type LienBrutLpp = z.output<typeof lienSchema>;

export function resultatFiche(brut: LigneDbf) {
  return ficheSchema.safeParse({
    ...brut,
    rmo: CHAMPS_RMO.map((champ) => brut[champ]),
    arbo: CHAMPS_ARBO.map((champ) => brut[champ]),
  });
}

export function resultatTarif(brut: LigneDbf) {
  return tarifSchema.safeParse({
    ...brut,
    majorations: CHAMPS_MAJO.map((champ) => brut[champ]),
    pecp: CHAMPS_PECP.map((champ) => brut[champ]),
  });
}

export function resultatLien(brut: LigneDbf) {
  return lienSchema.safeParse(brut);
}
