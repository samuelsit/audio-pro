import { z } from 'zod';

import { dateCalendaireSchema } from '../commun/date';
import { texteOptionnelSchema } from '../commun/texte';

export const SOURCES_MESURE = ['SAISIE', 'NOAH'] as const;
export type SourceMesure = (typeof SOURCES_MESURE)[number];

export const LIBELLES_SOURCES_MESURE: Readonly<Record<SourceMesure, string>> = {
  SAISIE: 'Saisie',
  NOAH: 'NOAH',
};

export const TYPES_MESURE = ['TONALE', 'VOCALE_CALME', 'VOCALE_BRUIT'] as const;
export type TypeMesure = (typeof TYPES_MESURE)[number];

export const LIBELLES_TYPES_MESURE: Readonly<Record<TypeMesure, string>> = {
  TONALE: 'Audiométrie tonale',
  VOCALE_CALME: 'Audiométrie vocale dans le calme',
  VOCALE_BRUIT: 'Audiométrie vocale dans le bruit',
};

/** Version du JSON de `donnees`, relue à chaque déchiffrement. */
export const VERSION_SCHEMA_MESURE = 1;

/** Métadonnées d'une mesure saisie. Une mesure NOAH ajoutera les siennes à l'étape 24. */
export const metadonneesMesureSchema = z.object({
  appareil: texteOptionnelSchema.pipe(z.string().max(120, '120 caractères au maximum.').nullable()),
});

export const bilanSaisieSchema = z.object({ dateBilan: dateCalendaireSchema });
export type BilanSaisie = z.output<typeof bilanSaisieSchema>;
