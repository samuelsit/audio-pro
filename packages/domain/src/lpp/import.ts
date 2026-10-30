import type { z } from 'zod';

import {
  resultatFiche,
  resultatLien,
  resultatTarif,
  type FicheLpp,
  type LienBrutLpp,
  type LigneDbf,
  type TarifBrutLpp,
} from './lignes';
import {
  codeGeneriqueDepuisOldCode,
  estTitreDeuxChapitreTrois,
  prixLimiteVenteDepuisPuReglemente,
} from './regles';

/** Import refusé : rien n'est écrit en base. */
export class ErreurImportLpp extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurImportLpp';
  }
}

export const TYPES_FICHIER_LPP = ['fiche', 'histo', 'comp', 'incomp'] as const;
export type TypeFichierLpp = (typeof TYPES_FICHIER_LPP)[number];

const NOM_FICHIER_LPP = /^lpp_(fiche|histo|comp|incomp)_tot(\d+)\.dbf$/i;

/**
 * Retrouve les 4 fichiers d'une version dans un dossier nommé d'après elle (`.../908`), sans tenir
 * compte de la casse : la note de version écrit LPP_fiche_tot908.dbf, le dépôt lpp_fiche_tot908.dbf.
 */
export function resoudreFichiersLpp(
  nomDossier: string,
  nomsFichiers: readonly string[],
): { version: number; fichiers: Readonly<Record<TypeFichierLpp, string>> } {
  if (!/^\d+$/.test(nomDossier)) {
    throw new ErreurImportLpp(
      `Le dossier doit porter le numéro de version (reçu : ${nomDossier}).`,
    );
  }
  const version = Number(nomDossier);
  const fichiers: Partial<Record<TypeFichierLpp, string>> = {};
  for (const nom of nomsFichiers) {
    const correspondance = NOM_FICHIER_LPP.exec(nom);
    if (!correspondance) {
      continue;
    }
    const [, type = '', numero = ''] = correspondance;
    if (Number(numero) !== version) {
      throw new ErreurImportLpp(`${nom} ne correspond pas à la version ${version}.`);
    }
    const cle = type.toLowerCase() as TypeFichierLpp;
    if (fichiers[cle]) {
      throw new ErreurImportLpp(`Deux fichiers « ${cle} » dans le dossier.`);
    }
    fichiers[cle] = nom;
  }
  const manquants = TYPES_FICHIER_LPP.filter((type) => !fichiers[type]);
  if (manquants.length > 0) {
    throw new ErreurImportLpp(`Fichiers manquants : ${manquants.join(', ')}.`);
  }
  return { version, fichiers: fichiers as Record<TypeFichierLpp, string> };
}

export interface FichiersLppBruts {
  readonly fiche: readonly LigneDbf[];
  readonly histo: readonly LigneDbf[];
  readonly comp: readonly LigneDbf[];
  readonly incomp: readonly LigneDbf[];
}

export interface FicheLppPreparee extends FicheLpp {
  readonly codeGenerique: string | null;
  readonly brut: LigneDbf;
}

export interface TarifLppPrepare extends Omit<
  TarifBrutLpp,
  'montantMaxBrutCentimes' | 'puReglementeCentimes'
> {
  readonly prixLimiteVenteCentimes: number | null;
  readonly montantMaxCentimes: number | null;
  readonly brut: LigneDbf;
}

export interface LienLppPrepare extends LienBrutLpp {
  readonly type: 'COMPATIBLE' | 'INCOMPATIBLE';
}

export interface ImportLppPrepare {
  readonly fiches: readonly FicheLppPreparee[];
  readonly tarifs: readonly TarifLppPrepare[];
  readonly liens: readonly LienLppPrepare[];
}

