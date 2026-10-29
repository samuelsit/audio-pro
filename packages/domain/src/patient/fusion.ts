/**
 * Champs que l'utilisateur arbitre lors d'une fusion. L'adresse et chaque couverture sont des blocs
 * indivisibles (on ne mélange pas deux adresses ni deux contrats). Les notes sont toujours concaténées.
 */
export const CHAMPS_FUSION = [
  'centreId',
  'civilite',
  'nomNaissance',
  'nomUsage',
  'prenoms',
  'dateNaissance',
  'sexe',
  'adresse',
  'telephone',
  'email',
  'medecinTraitant',
  'consentementSms',
  'consentementEmail',
  'consentementCourrier',
  'amo',
  'amc',
] as const;
export type ChampFusion = (typeof CHAMPS_FUSION)[number];

export const LIBELLES_CHAMPS_FUSION: Readonly<Record<ChampFusion, string>> = {
  centreId: 'Centre de rattachement',
  civilite: 'Civilité',
  nomNaissance: 'Nom de naissance',
  nomUsage: 'Nom d’usage',
  prenoms: 'Prénoms',
  dateNaissance: 'Date de naissance',
  sexe: 'Sexe',
  adresse: 'Adresse',
  telephone: 'Téléphone',
  email: 'E-mail',
  medecinTraitant: 'Médecin traitant',
  consentementSms: 'Contact par SMS',
  consentementEmail: 'Contact par e-mail',
  consentementCourrier: 'Contact par courrier',
  amo: 'Couverture AMO',
  amc: 'Couverture AMC',
};

export type SourceFusion = 'conservee' | 'doublon';
export type ChoixFusion = Partial<Readonly<Record<ChampFusion, SourceFusion>>>;
export type FicheFusion = Readonly<Record<ChampFusion, unknown>> & {
  readonly notes: string | null;
};

function estVide(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined || valeur === '') {
    return true;
  }
  if (typeof valeur === 'object' && !Array.isArray(valeur)) {
    return Object.values(valeur).every(estVide);
  }
  return false;
}

/** Champs dont la valeur diffère entre les deux fiches, dans l'ordre d'affichage. */
export function champsDifferents(conservee: FicheFusion, doublon: FicheFusion): ChampFusion[] {
  return CHAMPS_FUSION.filter(
    (champ) => JSON.stringify(conservee[champ]) !== JSON.stringify(doublon[champ]),
  );
}

/** Source proposée par défaut : la fiche conservée, sauf si elle est vide et le doublon renseigné. */
export function sourceParDefaut(
  conservee: FicheFusion,
  doublon: FicheFusion,
  champ: ChampFusion,
): SourceFusion {
  return estVide(conservee[champ]) && !estVide(doublon[champ]) ? 'doublon' : 'conservee';
}

/**
 * Fiche obtenue par la fusion : chaque champ vient de la source choisie (à défaut, `sourceParDefaut`),
 * les notes des deux fiches sont mises bout à bout (sans répétition).
 */
export function fusionnerFiches<F extends FicheFusion>(
  conservee: F,
  doublon: F,
  choix: ChoixFusion,
): F {
  const resultat: Record<string, unknown> = { ...conservee };
  for (const champ of CHAMPS_FUSION) {
    const source = choix[champ] ?? sourceParDefaut(conservee, doublon, champ);
    if (source === 'doublon') {
      resultat[champ] = doublon[champ];
    }
  }
  const notes = [conservee.notes, doublon.notes]
    .map((n) => n?.trim() ?? '')
    .filter((n, index, liste) => n !== '' && liste.indexOf(n) === index);
  resultat.notes = notes.length === 0 ? null : notes.join('\n\n');
  return resultat as F;
}
