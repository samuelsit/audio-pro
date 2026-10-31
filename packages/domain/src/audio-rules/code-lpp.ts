import type { ClasseLpp } from '../catalogue';
import type { Centimes } from '../money';
import { codePrestation, type Oreille } from './code-prestation';
import { trancheDepuisAge, type TrancheAge } from './tranche-age';

type GrilleLpp = Readonly<Record<Oreille, Readonly<Record<TrancheAge, string>>>>;

/**
 * Codes génériques, par classe, oreille et tranche.
 * Source : docs/ref/lpp/908/lpp_fiche_tot908.dbf ; fr201-codes-prestation.pdf, tests n° 5 à 7.
 */
export const CODES_LPP_GENERIQUES: Readonly<Record<ClasseLpp, GrilleLpp>> = {
  CLASSE_I: {
    DROITE: { VINGT_ET_PLUS: '2351057', MOINS_DE_20: '2325120' },
    GAUCHE: { VINGT_ET_PLUS: '2365119', MOINS_DE_20: '2337749' },
  },
  CLASSE_II: {
    DROITE: { VINGT_ET_PLUS: '2392530', MOINS_DE_20: '2307926' },
    GAUCHE: { VINGT_ET_PLUS: '2341840', MOINS_DE_20: '2369117' },
  },
};

/** Code du modèle, avec son tarif à la date de délivrance. */
export interface CodeLppCandidat {
  readonly code: string;
  readonly naturePrestation: string;
  readonly baseRemboursement: Centimes;
}

export interface EntreeCodeLpp {
  readonly classe: ClasseLpp;
  readonly oreille: Oreille;
  readonly c2s: boolean;
  readonly age: number;
  readonly baseRemboursement: Centimes;
  readonly candidats: readonly CodeLppCandidat[];
}

export interface CodeLppChoisi {
  readonly code: string;
  /** Code de la grille générique, de nature `RJT` depuis le 07/07/2023. */
  readonly generique: boolean;
}

/**
 * Code LPP d'une aide à la délivrance : le code du modèle dont la nature est le code prestation et dont la
 * base est celle de la tranche, sinon le code générique. Bénéficiaire C2S : codes de la classe II, quelle
 * que soit la classe de l'aide.
 * Source : docs/ref/lpp/908/lpp_histo_tot908.dbf (`NAT_PREST`, `TARIF`) ;
 * convention-audioprothesistes.pdf, art. 29 § 2, p. 27 ; fr201-codes-prestation.pdf, test n° 5.
 * À VÉRIFIER : sens de `RJT`, un code générique est-il encore facturable (R7) ?
 */
export function choisirCodeLpp({
  classe,
  oreille,
  c2s,
  age,
  baseRemboursement,
  candidats,
}: EntreeCodeLpp): CodeLppChoisi {
  const nature = codePrestation({ classe, oreille, c2s });
  const specifique = candidats.find(
    (c) => c.naturePrestation === nature && c.baseRemboursement === baseRemboursement,
  );
  if (specifique) {
    return { code: specifique.code, generique: false };
  }
  const classeFacturee = c2s ? 'CLASSE_II' : classe;
  const code = CODES_LPP_GENERIQUES[classeFacturee][oreille][trancheDepuisAge(age)];
  return { code, generique: true };
}