function exiger<T>(
  resultat: z.ZodSafeParseResult<T>,
  fichier: TypeFichierLpp,
  brut: LigneDbf,
  cle: string,
): T {
  if (!resultat.success) {
    const detail = resultat.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`);
    throw new ErreurImportLpp(`${fichier}, ligne ${String(brut[cle])}, ${detail.join(' ; ')}`);
  }
  return resultat.data;
}

function verifierUnicite(cles: readonly string[], description: string): void {
  const vues = new Set<string>();
  for (const cle of cles) {
    if (vues.has(cle)) {
      throw new ErreurImportLpp(`${description} en double : ${cle}.`);
    }
    vues.add(cle);
  }
}

/** Vrai pour une ligne de fiche du chapitre, avant toute validation : le reste de la base est ignoré. */
function ligneDuChapitre(brut: LigneDbf): boolean {
  return estTitreDeuxChapitreTrois([Number(brut['ARBO1']), Number(brut['ARBO2'])]);
}

/**
 * Valide et convertit une version de la base : fiche et historique du titre II chapitre 3,
 * compatibilités et incompatibilités en entier. Toute incohérence refuse la version complète.
 */
export function preparerImportLpp(bruts: FichiersLppBruts): ImportLppPrepare {
  const tousLesCodes = new Set(bruts.fiche.map((brut) => brut['CODE_TIPS']));
  const orphelin = bruts.histo.find((brut) => !tousLesCodes.has(brut['CODE_TIPS']));
  if (orphelin) {
    throw new ErreurImportLpp(`Historique sans fiche : ${orphelin['CODE_TIPS']}.`);
  }

  const lignesChapitre = bruts.fiche.filter(ligneDuChapitre);
  if (lignesChapitre.length === 0) {
    throw new ErreurImportLpp('Aucun code du titre II chapitre 3 dans la fiche.');
  }
  const fichesLues = lignesChapitre.map((brut) => ({
    ...exiger(resultatFiche(brut), 'fiche', brut, 'CODE_TIPS'),
    brut,
  }));
  verifierUnicite(
    fichesLues.map((f) => f.code),
    'Code',
  );
  const codes = new Set(fichesLues.map((f) => f.code));
  const fiches = fichesLues.map((fiche) => ({
    ...fiche,
    codeGenerique: codeGeneriqueDepuisOldCode(fiche.code, fiche.oldCode, codes),
  }));

  const codesLus: ReadonlySet<string | undefined> = codes;
  const tarifs = bruts.histo
    .filter((brut) => codesLus.has(brut['CODE_TIPS']))
    .map((brut) => {
      const { montantMaxBrutCentimes, puReglementeCentimes, ...tarif } = exiger(
        resultatTarif(brut),
        'histo',
        brut,
        'CODE_TIPS',
      );
      return {
        ...tarif,
        prixLimiteVenteCentimes: prixLimiteVenteDepuisPuReglemente(puReglementeCentimes),
        montantMaxCentimes: montantMaxBrutCentimes === 0 ? null : montantMaxBrutCentimes,
        brut,
      };
    });
  verifierUnicite(
    tarifs.map((t) => `${t.code}@${t.debutValidite}`),
    'Ligne d’historique',
  );
  const codesAvecTarif = new Set(tarifs.map((t) => t.code));
  const sansTarif = fiches.find((f) => !codesAvecTarif.has(f.code));
  if (sansTarif) {
    throw new ErreurImportLpp(`Code sans historique : ${sansTarif.code}.`);
  }

  const liens = (type: LienLppPrepare['type'], fichier: 'comp' | 'incomp') =>
    bruts[fichier].map((brut) => ({
      type,
      ...exiger(resultatLien(brut), fichier, brut, 'CODE1'),
    }));
  const tousLesLiens = [...liens('COMPATIBLE', 'comp'), ...liens('INCOMPATIBLE', 'incomp')];
  verifierUnicite(
    tousLesLiens.map((l) => `${l.type} ${l.code1}-${l.code2}`),
    'Lien',
  );

  return { fiches, tarifs, liens: tousLesLiens };
}
