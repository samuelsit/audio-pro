/**
 * Titre II, chapitre 3 de la LPP (ARBO1 = 2, ARBO2 = 3).
 * À VÉRIFIER : aucun fichier de docs/ref ne définit les champs ARBO ni ne donne les intitulés de
 * l'arborescence. La règle est déduite du contenu de la base 908 : ces deux valeurs isolent 846 codes,
 * tous audio, et les implants auditifs sont sous ARBO1 = 3.
 */
export function estTitreDeuxChapitreTrois(arbo: readonly number[]): boolean {
  return arbo[0] === 2 && arbo[1] === 3;
}

/**
 * Prix limite de vente à partir du champ PUREGLEMEN : 0 signifie « pas de plafond ».
 * Source : docs/ref/ameli-100-sante-audio.pdf p. 1 (classe I : 950 € et 1 400 €, classe II à prix
 * libres), valeurs identiques dans docs/ref/lpp/908/lpp_histo_tot908.dbf.
 * À VÉRIFIER : aucun document ne définit PUREGLEMEN ; le sens n'est recoupé que pour la classe I.
 */
export function prixLimiteVenteDepuisPuReglemente(
  puReglementeCentimes: number | null,
): number | null {
  return puReglementeCentimes === 0 ? null : puReglementeCentimes;
}

/**
 * Code générique d'un code spécifique : OLD_CODE, s'il désigne un code présent dans la base.
 * Seuls les codes « 7xxxxxx » sont des déclinaisons : ailleurs, OLD_CODE est un ancien code.
 * À VÉRIFIER : déduit du contenu de la base 908 (les 273 codes 7xxxxxx actifs du chapitre pointent
 * vers un code actif de nature RJT, de même tarif et de même section). Le dossier ne contient pas de
 * table de correspondance officielle ; si elle est déposée, elle prime.
 */
export function codeGeneriqueDepuisOldCode(
  code: string,
  oldCode: string | null,
  codesConnus: ReadonlySet<string>,
): string | null {
  return code.startsWith('7') && oldCode !== null && codesConnus.has(oldCode) ? oldCode : null;
}

export interface PeriodeTarifLpp {
  /** Date ISO, incluse. */
  readonly debutValidite: string;
  /** Date ISO, incluse ; `null` si la ligne est ouverte. */
  readonly finValidite: string | null;
}

/**
 * Ligne de tarif applicable à une date (date de délivrance), ou `null` si le code n'est pas valide.
 * Source : docs/ref/ameli-100-sante-audio.pdf p. 2 (« respecter le calendrier de validité des codes
 * prestations en fonction de la date de délivrance de l'équipement facturé »).
 * Bornes incluses : docs/ref/lpp/908/lpp_histo_tot908.dbf, code 2381242 (fin 02/07/2026, début 03/07/2026).
 * À VÉRIFIER : la date de fin de la fiche borne l'historique. Déduit des 507 codes de la section 6.1,
 * clos en 2004 dans la fiche mais encore ouverts dans l'historique ; aucun texte ne le dit.
 */
export function tarifEnVigueur<L extends PeriodeTarifLpp>(
  lignes: readonly L[],
  dateFinFiche: string | null,
  date: string,
): L | null {
  if (dateFinFiche !== null && date > dateFinFiche) {
    return null;
  }
  return (
    lignes.find(
      (l) => l.debutValidite <= date && (l.finValidite === null || date <= l.finValidite),
    ) ?? null
  );
}
