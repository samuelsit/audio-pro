import type { Oreille } from '../audio-rules/code-prestation';
import type { OreilleDossier } from '../audio-rules/controle-prescription';
import type { TypeAppareillage } from '../audio-rules/prescription';

export const OREILLES_DOSSIER = ['DROITE', 'GAUCHE', 'LES_DEUX'] as const;
export type OreillesDossier = (typeof OREILLES_DOSSIER)[number];

export const LIBELLES_OREILLES_DOSSIER: Readonly<Record<OreillesDossier, string>> = {
  DROITE: 'Oreille droite',
  GAUCHE: 'Oreille gauche',
  LES_DEUX: 'Les deux oreilles',
};

export const LIBELLES_TYPES_APPAREILLAGE: Readonly<Record<TypeAppareillage, string>> = {
  PRIMO: 'Premier appareillage',
  RENOUVELLEMENT: 'Renouvellement',
};

export type TypeGlobalDossier = TypeAppareillage | 'MIXTE';

export const LIBELLES_TYPES_GLOBAUX: Readonly<Record<TypeGlobalDossier, string>> = {
  ...LIBELLES_TYPES_APPAREILLAGE,
  MIXTE: 'Mixte',
};

export function oreillesConcernees(oreilles: OreillesDossier): readonly Oreille[] {
  return oreilles === 'LES_DEUX' ? ['DROITE', 'GAUCHE'] : [oreilles];
}

export interface TypesOreilles {
  readonly typeDroite: TypeAppareillage | null;
  readonly typeGauche: TypeAppareillage | null;
}

/** Oreilles appareillées avec leur type : le devis normalisé (p. 1) le demande oreille par oreille. */
export function oreillesDuDossier({ typeDroite, typeGauche }: TypesOreilles): OreilleDossier[] {
  return [
    ...(typeDroite === null ? [] : [{ oreille: 'DROITE' as const, type: typeDroite }]),
    ...(typeGauche === null ? [] : [{ oreille: 'GAUCHE' as const, type: typeGauche }]),
  ];
}

export function typeGlobal({ typeDroite, typeGauche }: TypesOreilles): TypeGlobalDossier | null {
  const type = typeDroite ?? typeGauche;
  if (typeDroite !== null && typeGauche !== null && typeDroite !== typeGauche) {
    return 'MIXTE';
  }
  return type;
}
